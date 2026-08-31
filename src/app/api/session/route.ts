/* ============ /api/session — login (POST), current user (GET), logout (DELETE) ============ */
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser, toSessionUser } from '@/lib/crm-server'
import { logAudit } from '@/lib/audit'

export const dynamic = 'force-dynamic'

const COOKIE = 'crm_session'
const COOKIE_OPTS = {
  httpOnly: true as const,
  sameSite: 'lax' as const,
  path: '/',
  maxAge: 60 * 60 * 24 * 30, // 30 days
}

/** GET → { user: SessionUser | null } */
export async function GET() {
  const user = await getSessionUser()
  return NextResponse.json({ user })
}

/** POST { email } → set cookie + audit LOGIN */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : ''
  if (!email) {
    return NextResponse.json({ error: 'Email wajib diisi' }, { status: 400 })
  }

  // SQLite `contains` is case-sensitive → resolve case-insensitively in JS.
  const users = await db.user.findMany({
    where: { isActive: true },
    include: { brandAccess: { select: { brandId: true } } },
  })
  const user = users.find((u) => u.email.toLowerCase() === email)
  if (!user) {
    return NextResponse.json({ error: 'User tidak ditemukan' }, { status: 404 })
  }

  await logAudit({
    userId: user.id,
    userName: user.name,
    action: 'LOGIN',
    entityType: 'User',
    entityId: user.id,
    entityLabel: user.name,
    newValue: { email: user.email },
    req,
  })

  const res = NextResponse.json({ user: toSessionUser(user) })
  res.cookies.set(COOKIE, user.id, COOKIE_OPTS)
  return res
}

/** DELETE → clear cookie + audit LOGOUT */
export async function DELETE(req: NextRequest) {
  const session = await getSessionUser()
  if (session) {
    await logAudit({
      userId: session.id,
      userName: session.name,
      action: 'LOGOUT',
      entityType: 'User',
      entityId: session.id,
      entityLabel: session.name,
      req,
    })
  }
  const res = NextResponse.json({ ok: true })
  res.cookies.set(COOKIE, '', { ...COOKIE_OPTS, maxAge: 0 })
  return res
}

/* ============ /api/duplicates — detect duplicate contacts ============ */
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser, mapContact, contactInclude } from '@/lib/crm-server'
import type { DuplicateCandidate } from '@/lib/crm-types'

export const dynamic = 'force-dynamic'

const normEmail = (e?: string | null): string | null => {
  const v = (e ?? '').trim().toLowerCase()
  return v || null
}
const normPhone = (p?: string | null): string | null => {
  const digits = (p ?? '').replace(/\D/g, '')
  return digits.length >= 10 ? digits.slice(-10) : null
}

/** GET → DuplicateCandidate[] (max 20) */
export async function GET() {
  const session = await getSessionUser()
  if (!session) return NextResponse.json({ error: 'Belum login' }, { status: 401 })

  const contacts = await db.contact.findMany({
    where: { isDeleted: false },
    include: contactInclude,
    orderBy: { createdAt: 'asc' },
  })

  const emailMap = new Map<string, typeof contacts>()
  const whatsappMap = new Map<string, typeof contacts>()
  const phoneMap = new Map<string, typeof contacts>()
  for (const c of contacts) {
    const e = normEmail(c.email) ?? normEmail(c.altEmail)
    if (e) emailMap.set(e, [...(emailMap.get(e) ?? []), c])
    const w = normPhone(c.whatsapp)
    if (w) whatsappMap.set(w, [...(whatsappMap.get(w) ?? []), c])
    const p = normPhone(c.phone)
    if (p) phoneMap.set(p, [...(phoneMap.get(p) ?? []), c])
  }

  const results: DuplicateCandidate[] = []
  const seenPairs = new Set<string>()
  const pushPairs = (
    map: Map<string, typeof contacts>,
    matchType: DuplicateCandidate['matchType'],
    matchValueOf: (key: string) => string,
  ) => {
    for (const [key, group] of map) {
      if (group.length < 2) continue
      for (let a = 0; a < group.length; a++) {
        for (let b = a + 1; b < group.length; b++) {
          const first = group[a]
          const second = group[b]
          const pairKey = [first.id, second.id].sort().join('::')
          if (seenPairs.has(pairKey)) continue
          seenPairs.add(pairKey)
          results.push({
            contactA: mapContact(first),
            contactB: mapContact(second),
            matchType,
            matchValue: matchValueOf(key),
          })
        }
      }
    }
  }

  // priority: EMAIL > WHATSAPP > PHONE (a pair is reported once with its strongest signal)
  pushPairs(emailMap, 'EMAIL', (k) => k)
  pushPairs(whatsappMap, 'WHATSAPP', (k) => k)
  pushPairs(phoneMap, 'PHONE', (k) => k)

  return NextResponse.json(results.slice(0, 20))
}

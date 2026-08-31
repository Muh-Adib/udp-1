/* ============ Multi-Brand CRM — Audit logging helper ============ */
import { db } from '@/lib/db'

/** Serialize oldValue/newValue safely as JSON string, truncated to 2000 chars. */
function safeSerialize(value: unknown): string | null {
  if (value === undefined || value === null) return null
  try {
    const str = typeof value === 'string' ? value : JSON.stringify(value)
    return str.length > 2000 ? str.slice(0, 2000) : str
  } catch {
    return null
  }
}

function extractIp(req?: Request): string {
  const fwd = req?.headers.get('x-forwarded-for')
  if (fwd) return fwd.split(',')[0].trim()
  return req?.headers.get('x-real-ip') ?? '127.0.0.1'
}

export async function logAudit(data: {
  userId?: string | null
  userName?: string | null
  action: string
  entityType: string
  entityId?: string
  entityLabel?: string
  oldValue?: unknown
  newValue?: unknown
  req?: Request
}): Promise<void> {
  try {
    await db.auditLog.create({
      data: {
        userId: data.userId ?? null,
        userName: data.userName ?? null,
        action: data.action,
        entityType: data.entityType,
        entityId: data.entityId ?? null,
        entityLabel: data.entityLabel ?? null,
        oldValue: safeSerialize(data.oldValue),
        newValue: safeSerialize(data.newValue),
        ip: extractIp(data.req),
        userAgent: data.req?.headers.get('user-agent') ?? null,
      },
    })
  } catch (err) {
    // Audit logging must never break the main flow — log and swallow.
    console.error('[audit] gagal mencatat audit log:', err)
  }
}

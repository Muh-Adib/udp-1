/* ============ CRM Shared UI Primitives ============ */
'use client'

import React from 'react'
import { cn } from '@/lib/utils'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Mail, MessageCircle, Instagram, Globe, Phone, Users, Flame, CloudSun, Snowflake,
} from 'lucide-react'
import { stageMeta, channelMeta, priorityMeta, temperatureMeta, initials } from '@/lib/crm-constants'

/* ---------- Brand chip ---------- */
export function BrandChip({ name, color, size = 'sm' }: { name: string; color: string; size?: 'sm' | 'xs' }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full font-medium whitespace-nowrap',
        size === 'sm' ? 'px-2.5 py-0.5 text-xs' : 'px-2 py-0.5 text-[11px]',
      )}
      style={{ backgroundColor: `${color}14`, color, border: `1px solid ${color}30` }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} />
      {name}
    </span>
  )
}

/* ---------- Stage badge ---------- */
export function StageBadge({ stage }: { stage: string }) {
  const meta = stageMeta(stage)
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium', meta.bg, meta.color)}>
      <span className={cn('h-1.5 w-1.5 rounded-full', meta.dot)} />
      {meta.label}
    </span>
  )
}

/* ---------- Priority badge ---------- */
export function PriorityBadge({ priority }: { priority: string }) {
  const meta = priorityMeta(priority)
  return <span className={cn('inline-flex rounded-md px-2 py-0.5 text-[11px] font-semibold', meta.bg, meta.color)}>{meta.label}</span>
}

/* ---------- Temperature badge ---------- */
export function TempBadge({ temperature }: { temperature: string }) {
  const meta = temperatureMeta(temperature)
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold', meta.bg, meta.color)}>
      <span>{meta.emoji}</span>{meta.label}
    </span>
  )
}

/* ---------- Temperature icon only ---------- */
export function TempIcon({ temperature, className }: { temperature: string; className?: string }) {
  const t = temperature
  if (t === 'HOT') return <Flame className={cn('h-3.5 w-3.5 text-rose-500', className)} />
  if (t === 'COLD') return <Snowflake className={cn('h-3.5 w-3.5 text-teal-500', className)} />
  return <CloudSun className={cn('h-3.5 w-3.5 text-amber-500', className)} />
}

/* ---------- Channel icon ---------- */
export function ChannelIcon({ channel, className }: { channel: string; className?: string }) {
  const cls = cn('h-3.5 w-3.5', className)
  const meta = channelMeta(channel)
  switch (channel) {
    case 'WHATSAPP': return <MessageCircle className={cn(cls, meta.color)} />
    case 'EMAIL': return <Mail className={cn(cls, meta.color)} />
    case 'INSTAGRAM': return <Instagram className={cn(cls, meta.color)} />
    case 'WEBSITE': return <Globe className={cn(cls, meta.color)} />
    case 'PHONE': return <Phone className={cn(cls, meta.color)} />
    case 'MEETING': return <Users className={cn(cls, meta.color)} />
    default: return <Globe className={cls} />
  }
}

/* ---------- Avatar ---------- */
export function UserAvatar({ name, color, size = 28, className }: { name: string; color?: string | null; size?: number; className?: string }) {
  return (
    <Avatar className={cn('border border-white shadow-sm', className)} style={{ width: size, height: size }}>
      <AvatarFallback
        className="text-white font-semibold"
        style={{ backgroundColor: color ?? '#64748b', fontSize: Math.max(9, size * 0.38) }}
      >
        {initials(name)}
      </AvatarFallback>
    </Avatar>
  )
}

/* ---------- Empty state ---------- */
export function EmptyState({ icon, title, description, action }: {
  icon?: React.ReactNode; title: string; description?: string; action?: React.ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-slate-200 bg-slate-50/50 px-6 py-12 text-center">
      {icon && <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">{icon}</div>}
      <div>
        <p className="text-sm font-medium text-slate-700">{title}</p>
        {description && <p className="mt-1 max-w-md text-xs leading-relaxed text-slate-500">{description}</p>}
      </div>
      {action}
    </div>
  )
}

/* ---------- Section header ---------- */
export function SectionHeader({ title, description, action }: { title: string; description?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 className="text-base font-semibold text-slate-900">{title}</h2>
        {description && <p className="text-sm text-slate-500">{description}</p>}
      </div>
      {action}
    </div>
  )
}

/* ---------- Loading skeleton rows ---------- */
export function LoadingRows({ rows = 4, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn('space-y-2', className)}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-12 animate-pulse rounded-lg bg-slate-100" style={{ animationDelay: `${i * 90}ms` }} />
      ))}
    </div>
  )
}

/* ---------- Refresh button ---------- */
export function RefreshButton({ onClick, loading }: { onClick: () => void; loading?: boolean }) {
  return (
    <Button variant="outline" size="sm" onClick={onClick} disabled={loading} className="h-9 gap-2">
      <svg className={cn('h-3.5 w-3.5', loading && 'animate-spin')} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.85.99 6.57 2.57L21 8" />
        <path d="M21 3v5h-5" />
      </svg>
      Refresh
    </Button>
  )
}

/** Unduh array baris sebagai CSV (; separator, quote-escaped, UTF-8 BOM agar Excel id-ID benar). */
export function downloadCsv(filename: string, headers: string[], rows: (string | number | null | undefined)[][]) {
  const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`
  const lines = [headers.join(';'), ...rows.map((r) => r.map(esc).join(';'))]
  const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

'use client'

/**
 * Notification Bell (R10, diperbarui 11-c & 13-c) — pusat notifikasi in-app di topbar.
 * - Fetch awal saat mount (badge tampil sebelum popover dibuka) + fetch saat popover dibuka (throttle 30 dtk).
 * - Poll berkala terus-menerus: 120 dtk saat popover tertutup, 90 dtk selama terbuka; skip bila tab hidden.
 * - Read-tracking murni client (localStorage per user, kap 200 key terbaru).
 * - 13-c: preferensi mute per tipe ("Pengaturan notifikasi") — persist di localStorage per user
 *   (key crm-notif-muted-{userId}); tipe di-mute disaring client-side dari daftar, badge unread,
 *   dan hitungan kritis — tanpa refetch.
 * - Error fetch ditangani graceful: tampil empty state, retry otomatis pada siklus poll berikutnya.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  BadgeCheck, Bell, CalendarClock, ChevronDown, FileWarning, Loader2, MessagesSquare, ReceiptText, Settings2, Timer,
  type LucideIcon,
} from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { useCrmStore, type ViewKey } from '@/components/crm/crm-store'
import { notificationsApi } from '@/components/crm/api-client'
import type { NotificationDTO, NotificationType, NotificationsResponseDTO } from '@/lib/crm-types'
import { cn } from '@/lib/utils'

const READ_CAP = 200
const FETCH_THROTTLE_MS = 30_000
const POLL_INTERVAL_MS = 90_000
const POLL_INTERVAL_CLOSED_MS = 120_000

/* Label Indonesia semua tipe notifikasi (panel pengaturan mute 13-c) */
const NOTIF_TYPE_LABELS: Record<NotificationType, string> = {
  SLA: 'SLA respons lead',
  APPROVAL: 'Persetujuan diskon',
  INVOICE_DUE: 'Invoice jatuh tempo',
  TASK_DUE: 'Tenggat tugas',
  QUOTATION_EXPIRY: 'Penawaran kedaluwarsa',
  PORTAL_COMMENT: 'Komentar portal client',
}
const NOTIF_TYPES = Object.keys(NOTIF_TYPE_LABELS) as NotificationType[]

/* Ikon + warna tile per tipe notifikasi (INVOICE_DUE critical dioverride di bawah) */
const TYPE_META: Record<NotificationDTO['type'], { icon: LucideIcon; tile: string }> = {
  SLA: { icon: Timer, tile: 'bg-rose-50 text-rose-600' },
  APPROVAL: { icon: BadgeCheck, tile: 'bg-orange-50 text-orange-600' },
  INVOICE_DUE: { icon: ReceiptText, tile: 'bg-amber-50 text-amber-600' },
  TASK_DUE: { icon: CalendarClock, tile: 'bg-teal-50 text-teal-600' },
  QUOTATION_EXPIRY: { icon: FileWarning, tile: 'bg-slate-100 text-slate-500' },
  PORTAL_COMMENT: { icon: MessagesSquare, tile: 'bg-violet-50 text-violet-600' },
}

function tileClass(n: NotificationDTO): string {
  if (n.type === 'INVOICE_DUE' && n.severity === 'critical') return 'bg-rose-50 text-rose-600'
  return TYPE_META[n.type].tile
}

/** Waktu relatif berbahasa Indonesia: "baru saja", "X menit lalu", "X jam lalu", "X hari lalu" */
function formatRelative(iso: string): string {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ''
  const minutes = Math.floor((Date.now() - then) / 60_000)
  if (minutes < 1) return 'baru saja'
  if (minutes < 60) return `${minutes} menit lalu`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} jam lalu`
  return `${Math.floor(hours / 24)} hari lalu`
}

export function NotificationBell() {
  const user = useCrmStore((s) => s.user)
  const setView = useCrmStore((s) => s.setView)
  const openOpportunity = useCrmStore((s) => s.openOpportunity)

  const [open, setOpen] = useState(false)
  const [data, setData] = useState<NotificationsResponseDTO | null>(null)
  const [loading, setLoading] = useState(false)
  const [readKeys, setReadKeys] = useState<string[]>([])
  const [muted, setMuted] = useState<string[]>([])
  const [settingsOpen, setSettingsOpen] = useState(false)
  const lastFetchedRef = useRef<number>(0)

  const storageKey = user ? `crm-notif-read:${user.id}` : null
  const mutedStorageKey = user ? `crm-notif-muted-${user.id}` : null

  /* Muat daftar key yang sudah dibaca dari localStorage (per user) */
  useEffect(() => {
    if (!user) { setReadKeys([]); return }
    try {
      const raw = localStorage.getItem(`crm-notif-read:${user.id}`)
      const parsed: unknown = raw ? JSON.parse(raw) : []
      setReadKeys(
        Array.isArray(parsed)
          ? parsed.filter((k): k is string => typeof k === 'string').slice(-READ_CAP)
          : [],
      )
    } catch {
      setReadKeys([])
    }
  }, [user])

  const persistRead = useCallback((keys: string[]) => {
    const capped = Array.from(new Set(keys)).slice(-READ_CAP) // buang yang terlama
    setReadKeys(capped)
    if (!storageKey) return
    try { localStorage.setItem(storageKey, JSON.stringify(capped)) } catch { /* storage penuh / private mode */ }
  }, [storageKey])

  /* Muat tipe yang di-mute dari localStorage (per user); guard JSON.parse */
  useEffect(() => {
    if (!user) { setMuted([]); return }
    try {
      const raw = localStorage.getItem(`crm-notif-muted-${user.id}`)
      const parsed: unknown = raw ? JSON.parse(raw) : []
      setMuted(Array.isArray(parsed) ? parsed.filter((k): k is string => typeof k === 'string') : [])
    } catch {
      setMuted([])
    }
  }, [user])

  /* Toggle mute per tipe — apply instan (filter client-side) + persist ke localStorage */
  const toggleMuted = useCallback((type: string) => {
    setMuted((prev) => {
      const next = prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
      if (mutedStorageKey) {
        try { localStorage.setItem(mutedStorageKey, JSON.stringify(next)) } catch { /* storage penuh / private mode */ }
      }
      return next
    })
  }, [mutedStorageKey])

  const fetchNotifications = useCallback(async (force = false) => {
    if (!force && Date.now() - lastFetchedRef.current < FETCH_THROTTLE_MS) return
    lastFetchedRef.current = Date.now()
    setLoading(true)
    try {
      const res = await notificationsApi.list()
      setData(res)
    } catch {
      // Gagal fetch: reset throttle agar dibuka berikutnya langsung retry; data lama (bila ada) tetap tampil.
      lastFetchedRef.current = 0
    } finally {
      setLoading(false)
    }
  }, [])

  const handleOpenChange = useCallback((next: boolean) => {
    setOpen(next)
    if (next) void fetchNotifications()
  }, [fetchNotifications])

  /* Fetch awal saat user aktif — badge terlihat bahkan sebelum popover pernah dibuka */
  useEffect(() => {
    if (!user) return
    void fetchNotifications()
  }, [user, fetchNotifications])

  /* Poll berkala terus-menerus: 120 dtk saat tertutup, 90 dtk saat terbuka; skip saat tab tidak terlihat */
  useEffect(() => {
    const id = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return
      void fetchNotifications()
    }, open ? POLL_INTERVAL_MS : POLL_INTERVAL_CLOSED_MS)
    return () => clearInterval(id)
  }, [open, fetchNotifications])

  const items = data?.items ?? []
  /* Tipe yang di-mute disaring client-side: dari daftar, badge unread, dan hitungan kritis */
  const visibleItems = useMemo(() => items.filter((n) => !muted.includes(n.type)), [items, muted])
  const criticalCount = useMemo(
    () => visibleItems.filter((n) => n.severity === 'critical').length,
    [visibleItems],
  )
  const unreadCount = useMemo(
    () => visibleItems.filter((n) => !readKeys.includes(n.key)).length,
    [visibleItems, readKeys],
  )
  const hasCriticalUnread = useMemo(
    () => visibleItems.some((n) => n.severity === 'critical' && !readKeys.includes(n.key)),
    [visibleItems, readKeys],
  )

  const handleItemClick = useCallback((n: NotificationDTO) => {
    persistRead([...readKeys, n.key])
    if (n.opportunityId) openOpportunity(n.opportunityId)
    else setView(n.targetView as ViewKey)
    setOpen(false)
  }, [persistRead, readKeys, openOpportunity, setView])

  const handleMarkAllRead = useCallback(() => {
    // Hanya item yang terlihat (tipe di-mute tidak ikut ditandai)
    persistRead([...readKeys, ...visibleItems.map((n) => n.key)])
  }, [persistRead, readKeys, visibleItems])

  /* Sembunyikan total untuk role CLIENT (portal tidak punya notifikasi internal) */
  if (!user || user.role === 'CLIENT') return null

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={`Notifikasi${unreadCount > 0 ? ` (${unreadCount} belum dibaca)` : ''}`}
          className="relative h-9 w-9 shrink-0 rounded-full text-slate-500 hover:bg-slate-100 hover:text-slate-900"
        >
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <span
              className={cn(
                'absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white ring-2 ring-white',
                hasCriticalUnread && 'animate-pulse',
              )}
            >
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[380px] p-0">
        {/* Header */}
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div className="flex items-center gap-2">
            <p className="text-sm font-bold text-slate-900">Notifikasi</p>
            {loading && <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" />}
          </div>
          <div className="flex items-center gap-1.5">
            {criticalCount > 0 && (
              <span className="text-[11px] font-semibold text-rose-600">{criticalCount} kritis</span>
            )}
            <Button
              variant="ghost"
              size="sm"
              disabled={unreadCount === 0}
              onClick={handleMarkAllRead}
              className="h-7 px-2 text-xs text-slate-500 hover:text-slate-900"
            >
              Tandai dibaca
            </Button>
          </div>
        </div>

        {/* List / spinner / empty state */}
        {loading && !data ? (
          <div className="flex h-40 items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
          </div>
        ) : visibleItems.length === 0 ? (
          <div className="py-10 text-center">
            <Bell className="mx-auto h-8 w-8 text-slate-200" />
            <p className="mt-2 text-xs text-slate-400">Tidak ada notifikasi</p>
            <p className="mt-0.5 text-[11px] text-slate-400">
              {items.length > 0
                ? 'Semua tipe notifikasi dimatikan — buka Pengaturan notifikasi.'
                : 'Semua aman — tidak ada peringatan aktif.'}
            </p>
          </div>
        ) : (
          <div className="max-h-[420px] divide-y divide-slate-100 overflow-y-auto [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-300 [&::-webkit-scrollbar-track]:bg-slate-50">
            {visibleItems.map((n) => {
              const unread = !readKeys.includes(n.key)
              const Icon = TYPE_META[n.type].icon
              return (
                <button
                  key={n.key}
                  type="button"
                  onClick={() => handleItemClick(n)}
                  className={cn(
                    'relative flex w-full gap-3 py-3 pr-4 text-left transition-colors hover:bg-slate-50',
                    unread ? 'pl-6' : 'pl-4',
                  )}
                >
                  {unread && (
                    <span className="absolute left-1.5 top-1/2 h-2 w-2 -translate-y-1/2 rounded-full bg-teal-500" />
                  )}
                  <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', tileClass(n))}>
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-start justify-between gap-2">
                      <span className="line-clamp-1 text-xs font-semibold text-slate-800">{n.title}</span>
                      <span className="shrink-0 text-[10px] text-slate-400">{formatRelative(n.createdAt)}</span>
                    </span>
                    <span className="mt-0.5 line-clamp-2 block text-[11px] text-slate-500">{n.description}</span>
                    {n.metric && (
                      <span className="mt-1.5 inline-flex rounded-md bg-slate-50 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600 ring-1 ring-slate-200">
                        {n.metric}
                      </span>
                    )}
                  </span>
                </button>
              )
            })}
          </div>
        )}

        {/* Pengaturan notifikasi — mute per tipe (13-c, persist localStorage per user).
            CATATAN R13: baris memakai div + onClick (bukan label/htmlFor) — label forwarding
            di dalam Radix Popover memicu double-toggle/close pada beberapa build. */}
        <div className="border-t">
          <button
            type="button"
            onClick={() => setSettingsOpen((v) => !v)}
            aria-expanded={settingsOpen}
            className="flex min-h-[44px] w-full items-center gap-2 px-4 py-2 text-left text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-slate-400/60"
          >
            <Settings2 className="h-3.5 w-3.5 shrink-0 text-slate-400" />
            Pengaturan notifikasi
            {muted.length > 0 && (
              <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">
                {muted.length} dimatikan
              </span>
            )}
            <ChevronDown className={cn('ml-auto h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform', settingsOpen && 'rotate-180')} aria-hidden />
          </button>
          {settingsOpen && (
            <div className="max-h-[264px] overflow-y-auto border-t bg-slate-50/60 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-300 [&::-webkit-scrollbar-track]:bg-transparent">
              {NOTIF_TYPES.map((type) => {
                const active = !muted.includes(type)
                return (
                  <div
                    key={type}
                    role="group"
                    aria-label={`${NOTIF_TYPE_LABELS[type]} — ${active ? 'aktif' : 'dimatikan'}`}
                    className="flex min-h-[44px] cursor-pointer items-center justify-between gap-3 px-4 py-2 transition-colors hover:bg-slate-100/70"
                  >
                    <span className="min-w-0 text-xs font-medium text-slate-700">{NOTIF_TYPE_LABELS[type]}</span>
                    <Switch
                      checked={active}
                      onCheckedChange={() => toggleMuted(type)}
                      aria-label={`${NOTIF_TYPE_LABELS[type]} — ${active ? 'aktif' : 'dimatikan'}`}
                      className="shrink-0"
                    />
                  </div>
                )
              })}
              <p className="px-4 py-2 text-[10px] leading-relaxed text-slate-400">
                Matikan tipe yang tidak relevan — tersimpan per pengguna di perangkat ini.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t px-4 py-2 text-center text-[10px] text-slate-400">
          Pembaruan otomatis setiap 90–120 detik
        </div>
      </PopoverContent>
    </Popover>
  )
}

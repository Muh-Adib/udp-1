/* ============ Login View — pilih user demo per role ============ */
'use client'

import React, { useState } from 'react'
import { crmApi } from './api-client'
import type { UserDTO } from '@/lib/crm-types'
import { roleMeta } from '@/lib/crm-constants'
import { UserAvatar } from './shared'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Loader2, LogIn, ShieldCheck } from 'lucide-react'
import { cn } from '@/lib/utils'

/* Role pill + aksen ring avatar — palet per role (dipakai hanya di picker login) */
const ROLE_UI: Record<string, { badge: string; ring: string }> = {
  MARKETING: { badge: 'bg-teal-50 text-teal-700', ring: 'ring-teal-100' },
  DIREKTUR: { badge: 'bg-slate-900 text-white', ring: 'ring-slate-200' },
  KEUANGAN: { badge: 'bg-amber-50 text-amber-700', ring: 'ring-amber-100' },
  PRODUKSI: { badge: 'bg-orange-50 text-orange-700', ring: 'ring-orange-100' },
  SUPER_ADMIN: { badge: 'bg-violet-50 text-violet-700', ring: 'ring-violet-100' },
  CLIENT: { badge: 'bg-emerald-50 text-emerald-700', ring: 'ring-emerald-100' },
}
const FALLBACK_ROLE_UI = { badge: 'bg-slate-100 text-slate-600', ring: 'ring-slate-100' }

export default function LoginView({ users, onLogin }: { users: UserDTO[]; onLogin: (u: UserDTO) => Promise<void> }) {
  const [loadingEmail, setLoadingEmail] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleLogin = async (user: UserDTO) => {
    setLoadingEmail(user.email)
    setError(null)
    try {
      await crmApi.login(user.email)
      await onLogin(user)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Login gagal')
    } finally {
      setLoadingEmail(null)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-100 via-white to-teal-50 px-4 py-10">
      <div className="w-full max-w-3xl">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-slate-900 via-slate-800 to-teal-700 text-white shadow-lg shadow-teal-900/20 ring-1 ring-white/10">
            <ShieldCheck className="h-7 w-7" />
          </div>
          <h1 className="bg-gradient-to-r from-slate-900 via-slate-700 to-teal-700 bg-clip-text text-2xl font-bold tracking-tight text-transparent">Grupa Kreasi CRM</h1>
          <p className="mt-1.5 text-sm text-slate-500">Multi-Brand Command Center</p>
          <p className="mt-0.5 text-xs font-medium tracking-wide text-slate-400">Unimasi · Segia Tech · Erfo Multimedia · Unicam Studio</p>
        </div>

        <Card className="border-slate-200 shadow-xl shadow-slate-200/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Masuk sebagai</CardTitle>
            <CardDescription>
              Demo environment: pilih profil user untuk masuk dengan role & hak akses terkait. Setiap aksi tercatat di audit log.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {error && (
              <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              {users.map((u) => {
                const role = roleMeta(u.role)
                const ui = ROLE_UI[u.role] ?? FALLBACK_ROLE_UI
                return (
                  <button
                    key={u.id}
                    onClick={() => handleLogin(u)}
                    disabled={loadingEmail !== null}
                    className={cn(
                      'group flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-3.5 text-left transition-all',
                      'hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md disabled:cursor-wait disabled:opacity-60',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2',
                    )}
                  >
                    <span className={cn('shrink-0 rounded-full ring-2 ring-offset-1 ring-offset-white', ui.ring)} aria-hidden>
                      <UserAvatar name={u.name} color={u.avatarColor} size={40} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <p className="truncate text-sm font-semibold text-slate-900">{u.name}</p>
                        <Badge className={cn('border-0 px-2 py-0.5 text-[10px] font-semibold', ui.badge)} variant="secondary">{role.label}</Badge>
                      </div>
                      <p className="truncate text-xs text-slate-500">{u.email}</p>
                      <p className="mt-1 line-clamp-2 text-[11px] leading-snug text-slate-400">{role.description}</p>
                    </div>
                    <div className="pt-1">
                      {loadingEmail === u.email
                        ? <Loader2 className="h-4 w-4 animate-spin text-teal-600" />
                        : <LogIn className="h-4 w-4 text-slate-300 transition-colors group-hover:text-teal-600" />}
                    </div>
                  </button>
                )
              })}
            </div>
          </CardContent>
        </Card>

        <p className="mx-auto mt-6 max-w-md text-center text-xs leading-relaxed text-slate-400">
          MVP • Authentication, role-based access, audit logging aktif • Data demo: 4 brand, 10 perusahaan, 16 opportunity
        </p>
      </div>
    </div>
  )
}

'use client'

import React, { useCallback, useEffect, useState } from 'react'
import { useCrmStore, type ViewKey, can } from '@/components/crm/crm-store'
import { crmApi } from '@/components/crm/api-client'
import LoginView from '@/components/crm/login-view'
import ClientPortalView from '@/components/crm/portal-view'
import DashboardView from '@/components/crm/dashboard-view'
import InboxView from '@/components/crm/inbox-view'
import ContactsView from '@/components/crm/contacts-view'
import PipelineView from '@/components/crm/pipeline-view'
import FollowUpView from '@/components/crm/followup-view'
import ProjectsView from '@/components/crm/projects-view'
import QuotationsView from '@/components/crm/quotations-view'
import FinanceView from '@/components/crm/finance-view'
import BrandsView from '@/components/crm/brands-view'
import UsersView from '@/components/crm/users-view'
import AuditView from '@/components/crm/audit-view'
import NewLeadDialog from '@/components/crm/new-lead-dialog'
import { NotificationBell } from '@/components/crm/notification-bell'
import { UserAvatar } from '@/components/crm/shared'
import { roleMeta } from '@/lib/crm-constants'
import type { UserDTO } from '@/lib/crm-types'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import {
  LayoutDashboard, Inbox, Contact2, KanbanSquare, Repeat, FolderKanban,
  Building2, UsersRound, ScrollText, LogOut, Menu, Plus, Loader2, FileText, Wallet,
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

const NAV: { key: ViewKey; label: string; icon: React.ElementType; roles: string[]; hint?: string }[] = [
  { key: 'portal', label: 'Client Portal', icon: LayoutDashboard, roles: ['CLIENT'] },
  { key: 'dashboard', label: 'Command Center', icon: LayoutDashboard, roles: ['SUPER_ADMIN', 'DIREKTUR', 'MARKETING', 'KEUANGAN', 'PRODUKSI'] },
  { key: 'inbox', label: 'Lead Inbox', icon: Inbox, roles: ['SUPER_ADMIN', 'DIREKTUR', 'MARKETING'], hint: 'Omnichannel' },
  { key: 'contacts', label: 'Contacts & Companies', icon: Contact2, roles: ['SUPER_ADMIN', 'DIREKTUR', 'MARKETING', 'KEUANGAN', 'PRODUKSI'] },
  { key: 'pipeline', label: 'Sales Pipeline', icon: KanbanSquare, roles: ['SUPER_ADMIN', 'DIREKTUR', 'MARKETING', 'KEUANGAN', 'PRODUKSI'] },
  { key: 'followup', label: 'Follow-up', icon: Repeat, roles: ['SUPER_ADMIN', 'DIREKTUR', 'MARKETING'] },
  { key: 'projects', label: 'Projects', icon: FolderKanban, roles: ['SUPER_ADMIN', 'DIREKTUR', 'MARKETING', 'KEUANGAN', 'PRODUKSI'] },
  { key: 'quotations', label: 'Quotations', icon: FileText, roles: ['SUPER_ADMIN', 'DIREKTUR', 'MARKETING', 'KEUANGAN'] },
  { key: 'finance', label: 'Finance', icon: Wallet, roles: ['SUPER_ADMIN', 'DIREKTUR', 'KEUANGAN'] },
  { key: 'brands', label: 'Brand Configuration', icon: Building2, roles: ['SUPER_ADMIN', 'DIREKTUR'] },
  { key: 'users', label: 'User & Access', icon: UsersRound, roles: ['SUPER_ADMIN'] },
  { key: 'audit', label: 'Audit Logs', icon: ScrollText, roles: ['SUPER_ADMIN', 'DIREKTUR'] },
]

const VIEW_TITLES: Record<ViewKey, { title: string; subtitle: string }> = {
  portal: { title: 'Client Portal', subtitle: 'Proyek, penawaran, dan invoice perusahaan Anda — dalam satu pandangan' },
  dashboard: { title: 'Command Center', subtitle: 'Ringkasan performa lintas brand, funnel, forecast, dan aktivitas terbaru' },
  inbox: { title: 'Lead Inbox', subtitle: 'Seluruh pesan masuk lintas kanal — satu contact, satu timeline' },
  contacts: { title: 'Contacts & Companies', subtitle: 'Identitas calon klien global — company-centric & contact-centric' },
  pipeline: { title: 'Sales Pipeline', subtitle: 'Opportunity per brand — kanban, tabel, dan detail lengkap' },
  followup: { title: 'Follow-up', subtitle: 'Sequence, template, dan task follow-up lintas brand' },
  projects: { title: 'Projects', subtitle: 'Pekerjaan setelah deal Won — milestone dan progress produksi' },
  quotations: { title: 'Quotations', subtitle: 'Penawaran resmi per brand — numbering, versioning, dan approval diskon Direktur' },
  finance: { title: 'Finance', subtitle: 'Invoice, pembayaran, dan aging receivable lintas brand' },
  brands: { title: 'Brand Configuration', subtitle: 'Identitas, layanan, SLA, dan workflow per brand' },
  users: { title: 'User & Access', subtitle: 'Role, permission, dan akses brand per user' },
  audit: { title: 'Audit Logs', subtitle: 'Siapa mengubah apa, kapan, dari nilai apa menjadi apa' },
}

export default function Page() {
  const { hydrated, user, users, brands, view, setHydrated, setSession, setView, openOpportunity, focusOpportunityId, clearFocus } = useCrmStore()
  const [bootError, setBootError] = useState<string | null>(null)
  const [newLeadOpen, setNewLeadOpen] = useState(false)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)

  const hydrate = useCallback(async () => {
    try {
      setBootError(null)
      const boot = await crmApi.bootstrap()
      setSession(boot.user, boot.users, boot.brands)
    } catch (e) {
      setBootError(e instanceof Error ? e.message : 'Gagal memuat data')
    } finally {
      setHydrated(true)
    }
  }, [setSession, setHydrated])

  useEffect(() => { hydrate() }, [hydrate])

  /* Client selalu diarahkan ke Client Portal */
  useEffect(() => {
    if (user?.role === 'CLIENT' && view !== 'portal') setView('portal')
  }, [user, view, setView])

  const handleLogin = async (u: UserDTO) => {
    setSession(
      { id: u.id, name: u.name, email: u.email, role: u.role, title: u.title, avatarColor: u.avatarColor, brandIds: u.brandIds, companyId: u.companyId ?? null },
      users, brands,
    )
  }

  const handleLogout = async () => {
    try { await crmApi.logout() } catch { /* ignore */ }
    setSession(null, users, brands)
    setView('dashboard')
  }

  /* ---------- Splash / error ---------- */
  if (!hydrated) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-slate-50">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-900 text-white">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
        <p className="text-sm text-slate-500">Memuat Grupa Kreasi CRM…</p>
      </div>
    )
  }
  if (bootError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
        <div className="max-w-md rounded-xl border border-rose-200 bg-rose-50 p-6 text-center">
          <p className="font-semibold text-rose-800">Gagal memuat aplikasi</p>
          <p className="mt-1 text-sm text-rose-600">{bootError}</p>
          <Button className="mt-4" variant="outline" onClick={hydrate}>Coba lagi</Button>
        </div>
      </div>
    )
  }
  if (!user) return <LoginView users={users} onLogin={handleLogin} />

  const role = roleMeta(user.role)
  const nav = NAV.filter(n => n.roles.includes(user.role))
  const activeNav = nav.find(n => n.key === view) ?? nav[0]
  const meta = VIEW_TITLES[activeNav.key]

  const SidebarContent = (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2.5 border-b border-white/[0.08] px-4 pb-4 pt-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-teal-500 to-emerald-600 text-white shadow-md">
          <LayoutDashboard className="h-4.5 w-4.5" />
        </div>
        <div className="leading-tight">
          <p className="text-sm font-bold text-white">Grupa Kreasi CRM</p>
          <p className="text-[10px] text-slate-400">Multi-Brand Command Center</p>
        </div>
      </div>
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-2 pb-4">
        {nav.map((item) => {
          const Icon = item.icon
          const active = item.key === activeNav.key
          return (
            <button
              key={item.key}
              onClick={() => { setView(item.key); setMobileNavOpen(false); clearFocus() }}
              className={cn(
                'group relative flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[13px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400/70 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900',
                active ? 'bg-white/10 font-semibold text-white shadow-sm' : 'text-slate-400 hover:bg-white/[0.07] hover:text-slate-100',
              )}
            >
              {/* Indikator aktif — bar 3px di kiri, gradient teal→emerald */}
              {active && (
                <span aria-hidden className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-full bg-gradient-to-b from-teal-300 to-emerald-400" />
              )}
              <Icon className={cn('h-4 w-4 shrink-0', active ? 'text-teal-300' : 'text-slate-500 group-hover:text-slate-300')} />
              <span className="flex-1 truncate">{item.label}</span>
              {item.hint && <span className="rounded bg-white/5 px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-slate-500">{item.hint}</span>}
            </button>
          )
        })}
      </nav>
      <div className="border-t border-white/10 p-3">
        <div className="rounded-xl bg-white/5 p-3">
          <div className="flex items-center gap-2.5">
            <UserAvatar name={user.name} color={user.avatarColor} size={34} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-semibold text-white">{user.name}</p>
              <p className={cn('text-[11px] font-medium', role.color)}>{role.label}</p>
            </div>
            <Button size="icon" variant="ghost" className="h-7 w-7 text-slate-400 hover:text-white" onClick={handleLogout} title="Keluar">
              <LogOut className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  )

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      {/* Topbar */}
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/90 backdrop-blur supports-[backdrop-filter]:bg-white/75">
        <div className="flex items-center gap-3 px-4 py-2.5 sm:px-6">
          <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
            <SheetTrigger asChild>
              <Button variant="outline" size="icon" className="h-9 w-9 shrink-0 md:hidden">
                <Menu className="h-4 w-4" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 bg-slate-900 p-0">
              <SheetHeader className="sr-only"><SheetTitle>Navigasi</SheetTitle></SheetHeader>
              {SidebarContent}
            </SheetContent>
          </Sheet>

          <div className="min-w-0 flex-1">
            <h1 className="truncate text-[15px] font-bold leading-tight text-slate-900">{meta.title}</h1>
            <p className="hidden truncate text-xs text-slate-500 sm:block">{meta.subtitle}</p>
          </div>

          {(user.role === 'MARKETING' || user.role === 'SUPER_ADMIN' || user.role === 'DIREKTUR') && (
            <Button onClick={() => setNewLeadOpen(true)} className="h-9 gap-1.5 bg-slate-900 text-white shadow-sm hover:bg-slate-800 hover:shadow-md">
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">Lead Baru</span>
            </Button>
          )}

          <NotificationBell />

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-2 rounded-full border border-slate-200 bg-white py-1 pl-1 pr-2.5 transition hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2">
                <UserAvatar name={user.name} color={user.avatarColor} size={28} />
                <div className="hidden text-left leading-tight md:block">
                  <p className="max-w-[140px] truncate text-xs font-semibold text-slate-800">{user.name}</p>
                  <p className="text-[10px] text-slate-500">{role.label}</p>
                </div>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>
                <p className="text-sm font-semibold">{user.name}</p>
                <p className="text-xs font-normal text-slate-500">{user.email}</p>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-xs font-normal text-slate-500">Akses brand</DropdownMenuLabel>
              <div className="flex flex-wrap gap-1 px-2 pb-2">
                {brands.filter(b => user.role === 'SUPER_ADMIN' || user.brandIds.includes(b.id)).map(b => (
                  <Badge key={b.id} variant="secondary" className="border-0 text-[10px]" style={{ backgroundColor: `${b.color}14`, color: b.color }}>{b.name}</Badge>
                ))}
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleLogout} className="text-rose-600 focus:text-rose-700">
                <LogOut className="mr-2 h-4 w-4" /> Keluar
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {/* Body */}
      <div className="flex flex-1 items-stretch">
        <aside className="hidden w-60 shrink-0 bg-slate-900 md:block">
          {/* sticky di dalam aside: tinggi mengikuti body saat konten pendek (tidak
              menimpa footer), terkunci di viewport saat konten panjang */}
          <div className="sticky top-[57px] h-full max-h-[calc(100vh-57px)]">
            {SidebarContent}
          </div>
        </aside>
        <main className="min-w-0 flex-1">
          <div className="mx-auto w-full max-w-[1400px] px-4 py-5 sm:px-6">
            <AnimatePresence mode="wait">
              <motion.div
                key={view}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.18, ease: 'easeOut' }}
              >
                {view === 'portal' && <ClientPortalView />}
                {view === 'dashboard' && <DashboardView />}
                {view === 'inbox' && <InboxView />}
                {view === 'contacts' && <ContactsView />}
                {view === 'pipeline' && <PipelineView focusOpportunityId={focusOpportunityId} onConsumeFocus={clearFocus} />}
                {view === 'followup' && <FollowUpView />}
                {view === 'projects' && <ProjectsView />}
                {view === 'quotations' && <QuotationsView />}
                {view === 'finance' && <FinanceView />}
                {view === 'brands' && <BrandsView />}
                {view === 'users' && <UsersView />}
                {view === 'audit' && <AuditView />}
              </motion.div>
            </AnimatePresence>
          </div>
        </main>
      </div>

      {/* Sticky footer — menempel di bawah saat konten pendek, terdorong alami saat konten panjang */}
      <footer className="mt-auto border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)]">
        <div className="mx-auto flex w-full max-w-[1400px] flex-wrap items-center justify-between gap-2 px-4 py-3 text-xs text-slate-500 sm:px-6">
          <p><span className="font-semibold text-slate-700">Grupa Kreasi Media</span> · Multi-Brand CRM MVP · Unimasi · Segia Tech · Erfo Multimedia · Unicam Studio</p>
          <p>Company-centric & contact-centric foundation · Semua perubahan tercatat di audit log</p>
        </div>
      </footer>

      <NewLeadDialog open={newLeadOpen} onOpenChange={setNewLeadOpen} onCreated={(id) => { openOpportunity(id) }} />
    </div>
  )
}

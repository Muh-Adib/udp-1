'use client'

/* ============ Contacts & Companies view (Task 4-b) ============ */

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { crmApi } from '@/components/crm/api-client'
import { useCrmStore } from '@/components/crm/crm-store'
import {
  BrandChip, StageBadge, ChannelIcon, UserAvatar, EmptyState, LoadingRows, RefreshButton,
} from '@/components/crm/shared'
import {
  formatMoney, formatDate, timeAgo, channelMeta, CHANNELS, projectStatusMeta,
} from '@/lib/crm-constants'
import type { CompanyDTO, ContactDTO, OpportunityDTO, ProjectDTO } from '@/lib/crm-types'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle,
} from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import {
  AlertTriangle, Building, Building2, Briefcase, Calendar, Clock, Copy, ExternalLink,
  Globe, Hash, Languages, Linkedin, Loader2, Mail, MapPin, MessageCircle, Phone, Plus,
  Search, Star, Target, User, UserPlus, Users, Wallet, Trophy, X,
} from 'lucide-react'

/* ---------- Local constants ---------- */

const INDUSTRIES = [
  'FMCG', 'Government', 'Banking', 'Finance', 'Energy', 'Healthcare', 'Education',
  'Food & Beverage', 'Hospitality', 'NGO', 'Manufacturing', 'Technology', 'Media', 'Lainnya',
]

const COMPANY_SIZES = ['Small', 'Medium', 'Enterprise', 'Government', 'NGO']

const CURRENCIES = ['IDR', 'SGD', 'MYR', 'USD']

const AVATAR_COLORS = ['#0d9488', '#d97706', '#e11d48', '#7c3aed', '#65a30d', '#0891b2', '#ea580c', '#059669', '#c026d3']

const CONSENT_META: Record<string, { label: string; cls: string }> = {
  GRANTED: { label: 'Granted', cls: 'border-emerald-200 bg-emerald-50 text-emerald-700' },
  PENDING: { label: 'Pending', cls: 'border-amber-200 bg-amber-50 text-amber-700' },
  REVOKED: { label: 'Revoked', cls: 'border-rose-200 bg-rose-50 text-rose-700' },
}

const LANGUAGE_LABELS: Record<string, string> = { id: 'Bahasa Indonesia', en: 'English' }
const languageLabel = (code: string) => LANGUAGE_LABELS[code] ?? code

const SCROLLBAR =
  '[&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-300'

/* ---------- Form state models ---------- */

interface CompanyFormState {
  name: string; industry: string; website: string; country: string; city: string
  size: string; taxId: string; currency: string; tags: string; notes: string
}
const EMPTY_COMPANY_FORM: CompanyFormState = {
  name: '', industry: '', website: '', country: 'Indonesia', city: '',
  size: '', taxId: '', currency: 'IDR', tags: '', notes: '',
}

interface ContactFormState {
  firstName: string; lastName: string; position: string; email: string; whatsapp: string
  instagram: string; threads: string
  phone: string; companyId: string; country: string; city: string; language: string
  preferredChannel: string; tags: string
}
const EMPTY_CONTACT_FORM: ContactFormState = {
  firstName: '', lastName: '', position: '', email: '', whatsapp: '', instagram: '', threads: '', phone: '',
  companyId: 'NONE', country: 'Indonesia', city: '', language: 'id',
  preferredChannel: 'WHATSAPP', tags: '',
}

interface QuickContactFormState {
  firstName: string; lastName: string; position: string; email: string; whatsapp: string; preferredChannel: string
}
const EMPTY_QUICK_FORM: QuickContactFormState = {
  firstName: '', lastName: '', position: '', email: '', whatsapp: '', preferredChannel: 'WHATSAPP',
}

interface OpportunityFormState { title: string; brandId: string; serviceId: string; value: string }
const EMPTY_OPP_FORM: OpportunityFormState = { title: '', brandId: '', serviceId: '', value: '' }

type CompanyDetail = CompanyDTO & {
  contacts: ContactDTO[]
  opportunities: OpportunityDTO[]
  projects: ProjectDTO[]
}

/* ---------- Helpers ---------- */

function avatarColorFor(name: string): string {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  return AVATAR_COLORS[h % AVATAR_COLORS.length]
}

const websiteUrlOf = (url: string) => (/^https?:\/\//i.test(url) ? url : `https://${url}`)

/* ---------- Local UI atoms ---------- */

function Field({ label, required, className, children }: {
  label: string; required?: boolean; className?: string; children: React.ReactNode
}) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <span className="text-xs font-medium text-slate-600">
        {label}
        {required && <span className="text-rose-500"> *</span>}
      </span>
      {children}
    </div>
  )
}

function DetailField({ label, value, icon: Icon }: {
  label: string; value?: React.ReactNode; icon?: React.ElementType
}) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <div className="mt-0.5 flex items-center gap-1.5 text-[13px] text-slate-700">
        {Icon && <Icon className="h-3.5 w-3.5 shrink-0 text-slate-400" />}
        <span className="min-w-0 truncate">{value ?? '—'}</span>
      </div>
    </div>
  )
}

function StatTile({ label, value, icon: Icon, tone = 'slate' }: {
  label: string; value: string; icon: React.ElementType; tone?: 'slate' | 'emerald'
}) {
  return (
    <div className={cn(
      'rounded-lg border p-3',
      tone === 'emerald' ? 'border-emerald-100 bg-emerald-50/60' : 'border-slate-100 bg-slate-50/80',
    )}>
      <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <p className={cn('mt-1 text-sm font-bold tabular-nums', tone === 'emerald' ? 'text-emerald-700' : 'text-slate-800')}>{value}</p>
    </div>
  )
}

function ConsentBadge({ status }: { status: string }) {
  const meta = CONSENT_META[status] ?? { label: status, cls: 'border-slate-200 bg-slate-100 text-slate-600' }
  return <Badge variant="outline" className={cn('border font-medium', meta.cls)}>{meta.label}</Badge>
}

function ProjectStatusBadge({ status }: { status: string }) {
  const meta = projectStatusMeta(status)
  return (
    <span className={cn('inline-flex shrink-0 items-center rounded-md px-2 py-0.5 text-[11px] font-semibold', meta.bg, meta.color)}>
      {meta.label}
    </span>
  )
}

function ErrorBanner({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <Alert variant="destructive" className="border-rose-200 bg-rose-50">
      <AlertTriangle className="h-4 w-4" />
      <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
        <span>{message}</span>
        {onRetry && (
          <Button
            size="sm"
            variant="outline"
            className="h-7 border-rose-200 bg-white px-2.5 text-xs text-rose-700 hover:bg-rose-100"
            onClick={onRetry}
          >
            Coba lagi
          </Button>
        )}
      </AlertDescription>
    </Alert>
  )
}

function CompanyCard({ company, onOpen }: { company: CompanyDTO; onOpen: () => void }) {
  return (
    <Card
      role="button"
      tabIndex={0}
      aria-label={`Buka detail ${company.name}`}
      onClick={onOpen}
      onKeyDown={(e: React.KeyboardEvent<HTMLDivElement>) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onOpen()
        }
      }}
      className="group card-hover cursor-pointer rounded-xl border-slate-200 hover:border-slate-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400/60 focus-visible:ring-offset-2"
    >
      <CardContent className="flex h-full flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 items-start gap-2.5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-teal-50 text-teal-700">
              <Building2 className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-slate-900 transition-colors group-hover:text-teal-800">
                {company.name}
              </p>
              <p className="mt-0.5 flex items-center gap-1 text-xs text-slate-500">
                <MapPin className="h-3 w-3 shrink-0" />
                <span className="truncate">{[company.city, company.country].filter(Boolean).join(', ') || '—'}</span>
              </p>
            </div>
          </div>
          {company.industry && (
            <Badge variant="outline" className="shrink-0 border-teal-200 bg-teal-50 text-[10px] font-medium text-teal-700">
              {company.industry}
            </Badge>
          )}
        </div>

        {company.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {company.tags.map((t) => (
              <Badge key={t} variant="outline" className="px-1.5 py-0 text-[10px] font-normal text-slate-500">{t}</Badge>
            ))}
          </div>
        )}

        <div className="mt-auto flex items-end justify-between gap-2 border-t border-slate-100 pt-2.5">
          <div className="flex items-center gap-3 text-xs text-slate-500">
            <span className="flex items-center gap-1" title="Jumlah kontak">
              <Users className="h-3.5 w-3.5" />
              <span className="tabular-nums">{company.contactsCount}</span>
            </span>
            <span className="flex items-center gap-1" title="Jumlah opportunity">
              <Target className="h-3.5 w-3.5" />
              <span className="tabular-nums">{company.opportunitiesCount}</span>
            </span>
          </div>
          <div className="text-right leading-tight">
            <p className="text-xs font-semibold text-slate-700">
              Total: {formatMoney(company.totalValue, company.currency, true)}
            </p>
            <p className="text-[11px] font-medium text-emerald-600">
              Won: {formatMoney(company.wonValue, company.currency, true)}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

/* ================================================================ */

export default function ContactsView() {
  const { toast } = useToast()
  const brands = useCrmStore((s) => s.brands)
  const focusCompanyId = useCrmStore((s) => s.focusCompanyId)
  const clearFocus = useCrmStore((s) => s.clearFocus)
  const openOpportunity = useCrmStore((s) => s.openOpportunity)

  /* ----- toolbar ----- */
  const [tab, setTab] = useState<'companies' | 'contacts'>('companies')
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [country, setCountry] = useState('all')

  /* ----- data lists ----- */
  const [companies, setCompanies] = useState<CompanyDTO[]>([])
  const [companiesLoading, setCompaniesLoading] = useState(true)
  const [companiesError, setCompaniesError] = useState<string | null>(null)
  const [contacts, setContacts] = useState<ContactDTO[]>([])
  const [contactsLoading, setContactsLoading] = useState(true)
  const [contactsError, setContactsError] = useState<string | null>(null)

  /* ----- company detail sheet ----- */
  const [sheetOpen, setSheetOpen] = useState(false)
  const [sheetCompanyId, setSheetCompanyId] = useState<string | null>(null)
  const [detail, setDetail] = useState<CompanyDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState<string | null>(null)

  /* ----- quick-add contact (inside sheet) ----- */
  const [quickAddOpen, setQuickAddOpen] = useState(false)
  const [quickForm, setQuickForm] = useState<QuickContactFormState>(EMPTY_QUICK_FORM)
  const [quickSubmitting, setQuickSubmitting] = useState(false)

  /* ----- new company dialog ----- */
  const [newCompanyOpen, setNewCompanyOpen] = useState(false)
  const [companyForm, setCompanyForm] = useState<CompanyFormState>(EMPTY_COMPANY_FORM)
  const [companySubmitting, setCompanySubmitting] = useState(false)

  /* ----- new contact dialog ----- */
  const [newContactOpen, setNewContactOpen] = useState(false)
  const [contactForm, setContactForm] = useState<ContactFormState>(EMPTY_CONTACT_FORM)
  const [contactSubmitting, setContactSubmitting] = useState(false)
  const [companyOptions, setCompanyOptions] = useState<CompanyDTO[]>([])
  const [companyOptionsLoading, setCompanyOptionsLoading] = useState(false)

  /* ----- contact detail dialog ----- */
  const [selectedContact, setSelectedContact] = useState<ContactDTO | null>(null)

  /* ----- create opportunity dialog ----- */
  const [oppDialogContact, setOppDialogContact] = useState<ContactDTO | null>(null)
  const [oppForm, setOppForm] = useState<OpportunityFormState>(EMPTY_OPP_FORM)
  const [oppSubmitting, setOppSubmitting] = useState(false)

  /* ---------- Data loaders ---------- */

  const loadCompanies = useCallback(async (quiet = false) => {
    if (!quiet) setCompaniesLoading(true)
    setCompaniesError(null)
    try {
      const params = new URLSearchParams()
      if (search.trim()) params.set('search', search.trim())
      const list = await crmApi.companies(params.toString())
      setCompanies(list)
    } catch (e) {
      setCompaniesError(e instanceof Error ? e.message : 'Gagal memuat daftar perusahaan')
    } finally {
      if (!quiet) setCompaniesLoading(false)
    }
  }, [search])

  const loadContacts = useCallback(async (quiet = false) => {
    if (!quiet) setContactsLoading(true)
    setContactsError(null)
    try {
      const params = new URLSearchParams()
      if (search.trim()) params.set('search', search.trim())
      const list = await crmApi.contacts(params.toString())
      setContacts(list)
    } catch (e) {
      setContactsError(e instanceof Error ? e.message : 'Gagal memuat daftar kontak')
    } finally {
      if (!quiet) setContactsLoading(false)
    }
  }, [search])

  const fetchDetail = useCallback(async (id: string, quiet = false) => {
    if (!quiet) setDetailLoading(true)
    setDetailError(null)
    try {
      const d = await crmApi.company(id)
      setDetail(d)
    } catch (e) {
      setDetailError(e instanceof Error ? e.message : 'Gagal memuat detail perusahaan')
    } finally {
      if (!quiet) setDetailLoading(false)
    }
  }, [])

  /* debounce search input */
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 300)
    return () => clearTimeout(t)
  }, [searchInput])

  useEffect(() => { void loadCompanies() }, [loadCompanies])
  useEffect(() => { void loadContacts() }, [loadContacts])

  const refreshAll = useCallback(() => {
    void loadCompanies()
    void loadContacts()
  }, [loadCompanies, loadContacts])

  /* ---------- Company sheet ---------- */

  const openCompanySheet = useCallback((id: string) => {
    setSheetCompanyId(id)
    setSheetOpen(true)
  }, [])

  const handleSheetChange = useCallback((open: boolean) => {
    setSheetOpen(open)
    if (!open) {
      setQuickAddOpen(false)
      setDetailError(null)
    }
  }, [])

  useEffect(() => {
    if (!sheetOpen || !sheetCompanyId) return
    setDetail(null)
    void fetchDetail(sheetCompanyId)
  }, [sheetOpen, sheetCompanyId, fetchDetail])

  /* focus dari view lain (store.openCompany) → buka sheet lalu bersihkan focus */
  useEffect(() => {
    if (focusCompanyId) {
      openCompanySheet(focusCompanyId)
      clearFocus()
    }
  }, [focusCompanyId, openCompanySheet, clearFocus])

  const handleOpenOpportunity = useCallback((oppId: string) => {
    setSheetOpen(false) // tutup sheet dulu, lalu pindah ke pipeline
    openOpportunity(oppId)
  }, [openOpportunity])

  /* ---------- Derived data ---------- */

  const filteredCompanies = useMemo(
    () => (country === 'all' ? companies : companies.filter((c) => c.country === country)),
    [companies, country],
  )
  const filteredContacts = useMemo(
    () => (country === 'all' ? contacts : contacts.filter((c) => c.country === country)),
    [contacts, country],
  )

  const countries = useMemo(() => {
    const set = new Set<string>()
    companies.forEach((c) => set.add(c.country))
    contacts.forEach((c) => set.add(c.country))
    return Array.from(set).sort((a, b) => a.localeCompare(b))
  }, [companies, contacts])

  const hasFilter = Boolean(search) || country !== 'all'

  /* ---------- Reset filter (dari empty state) ---------- */

  const resetFilters = useCallback(() => {
    setSearchInput('')
    setCountry('all')
  }, [])

  /* ---------- Copy helper ---------- */

  const copyText = useCallback(async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text)
      toast({ title: 'Berhasil disalin', description: `${label} “${text}” tersalin ke clipboard.` })
    } catch {
      toast({ title: 'Gagal menyalin', description: 'Browser tidak mengizinkan akses clipboard.', variant: 'destructive' })
    }
  }, [toast])

  /* ---------- Dialog open helpers ---------- */

  const openNewCompany = useCallback(() => {
    setCompanyForm(EMPTY_COMPANY_FORM)
    setNewCompanyOpen(true)
  }, [])

  const openNewContact = useCallback(() => {
    setContactForm(EMPTY_CONTACT_FORM)
    setNewContactOpen(true)
  }, [])

  const openQuickAdd = useCallback(() => {
    setQuickForm(EMPTY_QUICK_FORM)
    setQuickAddOpen(true)
  }, [])

  const openOppDialog = useCallback((c: ContactDTO) => {
    setSelectedContact(null)
    setOppForm({ ...EMPTY_OPP_FORM, brandId: brands[0]?.id ?? '' })
    setOppDialogContact(c)
  }, [brands])

  /* muat opsi perusahaan setiap kali dialog kontak baru dibuka */
  useEffect(() => {
    if (!newContactOpen) return
    let cancelled = false
    setCompanyOptionsLoading(true)
    crmApi.companies()
      .then((list) => { if (!cancelled) setCompanyOptions(list) })
      .catch(() => { /* biarkan opsi lama; tidak blocking */ })
      .finally(() => { if (!cancelled) setCompanyOptionsLoading(false) })
    return () => { cancelled = true }
  }, [newContactOpen])

  /* ---------- Mutations ---------- */

  const submitNewCompany = async () => {
    if (!companyForm.name.trim()) {
      toast({ title: 'Nama perusahaan wajib diisi', variant: 'destructive' })
      return
    }
    setCompanySubmitting(true)
    try {
      const created = await crmApi.createCompany({
        name: companyForm.name.trim(),
        industry: companyForm.industry === 'NONE' ? '' : companyForm.industry,
        website: companyForm.website,
        country: companyForm.country,
        city: companyForm.city,
        size: companyForm.size,
        taxId: companyForm.taxId,
        currency: companyForm.currency,
        tags: companyForm.tags,
        notes: companyForm.notes,
      })
      toast({ title: 'Perusahaan dibuat', description: `${created.name} berhasil ditambahkan.` })
      setNewCompanyOpen(false)
      setCompanyForm(EMPTY_COMPANY_FORM)
      await loadCompanies(true)
    } catch (e) {
      toast({
        title: 'Gagal membuat perusahaan',
        description: e instanceof Error ? e.message : 'Terjadi kesalahan',
        variant: 'destructive',
      })
    } finally {
      setCompanySubmitting(false)
    }
  }

  const submitNewContact = async () => {
    if (!contactForm.firstName.trim()) {
      toast({ title: 'Nama depan wajib diisi', variant: 'destructive' })
      return
    }
    setContactSubmitting(true)
    try {
      const created = await crmApi.createContact({
        firstName: contactForm.firstName.trim(),
        lastName: contactForm.lastName,
        position: contactForm.position,
        email: contactForm.email,
        whatsapp: contactForm.whatsapp,
        instagram: contactForm.instagram || null,
        threads: contactForm.threads || null,
        phone: contactForm.phone,
        companyId: contactForm.companyId !== 'NONE' ? contactForm.companyId : undefined,
        country: contactForm.country,
        city: contactForm.city,
        language: contactForm.language,
        preferredChannel: contactForm.preferredChannel,
        tags: contactForm.tags,
      })
      toast({ title: 'Kontak ditambahkan', description: `${created.fullName} berhasil disimpan.` })
      setNewContactOpen(false)
      setContactForm(EMPTY_CONTACT_FORM)
      void loadContacts(true)
      void loadCompanies(true) // contactsCount ikut segar
      if (created.companyId && sheetOpen && sheetCompanyId === created.companyId) {
        void fetchDetail(created.companyId, true)
      }
    } catch (e) {
      toast({
        title: 'Gagal menambah kontak',
        description: e instanceof Error ? e.message : 'Terjadi kesalahan',
        variant: 'destructive',
      })
    } finally {
      setContactSubmitting(false)
    }
  }

  const submitQuickContact = async () => {
    if (!detail || !sheetCompanyId) return
    if (!quickForm.firstName.trim()) {
      toast({ title: 'Nama depan wajib diisi', variant: 'destructive' })
      return
    }
    setQuickSubmitting(true)
    try {
      const created = await crmApi.createContact({
        companyId: sheetCompanyId,
        firstName: quickForm.firstName.trim(),
        lastName: quickForm.lastName,
        position: quickForm.position,
        email: quickForm.email,
        whatsapp: quickForm.whatsapp,
        preferredChannel: quickForm.preferredChannel,
        country: detail.country,
      })
      toast({ title: 'Kontak ditambahkan', description: `${created.fullName} ditambahkan ke ${detail.name}.` })
      setQuickAddOpen(false)
      setQuickForm(EMPTY_QUICK_FORM)
      setDetail((prev) => (prev && prev.id === sheetCompanyId
        ? { ...prev, contacts: [created, ...prev.contacts], contactsCount: prev.contactsCount + 1 }
        : prev))
      void loadCompanies(true)
      void loadContacts(true)
    } catch (e) {
      toast({
        title: 'Gagal menambah kontak',
        description: e instanceof Error ? e.message : 'Terjadi kesalahan',
        variant: 'destructive',
      })
    } finally {
      setQuickSubmitting(false)
    }
  }

  const submitOpportunity = async () => {
    const contact = oppDialogContact
    if (!contact) return
    const companyId = contact.company?.id ?? contact.companyId ?? undefined
    if (!oppForm.title.trim()) {
      toast({ title: 'Judul opportunity wajib diisi', variant: 'destructive' })
      return
    }
    if (!oppForm.brandId) {
      toast({ title: 'Brand wajib dipilih', variant: 'destructive' })
      return
    }
    if (!companyId) {
      toast({ title: 'Kontak belum terhubung ke perusahaan', description: 'Opportunity wajib memiliki perusahaan.', variant: 'destructive' })
      return
    }
    setOppSubmitting(true)
    try {
      const oppBrand = brands.find((b) => b.id === oppForm.brandId)
      const created = await crmApi.createOpportunity({
        title: oppForm.title.trim(),
        contactId: contact.id,
        companyId,
        sourceBrandId: oppForm.brandId,
        executingBrandId: oppForm.brandId,
        serviceId: oppForm.serviceId || undefined,
        estimatedValue: Number(oppForm.value) || 0,
        currency: oppBrand?.primaryCurrency ?? 'IDR',
        leadSource: 'REFERRAL',
        channel: 'WHATSAPP',
      })
      toast({ title: 'Opportunity dibuat', description: `${created.code} — ${created.title}` })
      setOppDialogContact(null)
      setOppForm(EMPTY_OPP_FORM)
      void loadCompanies(true)
      openOpportunity(created.id)
    } catch (e) {
      toast({
        title: 'Gagal membuat opportunity',
        description: e instanceof Error ? e.message : 'Terjadi kesalahan',
        variant: 'destructive',
      })
    } finally {
      setOppSubmitting(false)
    }
  }

  const oppBrand = brands.find((b) => b.id === oppForm.brandId)
  const oppServices = oppBrand?.services ?? []
  const oppCurrency = oppBrand?.primaryCurrency ?? 'IDR'

  /* ================================================================ */

  return (
    <div className="flex flex-col gap-4">
      {/* ---------- Toolbar ---------- */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Cari nama, industri, kota…"
            className="h-9 pr-8 pl-9"
            aria-label="Cari perusahaan atau kontak"
          />
          {searchInput && (
            <button
              type="button"
              onClick={() => setSearchInput('')}
              aria-label="Hapus pencarian"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full p-0.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400/60"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={country} onValueChange={setCountry}>
            <SelectTrigger className="h-9 w-[150px] sm:w-[180px]" aria-label="Filter negara">
              <SelectValue placeholder="Semua negara" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua negara</SelectItem>
              {countries.map((c) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <RefreshButton onClick={refreshAll} loading={companiesLoading || contactsLoading} />
          <Button
            onClick={tab === 'companies' ? openNewCompany : openNewContact}
            className="h-9 gap-1.5 bg-teal-600 text-white hover:bg-teal-700"
          >
            <Plus className="h-4 w-4" />
            {tab === 'companies' ? 'Perusahaan Baru' : 'Kontak Baru'}
          </Button>
        </div>
      </div>

      {/* ---------- Error banners ---------- */}
      {companiesError && <ErrorBanner message={companiesError} onRetry={() => void loadCompanies()} />}
      {contactsError && <ErrorBanner message={contactsError} onRetry={() => void loadContacts()} />}

      {/* ---------- Tabs ---------- */}
      <Tabs value={tab} onValueChange={(v) => setTab(v as 'companies' | 'contacts')}>
        <TabsList className="h-9 w-fit bg-slate-100 p-1">
          <TabsTrigger value="companies" className="gap-1.5 rounded-md px-3 text-[13px]">
            <Building2 className="h-3.5 w-3.5" />
            Perusahaan
            <span className="ml-0.5 rounded-full bg-slate-200/90 px-1.5 text-[10px] font-semibold tabular-nums text-slate-600">
              {filteredCompanies.length}
            </span>
          </TabsTrigger>
          <TabsTrigger value="contacts" className="gap-1.5 rounded-md px-3 text-[13px]">
            <Users className="h-3.5 w-3.5" />
            Kontak
            <span className="ml-0.5 rounded-full bg-slate-200/90 px-1.5 text-[10px] font-semibold tabular-nums text-slate-600">
              {filteredContacts.length}
            </span>
          </TabsTrigger>
        </TabsList>

        {/* ---------- Tab Perusahaan ---------- */}
        <TabsContent value="companies" className="mt-4">
          {companiesLoading ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-44 rounded-xl" />
              ))}
            </div>
          ) : filteredCompanies.length === 0 ? (
            <EmptyState
              icon={<Building2 className="h-5 w-5" />}
              title={hasFilter ? 'Tidak ada perusahaan yang cocok' : 'Belum ada perusahaan'}
              description={
                hasFilter
                  ? `Tidak ditemukan perusahaan untuk pencarian “${search}”${country !== 'all' ? ` di ${country}` : ''}. Coba ubah kata kunci atau filter negara.`
                  : 'Mulai bangun basis data klien dengan menambahkan perusahaan pertama Anda.'
              }
              action={hasFilter ? (
                <Button variant="outline" onClick={resetFilters} className="gap-1.5">Hapus Filter</Button>
              ) : (
                <Button onClick={openNewCompany} className="gap-1.5 bg-teal-600 text-white hover:bg-teal-700">
                  <Plus className="h-4 w-4" />
                  Perusahaan Baru
                </Button>
              )}
            />
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {filteredCompanies.map((c) => (
                <CompanyCard key={c.id} company={c} onOpen={() => openCompanySheet(c.id)} />
              ))}
            </div>
          )}
        </TabsContent>

        {/* ---------- Tab Kontak ---------- */}
        <TabsContent value="contacts" className="mt-4">
          {contactsLoading ? (
            <LoadingRows rows={6} />
          ) : filteredContacts.length === 0 ? (
            <EmptyState
              icon={<Users className="h-5 w-5" />}
              title={hasFilter ? 'Tidak ada kontak yang cocok' : 'Belum ada kontak'}
              description={
                hasFilter
                  ? `Tidak ditemukan kontak untuk pencarian “${search}”${country !== 'all' ? ` di ${country}` : ''}. Coba ubah kata kunci atau filter negara.`
                  : 'Tambahkan kontak pertama Anda, atau tambahkan kontak langsung dari detail perusahaan.'
              }
              action={hasFilter ? (
                <Button variant="outline" onClick={resetFilters} className="gap-1.5">Hapus Filter</Button>
              ) : (
                <Button onClick={openNewContact} className="gap-1.5 bg-teal-600 text-white hover:bg-teal-700">
                  <Plus className="h-4 w-4" />
                  Kontak Baru
                </Button>
              )}
            />
          ) : (
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50/80 hover:bg-slate-50/80">
                      <TableHead className="text-[11px] uppercase tracking-wider text-slate-500">Nama</TableHead>
                      <TableHead className="text-[11px] uppercase tracking-wider text-slate-500">Posisi</TableHead>
                      <TableHead className="text-[11px] uppercase tracking-wider text-slate-500">Perusahaan</TableHead>
                      <TableHead className="text-[11px] uppercase tracking-wider text-slate-500">Email</TableHead>
                      <TableHead className="text-[11px] uppercase tracking-wider text-slate-500">WhatsApp</TableHead>
                      <TableHead className="text-[11px] uppercase tracking-wider text-slate-500">Negara / Kota</TableHead>
                      <TableHead className="text-[11px] uppercase tracking-wider text-slate-500">Kanal Preferensi</TableHead>
                      <TableHead className="text-[11px] uppercase tracking-wider text-slate-500">Consent</TableHead>
                      <TableHead className="text-[11px] uppercase tracking-wider text-slate-500">Dibuat</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredContacts.map((ct) => {
                      const comp = ct.company ?? null
                      return (
                        <TableRow
                          key={ct.id}
                          onClick={() => setSelectedContact(ct)}
                          className="cursor-pointer transition-colors hover:bg-slate-50/80"
                          title="Klik untuk detail kontak"
                        >
                          <TableCell>
                            <div className="flex items-center gap-2.5">
                              <UserAvatar name={ct.fullName} color={avatarColorFor(ct.fullName)} size={30} />
                              <div className="min-w-0">
                                <p className="flex items-center gap-1 truncate text-[13px] font-semibold text-slate-800">
                                  {ct.fullName}
                                  {ct.isPrimary && <Star className="h-3 w-3 shrink-0 fill-amber-400 text-amber-400" aria-label="Kontak utama" />}
                                </p>
                                {ct.tags.length > 0 && (
                                  <div className="mt-0.5 flex flex-wrap gap-1">
                                    {ct.tags.slice(0, 2).map((t) => (
                                      <Badge key={t} variant="outline" className="px-1.5 py-0 text-[10px] font-normal text-slate-500">{t}</Badge>
                                    ))}
                                    {ct.tags.length > 2 && (
                                      <span className="text-[10px] text-slate-400">+{ct.tags.length - 2}</span>
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <span className="block max-w-[140px] truncate text-[13px] text-slate-600" title={ct.position ?? undefined}>
                              {ct.position ?? '—'}
                            </span>
                          </TableCell>
                          <TableCell onClick={(e) => e.stopPropagation()}>
                            {comp ? (
                              <button
                                type="button"
                                onClick={() => openCompanySheet(comp.id)}
                                title={`Buka detail ${comp.name}`}
                                className="inline-flex max-w-[170px] items-center gap-1 rounded-md px-1.5 py-0.5 text-[13px] font-medium text-teal-700 transition hover:bg-teal-50 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400/60"
                              >
                                <Building2 className="h-3 w-3 shrink-0" />
                                <span className="truncate">{comp.name}</span>
                              </button>
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <span className="block max-w-[180px] truncate text-[13px] text-slate-600" title={ct.email ?? undefined}>
                              {ct.email ?? '—'}
                            </span>
                          </TableCell>
                          <TableCell>
                            <span className="text-[13px] tabular-nums text-slate-600">{ct.whatsapp ?? '—'}</span>
                          </TableCell>
                          <TableCell>
                            <span className="text-[13px] text-slate-600">
                              {[ct.city, ct.country].filter(Boolean).join(', ') || '—'}
                            </span>
                          </TableCell>
                          <TableCell>
                            <span className="inline-flex items-center gap-1.5">
                              <ChannelIcon channel={ct.preferredChannel} />
                              <span className="text-[13px] text-slate-600">{channelMeta(ct.preferredChannel).label}</span>
                            </span>
                          </TableCell>
                          <TableCell><ConsentBadge status={ct.consentStatus} /></TableCell>
                          <TableCell>
                            <span className="whitespace-nowrap text-[13px] tabular-nums text-slate-500">{formatDate(ct.createdAt)}</span>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* ---------- Company Detail Sheet ---------- */}
      <Sheet open={sheetOpen} onOpenChange={handleSheetChange}>
        <SheetContent side="right" className={cn('flex w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-xl')}>
          <SheetHeader className="border-b border-slate-100 p-5 pr-12">
            <SheetTitle className="text-lg font-bold text-slate-900">
              {detailLoading ? <Skeleton className="h-6 w-2/3" /> : detailError ? 'Detail Perusahaan' : (detail?.name ?? 'Detail Perusahaan')}
            </SheetTitle>
            {!detailLoading && !detailError && detail && (
              <SheetDescription className="text-xs">
                {[detail.industry, [detail.city, detail.country].filter(Boolean).join(', ')].filter(Boolean).join(' · ') || 'Perusahaan'}
              </SheetDescription>
            )}
            {detailLoading && <SheetDescription className="sr-only">Memuat detail perusahaan</SheetDescription>}
            {detailError && <SheetDescription className="sr-only">Gagal memuat detail perusahaan</SheetDescription>}
          </SheetHeader>

          <div className={cn('flex-1 overflow-y-auto p-5', SCROLLBAR)}>
            {detailLoading && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-2.5">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <Skeleton key={i} className="h-16 rounded-lg" />
                  ))}
                </div>
                <LoadingRows rows={4} />
              </div>
            )}

            {detailError && (
              <ErrorBanner message={detailError} onRetry={() => sheetCompanyId && void fetchDetail(sheetCompanyId)} />
            )}

            {!detailLoading && !detailError && detail && (
              <div className="space-y-6">
                {/* Profil */}
                <div className="space-y-3">
                  <div className="flex flex-col gap-1.5 text-xs text-slate-600">
                    {detail.website && (
                      <a
                        href={websiteUrlOf(detail.website)}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex w-fit max-w-full items-center gap-1.5 rounded-md font-medium text-teal-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400/60"
                      >
                        <Globe className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{detail.website}</span>
                        <ExternalLink className="h-3 w-3 shrink-0" />
                      </a>
                    )}
                    {detail.address && (
                      <span className="flex items-start gap-1.5">
                        <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
                        <span>{detail.address}</span>
                      </span>
                    )}
                    <span className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-slate-500">
                      {detail.size && (
                        <span className="inline-flex items-center gap-1">
                          <Building className="h-3.5 w-3.5" />{detail.size}
                        </span>
                      )}
                      {detail.taxId && (
                        <span className="inline-flex items-center gap-1">
                          <Hash className="h-3.5 w-3.5" />{detail.taxId}
                        </span>
                      )}
                      <span className="inline-flex items-center gap-1">
                        <Wallet className="h-3.5 w-3.5" />{detail.currency}
                      </span>
                      {detail.ownerName && (
                        <span className="inline-flex items-center gap-1">
                          <User className="h-3.5 w-3.5" />{detail.ownerName}
                        </span>
                      )}
                    </span>
                    {detail.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 pt-0.5">
                        {detail.tags.map((t) => (
                          <Badge key={t} variant="outline" className="px-1.5 py-0 text-[10px] font-normal text-slate-500">{t}</Badge>
                        ))}
                      </div>
                    )}
                  </div>

                  {detail.notes && (
                    <div className="rounded-lg bg-slate-50 p-3">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Catatan</p>
                      <p className="mt-1 whitespace-pre-line text-xs leading-relaxed text-slate-600">{detail.notes}</p>
                    </div>
                  )}

                  {/* Statistik */}
                  <div className="grid grid-cols-2 gap-2.5">
                    <StatTile label="Total Nilai Pipeline" value={formatMoney(detail.totalValue, detail.currency, true)} icon={Wallet} />
                    <StatTile label="Nilai Won" value={formatMoney(detail.wonValue, detail.currency, true)} icon={Trophy} tone="emerald" />
                    <StatTile label="Kontak" value={String(detail.contactsCount)} icon={Users} />
                    <StatTile label="Opportunity" value={String(detail.opportunitiesCount)} icon={Target} />
                  </div>
                </div>

                {/* Kontak */}
                <section>
                  <div className="mb-2.5 flex items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold text-slate-800">
                      Kontak <span className="font-normal text-slate-400">({detail.contacts.length})</span>
                    </h3>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 gap-1 border-teal-200 px-2.5 text-xs text-teal-700 hover:bg-teal-50"
                      onClick={openQuickAdd}
                    >
                      <UserPlus className="h-3.5 w-3.5" />
                      Kontak
                    </Button>
                  </div>
                  {detail.contacts.length === 0 ? (
                    <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50/60 p-3 text-xs text-slate-500">
                      Belum ada kontak di perusahaan ini. Gunakan tombol “Kontak” untuk menambahkan.
                    </p>
                  ) : (
                    <div className={cn('max-h-72 space-y-1.5 overflow-y-auto pr-1', SCROLLBAR)}>
                      {detail.contacts.map((ct) => (
                        <div key={ct.id} className="rounded-lg border border-slate-100 p-2.5 transition hover:border-slate-200">
                          <div className="flex items-center gap-2.5">
                            <UserAvatar name={ct.fullName} color={avatarColorFor(ct.fullName)} size={30} />
                            <div className="min-w-0 flex-1">
                              <p className="flex items-center gap-1.5 truncate text-[13px] font-semibold text-slate-800">
                                <span className="truncate">{ct.fullName}</span>
                                {ct.isPrimary && (
                                  <span
                                    className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-amber-50 px-1.5 py-0.5 text-[9px] font-semibold text-amber-700"
                                    title="Kontak utama"
                                  >
                                    <Star className="h-2.5 w-2.5 fill-amber-400 text-amber-400" />
                                    Utama
                                  </span>
                                )}
                              </p>
                              {ct.position && <p className="truncate text-[11px] text-slate-500">{ct.position}</p>}
                            </div>
                            <span className="inline-flex shrink-0 items-center gap-1" title={`Kanal preferensi: ${channelMeta(ct.preferredChannel).label}`}>
                              <ChannelIcon channel={ct.preferredChannel} className="h-4 w-4" />
                            </span>
                          </div>
                          <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 pl-[42px] text-[11px] text-slate-500">
                            {ct.email && (
                              <span className="inline-flex min-w-0 items-center gap-1">
                                <Mail className="h-3 w-3 shrink-0" />
                                <span className="truncate">{ct.email}</span>
                              </span>
                            )}
                            {ct.whatsapp && (
                              <span className="inline-flex items-center gap-1">
                                <Phone className="h-3 w-3 shrink-0" />
                                {ct.whatsapp}
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </section>

                {/* Opportunities */}
                <section>
                  <h3 className="mb-2.5 text-sm font-semibold text-slate-800">
                    Opportunities <span className="font-normal text-slate-400">({detail.opportunities.length})</span>
                  </h3>
                  {detail.opportunities.length === 0 ? (
                    <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50/60 p-3 text-xs text-slate-500">
                      Belum ada opportunity untuk perusahaan ini.
                    </p>
                  ) : (
                    <div className={cn('max-h-80 space-y-1.5 overflow-y-auto pr-1', SCROLLBAR)}>
                      {detail.opportunities.map((o) => (
                        <button
                          key={o.id}
                          type="button"
                          onClick={() => handleOpenOpportunity(o.id)}
                          className="flex w-full items-center gap-2.5 rounded-lg border border-slate-100 p-2.5 text-left transition hover:border-teal-200 hover:bg-teal-50/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400/60"
                        >
                          <div className="min-w-0 flex-1 space-y-1">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <StageBadge stage={o.stage} />
                              <BrandChip name={o.brandName} color={o.brandColor} size="xs" />
                            </div>
                            <p className="truncate text-[13px] font-medium text-slate-800">{o.title}</p>
                            <p className="text-[11px] text-slate-400">{o.code} · dibuat {timeAgo(o.createdAt)}</p>
                          </div>
                          <span className="shrink-0 text-[13px] font-semibold tabular-nums text-slate-700">
                            {formatMoney(o.estimatedValue, o.currency, true)}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </section>

                {/* Projects */}
                {detail.projects.length > 0 && (
                  <section>
                    <h3 className="mb-2.5 text-sm font-semibold text-slate-800">
                      Projects <span className="font-normal text-slate-400">({detail.projects.length})</span>
                    </h3>
                    <div className="space-y-1.5">
                      {detail.projects.map((p) => (
                        <div key={p.id} className="rounded-lg border border-slate-100 p-3">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="truncate text-[13px] font-semibold text-slate-800">{p.name}</p>
                              <p className="text-[11px] text-slate-400">{p.code}</p>
                            </div>
                            <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
                              <BrandChip name={p.brandName} color={p.brandColor} size="xs" />
                              <ProjectStatusBadge status={p.status} />
                            </div>
                          </div>
                          <div className="mt-2 flex items-center gap-2">
                            <Progress value={p.progress} className="h-1.5" />
                            <span className="shrink-0 text-[11px] font-semibold tabular-nums text-slate-600">{p.progress}%</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                )}
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* ---------- Quick-add kontak (dari sheet) ---------- */}
      <Dialog open={quickAddOpen} onOpenChange={setQuickAddOpen}>
        <DialogContent className={cn('max-h-[90vh] overflow-y-auto rounded-xl sm:max-w-md', SCROLLBAR)}>
          <DialogHeader>
            <DialogTitle>Tambah Kontak</DialogTitle>
            <DialogDescription>
              Kontak baru untuk <span className="font-medium text-slate-700">{detail?.name ?? 'perusahaan ini'}</span>
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Nama Depan" required>
              <Input
                value={quickForm.firstName}
                onChange={(e) => setQuickForm((f) => ({ ...f, firstName: e.target.value }))}
                placeholder="cth. Budi"
                autoFocus
              />
            </Field>
            <Field label="Nama Belakang">
              <Input
                value={quickForm.lastName}
                onChange={(e) => setQuickForm((f) => ({ ...f, lastName: e.target.value }))}
                placeholder="cth. Santoso"
              />
            </Field>
            <Field label="Posisi">
              <Input
                value={quickForm.position}
                onChange={(e) => setQuickForm((f) => ({ ...f, position: e.target.value }))}
                placeholder="cth. Marketing Manager"
              />
            </Field>
            <Field label="Email">
              <Input
                type="email"
                value={quickForm.email}
                onChange={(e) => setQuickForm((f) => ({ ...f, email: e.target.value }))}
                placeholder="nama@perusahaan.com"
              />
            </Field>
            <Field label="WhatsApp">
              <Input
                value={quickForm.whatsapp}
                onChange={(e) => setQuickForm((f) => ({ ...f, whatsapp: e.target.value }))}
                placeholder="cth. +62 812 3456 7890"
              />
            </Field>
            <Field label="Kanal Preferensi">
              <Select
                value={quickForm.preferredChannel}
                onValueChange={(v) => setQuickForm((f) => ({ ...f, preferredChannel: v }))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CHANNELS.map((c) => (
                    <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={() => setQuickAddOpen(false)} disabled={quickSubmitting}>Batal</Button>
            <Button
              onClick={submitQuickContact}
              disabled={quickSubmitting}
              className="bg-teal-600 text-white hover:bg-teal-700"
            >
              {quickSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
              Simpan Kontak
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ---------- Dialog Perusahaan Baru ---------- */}
      <Dialog open={newCompanyOpen} onOpenChange={setNewCompanyOpen}>
        <DialogContent className={cn('max-h-[90vh] overflow-y-auto rounded-xl sm:max-w-lg', SCROLLBAR)}>
          <DialogHeader>
            <DialogTitle>Perusahaan Baru</DialogTitle>
            <DialogDescription>Tambahkan perusahaan atau klien baru ke dalam CRM.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Nama Perusahaan" required className="sm:col-span-2">
              <Input
                value={companyForm.name}
                onChange={(e) => setCompanyForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="cth. PT Maju Bersama"
                autoFocus
              />
            </Field>
            <Field label="Industri">
              <Select
                value={companyForm.industry}
                onValueChange={(v) => setCompanyForm((f) => ({ ...f, industry: v }))}
              >
                <SelectTrigger><SelectValue placeholder="— Pilih industri —" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="NONE">— Tanpa industri —</SelectItem>
                  {INDUSTRIES.map((ind) => (
                    <SelectItem key={ind} value={ind}>{ind}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Website">
              <Input
                value={companyForm.website}
                onChange={(e) => setCompanyForm((f) => ({ ...f, website: e.target.value }))}
                placeholder="cth. majubersama.co.id"
              />
            </Field>
            <Field label="Negara">
              <Input
                value={companyForm.country}
                onChange={(e) => setCompanyForm((f) => ({ ...f, country: e.target.value }))}
                placeholder="cth. Indonesia"
              />
            </Field>
            <Field label="Kota">
              <Input
                value={companyForm.city}
                onChange={(e) => setCompanyForm((f) => ({ ...f, city: e.target.value }))}
                placeholder="cth. Jakarta"
              />
            </Field>
            <Field label="Ukuran Perusahaan">
              <Select
                value={companyForm.size}
                onValueChange={(v) => setCompanyForm((f) => ({ ...f, size: v }))}
              >
                <SelectTrigger><SelectValue placeholder="— Pilih ukuran —" /></SelectTrigger>
                <SelectContent>
                  {COMPANY_SIZES.map((s) => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Tax ID / NPWP">
              <Input
                value={companyForm.taxId}
                onChange={(e) => setCompanyForm((f) => ({ ...f, taxId: e.target.value }))}
                placeholder="cth. 01.234.567.8-901.000"
              />
            </Field>
            <Field label="Mata Uang">
              <Select
                value={companyForm.currency}
                onValueChange={(v) => setCompanyForm((f) => ({ ...f, currency: v }))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map((cur) => (
                    <SelectItem key={cur} value={cur}>{cur}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Tags" className="sm:col-span-2">
              <Input
                value={companyForm.tags}
                onChange={(e) => setCompanyForm((f) => ({ ...f, tags: e.target.value }))}
                placeholder="pisahkan dengan koma, cth. retail, FMCG, retainer"
              />
            </Field>
            <Field label="Catatan" className="sm:col-span-2">
              <Textarea
                rows={3}
                value={companyForm.notes}
                onChange={(e) => setCompanyForm((f) => ({ ...f, notes: e.target.value }))}
                placeholder="Catatan internal tentang perusahaan ini…"
              />
            </Field>
          </div>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={() => setNewCompanyOpen(false)} disabled={companySubmitting}>Batal</Button>
            <Button
              onClick={submitNewCompany}
              disabled={companySubmitting}
              className="bg-teal-600 text-white hover:bg-teal-700"
            >
              {companySubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
              Simpan Perusahaan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ---------- Dialog Kontak Baru ---------- */}
      <Dialog open={newContactOpen} onOpenChange={setNewContactOpen}>
        <DialogContent className={cn('max-h-[90vh] overflow-y-auto rounded-xl sm:max-w-lg', SCROLLBAR)}>
          <DialogHeader>
            <DialogTitle>Kontak Baru</DialogTitle>
            <DialogDescription>Tambahkan kontak baru — hubungkan ke perusahaan jika sudah ada.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Nama Depan" required>
              <Input
                value={contactForm.firstName}
                onChange={(e) => setContactForm((f) => ({ ...f, firstName: e.target.value }))}
                placeholder="cth. Siti"
                autoFocus
              />
            </Field>
            <Field label="Nama Belakang">
              <Input
                value={contactForm.lastName}
                onChange={(e) => setContactForm((f) => ({ ...f, lastName: e.target.value }))}
                placeholder="cth. Rahayu"
              />
            </Field>
            <Field label="Posisi">
              <Input
                value={contactForm.position}
                onChange={(e) => setContactForm((f) => ({ ...f, position: e.target.value }))}
                placeholder="cth. Brand Manager"
              />
            </Field>
            <Field label="Email">
              <Input
                type="email"
                value={contactForm.email}
                onChange={(e) => setContactForm((f) => ({ ...f, email: e.target.value }))}
                placeholder="nama@perusahaan.com"
              />
            </Field>
            <Field label="WhatsApp">
              <Input
                value={contactForm.whatsapp}
                onChange={(e) => setContactForm((f) => ({ ...f, whatsapp: e.target.value }))}
                placeholder="cth. +62 812 3456 7890"
              />
            </Field>
            <Field label="Instagram">
              <Input
                value={contactForm.instagram}
                onChange={(e) => setContactForm((f) => ({ ...f, instagram: e.target.value }))}
                placeholder="cth. @handle"
              />
            </Field>
            <Field label="Threads">
              <Input
                value={contactForm.threads}
                onChange={(e) => setContactForm((f) => ({ ...f, threads: e.target.value }))}
                placeholder="cth. @handle"
              />
            </Field>
            <Field label="Telepon">
              <Input
                value={contactForm.phone}
                onChange={(e) => setContactForm((f) => ({ ...f, phone: e.target.value }))}
                placeholder="cth. +62 21 555 0123"
              />
            </Field>
            <Field label="Perusahaan" className="sm:col-span-2">
              <Select
                value={contactForm.companyId}
                onValueChange={(v) => setContactForm((f) => ({ ...f, companyId: v }))}
              >
                <SelectTrigger><SelectValue placeholder="— Tanpa perusahaan —" /></SelectTrigger>
                <SelectContent className={cn('max-h-64 overflow-y-auto', SCROLLBAR)}>
                  <SelectItem value="NONE">— Tanpa perusahaan —</SelectItem>
                  {companyOptions.map((co) => (
                    <SelectItem key={co.id} value={co.id}>
                      {co.name}{co.country ? ` · ${co.country}` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {companyOptionsLoading && (
                <p className="flex items-center gap-1.5 text-[11px] text-slate-400">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Memuat daftar perusahaan…
                </p>
              )}
            </Field>
            <Field label="Negara">
              <Input
                value={contactForm.country}
                onChange={(e) => setContactForm((f) => ({ ...f, country: e.target.value }))}
                placeholder="cth. Indonesia"
              />
            </Field>
            <Field label="Kota">
              <Input
                value={contactForm.city}
                onChange={(e) => setContactForm((f) => ({ ...f, city: e.target.value }))}
                placeholder="cth. Bandung"
              />
            </Field>
            <Field label="Bahasa">
              <Select
                value={contactForm.language}
                onValueChange={(v) => setContactForm((f) => ({ ...f, language: v }))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="id">Bahasa Indonesia</SelectItem>
                  <SelectItem value="en">English</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Kanal Preferensi">
              <Select
                value={contactForm.preferredChannel}
                onValueChange={(v) => setContactForm((f) => ({ ...f, preferredChannel: v }))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CHANNELS.map((c) => (
                    <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Tags" className="sm:col-span-2">
              <Input
                value={contactForm.tags}
                onChange={(e) => setContactForm((f) => ({ ...f, tags: e.target.value }))}
                placeholder="pisahkan dengan koma, cth. decision-maker, warm"
              />
            </Field>
          </div>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={() => setNewContactOpen(false)} disabled={contactSubmitting}>Batal</Button>
            <Button
              onClick={submitNewContact}
              disabled={contactSubmitting}
              className="bg-teal-600 text-white hover:bg-teal-700"
            >
              {contactSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
              Simpan Kontak
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ---------- Dialog Detail Kontak ---------- */}
      <Dialog open={!!selectedContact} onOpenChange={(o) => { if (!o) setSelectedContact(null) }}>
        <DialogContent className={cn('max-h-[90vh] overflow-y-auto rounded-xl sm:max-w-lg', SCROLLBAR)}>
          {selectedContact && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2.5">
                  <UserAvatar name={selectedContact.fullName} color={avatarColorFor(selectedContact.fullName)} size={38} />
                  <span className="min-w-0">
                    <span className="block truncate">{selectedContact.fullName}</span>
                    {selectedContact.position && (
                      <span className="block truncate text-xs font-normal text-slate-500">{selectedContact.position}</span>
                    )}
                  </span>
                  {selectedContact.isPrimary && (
                    <Badge className="shrink-0 border-0 bg-amber-100 text-amber-700">
                      <Star className="mr-1 h-3 w-3 fill-amber-400 text-amber-400" />
                      Kontak Utama
                    </Badge>
                  )}
                </DialogTitle>
                <DialogDescription>
                  Detail lengkap kontak{selectedContact.company ? ` · ${selectedContact.company.name}` : ''}
                </DialogDescription>
              </DialogHeader>

              <div className="grid grid-cols-1 gap-x-5 gap-y-3 sm:grid-cols-2">
                <DetailField label="Perusahaan" value={selectedContact.company?.name} icon={Building2} />
                <DetailField label="Posisi" value={selectedContact.position} icon={Briefcase} />
                <DetailField label="Email" value={selectedContact.email} icon={Mail} />
                <DetailField label="Email Alternatif" value={selectedContact.altEmail} icon={Mail} />
                <DetailField label="WhatsApp" value={selectedContact.whatsapp} icon={MessageCircle} />
                <DetailField label="Telepon" value={selectedContact.phone} icon={Phone} />
                <DetailField
                  label="Negara / Kota"
                  value={[selectedContact.city, selectedContact.country].filter(Boolean).join(', ') || undefined}
                  icon={MapPin}
                />
                <DetailField label="Zona Waktu" value={selectedContact.timezone} icon={Clock} />
                <DetailField label="Bahasa" value={languageLabel(selectedContact.language)} icon={Languages} />
                <DetailField label="LinkedIn" value={selectedContact.linkedin} icon={Linkedin} />
                <DetailField
                  label="Kanal Preferensi"
                  value={(
                    <span className="inline-flex items-center gap-1.5">
                      <ChannelIcon channel={selectedContact.preferredChannel} />
                      {channelMeta(selectedContact.preferredChannel).label}
                    </span>
                  )}
                />
                <DetailField label="Dibuat" value={formatDate(selectedContact.createdAt, true)} icon={Calendar} />
                <DetailField label="Consent" value={<ConsentBadge status={selectedContact.consentStatus} />} />
                {selectedContact.tags.length > 0 && (
                  <div className="sm:col-span-2">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Tags</p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {selectedContact.tags.map((t) => (
                        <Badge key={t} variant="outline" className="px-1.5 py-0 text-[10px] font-normal text-slate-500">{t}</Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <DialogFooter className="flex-row items-center justify-start gap-2 sm:justify-start">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!selectedContact.whatsapp}
                  onClick={() => selectedContact.whatsapp && void copyText(selectedContact.whatsapp, 'Nomor WhatsApp')}
                  className="gap-1.5"
                >
                  <Copy className="h-3.5 w-3.5" />
                  Salin WhatsApp
                </Button>
                <Button
                  size="sm"
                  disabled={!selectedContact.companyId || brands.length === 0}
                  onClick={() => openOppDialog(selectedContact)}
                  className="gap-1.5 bg-teal-600 text-white hover:bg-teal-700"
                >
                  <Target className="h-3.5 w-3.5" />
                  Buat Opportunity
                </Button>
              </DialogFooter>
              {!selectedContact.companyId && (
                <p className="-mt-2 text-xs text-amber-600">
                  Kontak belum terhubung ke perusahaan — opportunity wajib memiliki perusahaan. Hubungkan lewat edit kontak terlebih dahulu.
                </p>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ---------- Dialog Buat Opportunity ---------- */}
      <Dialog open={!!oppDialogContact} onOpenChange={(o) => { if (!o) setOppDialogContact(null) }}>
        <DialogContent className="rounded-xl sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Buat Opportunity</DialogTitle>
            <DialogDescription>
              Untuk kontak{' '}
              <span className="font-medium text-slate-700">{oppDialogContact?.fullName ?? '—'}</span>
              {oppDialogContact?.company?.name ? (
                <> · <span className="font-medium text-slate-700">{oppDialogContact.company.name}</span></>
              ) : null}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <Field label="Judul Opportunity" required>
              <Input
                value={oppForm.title}
                onChange={(e) => setOppForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="cth. Produksi video profil perusahaan 2026"
                autoFocus
              />
            </Field>
            <Field label="Brand" required>
              <Select
                value={oppForm.brandId}
                onValueChange={(id) => setOppForm((f) => ({ ...f, brandId: id, serviceId: '' }))}
              >
                <SelectTrigger><SelectValue placeholder="— Pilih brand —" /></SelectTrigger>
                <SelectContent>
                  {brands.map((b) => (
                    <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Layanan">
              <Select
                value={oppForm.serviceId}
                onValueChange={(id) => setOppForm((f) => ({ ...f, serviceId: id }))}
                disabled={oppServices.length === 0}
              >
                <SelectTrigger>
                  <SelectValue placeholder={oppServices.length ? '— Pilih layanan —' : 'Brand tidak memiliki layanan'} />
                </SelectTrigger>
                <SelectContent className={cn('max-h-64 overflow-y-auto', SCROLLBAR)}>
                  {oppServices.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label={`Estimasi Nilai (${oppCurrency})`}>
              <Input
                type="number"
                min={0}
                inputMode="numeric"
                value={oppForm.value}
                onChange={(e) => setOppForm((f) => ({ ...f, value: e.target.value }))}
                placeholder="0"
              />
            </Field>
            <p className="text-[11px] leading-relaxed text-slate-400">
              Opportunity dibuat dengan sumber lead <span className="font-medium text-slate-500">Referral</span> dan kanal{' '}
              <span className="font-medium text-slate-500">WhatsApp</span>, langsung muncul di Sales Pipeline.
            </p>
          </div>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={() => setOppDialogContact(null)} disabled={oppSubmitting}>Batal</Button>
            <Button
              onClick={submitOpportunity}
              disabled={oppSubmitting || !oppDialogContact?.companyId || brands.length === 0}
              className="bg-teal-600 text-white hover:bg-teal-700"
            >
              {oppSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
              Buat Opportunity
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

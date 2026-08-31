/* ============ New Lead Dialog — manual & simulasi website ============ */
'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { crmApi } from './api-client'
import { useCrmStore } from './crm-store'
import { useToast } from '@/hooks/use-toast'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { CompanyDTO, ContactDTO } from '@/lib/crm-types'
import { Loader2, Plus, Globe, UserRound } from 'lucide-react'

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
  onCreated?: (opportunityId: string) => void
}

export default function NewLeadDialog({ open, onOpenChange, onCreated }: Props) {
  const brands = useCrmStore((s) => s.brands)
  const { toast } = useToast()

  const [mode, setMode] = useState('manual')
  const [companies, setCompanies] = useState<CompanyDTO[]>([])
  const [contacts, setContacts] = useState<ContactDTO[]>([])
  const [loading, setLoading] = useState(false)

  // manual form
  const [title, setTitle] = useState('')
  const [companyId, setCompanyId] = useState('')
  const [contactId, setContactId] = useState('')
  const [brandId, setBrandId] = useState('')
  const [serviceId, setServiceId] = useState('')
  const [value, setValue] = useState('')
  const [brief, setBrief] = useState('')

  // website form
  const [wName, setWName] = useState('')
  const [wEmail, setWEmail] = useState('')
  const [wWa, setWWa] = useState('')
  const [wBrandId, setWBrandId] = useState('')
  const [wServiceId, setWServiceId] = useState('')
  const [wMessage, setWMessage] = useState('')

  useEffect(() => {
    if (!open) return
    crmApi.companies().then(setCompanies).catch(() => setCompanies([]))
  }, [open])

  useEffect(() => {
    if (!companyId) { setContacts([]); setContactId(''); return }
    crmApi.contacts(`companyId=${companyId}`).then(setContacts).catch(() => setContacts([]))
  }, [companyId])

  const selectedBrand = useMemo(() => brands.find(b => b.id === brandId), [brands, brandId])
  const wSelectedBrand = useMemo(() => brands.find(b => b.id === wBrandId), [brands, wBrandId])

  const submitManual = async () => {
    if (!title || !companyId || !contactId || !brandId) {
      toast({ title: 'Lengkapi data', description: 'Judul, perusahaan, kontak, dan brand wajib diisi.', variant: 'destructive' })
      return
    }
    setLoading(true)
    try {
      const opp = await crmApi.createOpportunity({
        title, companyId, contactId, sourceBrandId: brandId, executingBrandId: brandId,
        serviceId: serviceId || undefined, leadSource: 'REFERRAL', channel: 'WHATSAPP',
        estimatedValue: Number(value) || 0, brief: brief || undefined, currency: selectedBrand?.primaryCurrency ?? 'IDR',
      })
      toast({ title: 'Opportunity dibuat', description: `${opp.code} masuk ke pipeline stage New.` })
      resetManual()
      onOpenChange(false)
      onCreated?.(opp.id)
    } catch (e) {
      toast({ title: 'Gagal membuat opportunity', description: e instanceof Error ? e.message : 'Coba lagi', variant: 'destructive' })
    } finally { setLoading(false) }
  }

  const submitWebsite = async () => {
    if (!wName || !wEmail || !wBrandId || !wMessage) {
      toast({ title: 'Lengkapi data', description: 'Nama, email, brand, dan pesan wajib diisi.', variant: 'destructive' })
      return
    }
    setLoading(true)
    try {
      const res = await crmApi.websiteForm({ websiteForm: { name: wName, email: wEmail, whatsapp: wWa || undefined, message: wMessage, brandId: wBrandId, serviceId: wServiceId || undefined } })
      toast({ title: 'Lead website masuk 🎉', description: `Contact ${res.created ? 'baru dibuat' : 'sudah ada (terdeteksi anti-duplikat)'} + opportunity stage New.` })
      resetWebsite()
      onOpenChange(false)
      onCreated?.(res.opportunityId)
    } catch (e) {
      toast({ title: 'Gagal mengirim form', description: e instanceof Error ? e.message : 'Coba lagi', variant: 'destructive' })
    } finally { setLoading(false) }
  }

  const resetManual = () => { setTitle(''); setCompanyId(''); setContactId(''); setBrandId(''); setServiceId(''); setValue(''); setBrief('') }
  const resetWebsite = () => { setWName(''); setWEmail(''); setWWa(''); setWBrandId(''); setWServiceId(''); setWMessage('') }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Lead Baru</DialogTitle>
          <DialogDescription>Catat lead manual dari meeting/referral, atau simulasikan lead masuk dari form website.</DialogDescription>
        </DialogHeader>
        <Tabs value={mode} onValueChange={setMode}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="manual" className="gap-1.5"><UserRound className="h-3.5 w-3.5" /> Manual</TabsTrigger>
            <TabsTrigger value="website" className="gap-1.5"><Globe className="h-3.5 w-3.5" /> Form Website</TabsTrigger>
          </TabsList>

          <TabsContent value="manual" className="space-y-3 pt-2">
            <div className="space-y-1.5">
              <Label>Judul kebutuhan *</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="cth: Redesign website corporate" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Perusahaan *</Label>
                <Select value={companyId} onValueChange={setCompanyId}>
                  <SelectTrigger><SelectValue placeholder="Pilih" /></SelectTrigger>
                  <SelectContent className="max-h-64">
                    {companies.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Kontak *</Label>
                <Select value={contactId} onValueChange={setContactId} disabled={!companyId}>
                  <SelectTrigger><SelectValue placeholder={companyId ? 'Pilih' : 'Pilih perusahaan dulu'} /></SelectTrigger>
                  <SelectContent className="max-h-64">
                    {contacts.map(c => <SelectItem key={c.id} value={c.id}>{c.fullName}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Brand *</Label>
                <Select value={brandId} onValueChange={(v) => { setBrandId(v); setServiceId('') }}>
                  <SelectTrigger><SelectValue placeholder="Pilih brand" /></SelectTrigger>
                  <SelectContent>
                    {brands.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Layanan</Label>
                <Select value={serviceId} onValueChange={setServiceId} disabled={!selectedBrand}>
                  <SelectTrigger><SelectValue placeholder="Pilih layanan" /></SelectTrigger>
                  <SelectContent className="max-h-64">
                    {selectedBrand?.services.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Estimasi nilai ({selectedBrand?.primaryCurrency ?? 'IDR'})</Label>
              <Input type="number" value={value} onChange={(e) => setValue(e.target.value)} placeholder="cth: 150000000" />
            </div>
            <div className="space-y-1.5">
              <Label>Brief singkat</Label>
              <Textarea rows={2} value={brief} onChange={(e) => setBrief(e.target.value)} placeholder="Konteks awal kebutuhan klien…" />
            </div>
            <Button onClick={submitManual} disabled={loading} className="w-full gap-2 bg-slate-900 hover:bg-slate-800">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Buat Opportunity
            </Button>
          </TabsContent>

          <TabsContent value="website" className="space-y-3 pt-2">
            <p className="rounded-lg bg-teal-50 px-3 py-2 text-xs text-teal-800">
              Mensimulasikan lead masuk dari form website publik → sistem mencocokkan identitas (anti-duplikat), membuat Contact/Company bila belum ada, lalu membuat opportunity stage <b>New</b>.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Nama *</Label>
                <Input value={wName} onChange={(e) => setWName(e.target.value)} placeholder="Nama pendaftar" />
              </div>
              <div className="space-y-1.5">
                <Label>Email *</Label>
                <Input type="email" value={wEmail} onChange={(e) => setWEmail(e.target.value)} placeholder="nama@perusahaan.com" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>WhatsApp</Label>
              <Input value={wWa} onChange={(e) => setWWa(e.target.value)} placeholder="+62812…" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Brand tujuan *</Label>
                <Select value={wBrandId} onValueChange={(v) => { setWBrandId(v); setWServiceId('') }}>
                  <SelectTrigger><SelectValue placeholder="Pilih brand" /></SelectTrigger>
                  <SelectContent>
                    {brands.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Layanan diminati</Label>
                <Select value={wServiceId} onValueChange={setWServiceId} disabled={!wSelectedBrand}>
                  <SelectTrigger><SelectValue placeholder="Opsional" /></SelectTrigger>
                  <SelectContent className="max-h-64">
                    {wSelectedBrand?.services.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Pesan *</Label>
              <Textarea rows={3} value={wMessage} onChange={(e) => setWMessage(e.target.value)} placeholder="Halo, kami butuh…" />
            </div>
            <Button onClick={submitWebsite} disabled={loading} className="w-full gap-2 bg-teal-600 hover:bg-teal-700">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Globe className="h-4 w-4" />} Kirim sebagai Lead Website
            </Button>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}

/* ============ CRM Global Store (zustand) ============ */
'use client'

import { create } from 'zustand'
import type { SessionUser, BrandDTO, UserDTO } from '@/lib/crm-types'

export type ViewKey =
  | 'portal' | 'dashboard' | 'inbox' | 'contacts' | 'pipeline' | 'followup'
  | 'projects' | 'quotations' | 'finance' | 'brands' | 'users' | 'audit'

interface CrmState {
  hydrated: boolean
  user: SessionUser | null
  users: UserDTO[]
  brands: BrandDTO[]
  view: ViewKey
  focusOpportunityId: string | null
  focusCompanyId: string | null
  setHydrated: (v: boolean) => void
  setSession: (user: SessionUser | null, users: UserDTO[], brands: BrandDTO[]) => void
  setBrands: (brands: BrandDTO[]) => void
  setView: (view: ViewKey) => void
  openOpportunity: (id: string) => void   // pindah ke pipeline & buka detail
  openCompany: (id: string) => void       // pindah ke contacts & buka company
  clearFocus: () => void
}

export const useCrmStore = create<CrmState>((set) => ({
  hydrated: false,
  user: null,
  users: [],
  brands: [],
  view: 'dashboard',
  focusOpportunityId: null,
  focusCompanyId: null,
  setHydrated: (v) => set({ hydrated: v }),
  setSession: (user, users, brands) => set({ user, users, brands }),
  setBrands: (brands) => set({ brands }),
  setView: (view) => set({ view }),
  openOpportunity: (id) => set({ view: 'pipeline', focusOpportunityId: id, focusCompanyId: null }),
  openCompany: (id) => set({ view: 'contacts', focusCompanyId: id, focusOpportunityId: null }),
  clearFocus: () => set({ focusOpportunityId: null, focusCompanyId: null }),
}))

/* Akses helper */
export const can = (role: string | undefined, action: string): boolean => {
  if (!role) return false
  const matrix: Record<string, string[]> = {
    SUPER_ADMIN: ['*'],
    DIREKTUR: ['view_all', 'comment', 'approve', 'export', 'dashboard', 'edit_priority'],
    MARKETING: ['inbox', 'contacts_edit', 'opportunity_edit', 'log_interaction', 'export_basic'],
    KEUANGAN: ['finance', 'export'],
    PRODUKSI: ['production'],
  }
  const perms = matrix[role] ?? []
  return perms.includes('*') || perms.includes(action)
}

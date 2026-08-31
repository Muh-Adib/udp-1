/* ============ Excel Export — multi-sheet .xlsx (client-side) ============ */
'use client'

import * as XLSX from 'xlsx'

export interface ExcelSheet {
  /** Nama sheet — maks 31 karakter (melebihi otomatis dipotong; karakter terlarang []:*?/\ diganti spasi) */
  name: string
  /** Baris array-of-arrays: number ditulis sebagai sel numerik Excel asli, string sebagai teks, null kosong */
  rows: (string | number | null)[][]
}

/**
 * Ekspor beberapa sheet ke SATU berkas .xlsx (Office Open XML — berkas ZIP dgn magic bytes "PK",
 * MIME application/vnd.openxmlformats-officedocument.spreadsheetml.sheet — bukan CSV biasa).
 * Sel bertipe number tetap numerik di Excel sehingga bisa langsung di-sum/format ulang.
 * Pola pemakaian mengikuti downloadCsv di components/crm/shared.tsx (dipanggil dari 'use client').
 */
export function exportExcel(filename: string, sheets: ExcelSheet[]): void {
  const wb = XLSX.utils.book_new()
  for (const sheet of sheets) {
    // Excel membatasi nama sheet ≤31 karakter & melarang []:*?/\
    const name = sheet.name.slice(0, 31).replace(/[*?:[\]/\\]/g, ' ').trim() || 'Sheet'
    const ws = XLSX.utils.aoa_to_sheet(sheet.rows)
    XLSX.utils.book_append_sheet(wb, ws, name)
  }
  XLSX.writeFile(wb, filename)
}

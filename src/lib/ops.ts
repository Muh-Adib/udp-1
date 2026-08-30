/**
 * Utilitas bersama modul Keuangan & Produksi:
 * penomoran dokumen, status invoice efektif, mapping DTO, template milestone.
 */
import { db } from "@/lib/db";
import type {
  BriefDTO,
  BriefStatus,
  DeliverableDTO,
  DeliverableType,
  EstimateItemDTO,
  InvoiceDTO,
  InvoiceStatus,
  MilestoneDTO,
  ProjectDTO,
  ProjectStatus,
  QuotationDTO,
  QuotationItemDTO,
  QuotationStatus,
  WorkEstimateDTO,
} from "@/lib/crm-types";

/** Nomor dokumen berurutan: QT-0001, PRJ-0001, INV-0001, BRF-0001. */
export async function nextDocNumber(prefix: "QT" | "PRJ" | "INV" | "BRF"): Promise<string> {
  const n = await db.$transaction(async (tx) => {
    if (prefix === "QT") return tx.quotation.count();
    if (prefix === "PRJ") return tx.project.count();
    if (prefix === "BRF") return tx.brief.count();
    return tx.invoice.count();
  });
  return `${prefix}-${String(n + 1).padStart(4, "0")}`;
}

/** Status efektif invoice: OVERDUE dihitung saat baca, PAID bila terbayar penuh. */
export function effectiveInvoiceStatus(
  inv: { status: string; dueDate: Date | null; grandTotal: number },
  paidAmount: number
): InvoiceStatus {
  if (paidAmount >= inv.grandTotal && inv.grandTotal > 0) return "PAID";
  if (paidAmount > 0) return inv.dueDate && inv.dueDate.getTime() < Date.now() ? "OVERDUE" : "PARTIAL";
  if (inv.dueDate && inv.dueDate.getTime() < Date.now()) return "OVERDUE";
  return inv.status as InvoiceStatus;
}

export function mapEstimate(
  e: {
    id: string; briefId: string; itemsJson: string; totalHours: number; totalCost: number;
    notes: string | null; createdByName: string | null; createdAt: Date;
  }
): WorkEstimateDTO {
  let items: EstimateItemDTO[] = [];
  try {
    const parsed = JSON.parse(e.itemsJson);
    if (Array.isArray(parsed)) items = parsed;
  } catch {
    items = [];
  }
  return {
    id: e.id,
    briefId: e.briefId,
    items,
    totalHours: e.totalHours,
    totalCost: e.totalCost,
    notes: e.notes,
    createdByName: e.createdByName,
    createdAt: e.createdAt.toISOString(),
  };
}

export function mapBrief(
  b: {
    id: string; code: string; leadId: string; brand: string; title: string; objective: string;
    audience: string | null; deliverables: string; references: string | null; deadline: Date | null;
    notes: string | null; status: string; createdByName: string | null; createdAt: Date;
  },
  estimates: Parameters<typeof mapEstimate>[0][],
  extra?: {
    lead?: BriefDTO["lead"];
    projectCode?: string | null;
  }
): BriefDTO {
  return {
    id: b.id,
    code: b.code,
    leadId: b.leadId,
    brand: b.brand,
    title: b.title,
    objective: b.objective,
    audience: b.audience,
    deliverables: b.deliverables,
    references: b.references,
    deadline: b.deadline?.toISOString() ?? null,
    notes: b.notes,
    status: b.status as BriefStatus,
    createdByName: b.createdByName,
    createdAt: b.createdAt.toISOString(),
    lead: extra?.lead ?? null,
    estimates: estimates.map(mapEstimate),
    projectCode: extra?.projectCode ?? null,
  };
}

export function mapDeliverable(
  d: {
    id: string; projectId: string; name: string; type: string; url: string | null;
    fileName: string | null; mimeType: string | null; sizeLabel: string | null;
    milestoneLabel: string | null; note: string | null; uploadedByName: string; createdAt: Date;
  }
): DeliverableDTO {
  return {
    id: d.id,
    projectId: d.projectId,
    name: d.name,
    type: d.type as DeliverableType,
    url: d.url,
    fileName: d.fileName,
    mimeType: d.mimeType,
    sizeLabel: d.sizeLabel,
    milestoneLabel: d.milestoneLabel,
    note: d.note,
    uploadedByName: d.uploadedByName,
    createdAt: d.createdAt.toISOString(),
  };
}

export function mapQuotation(
  q: {
    id: string; number: string; leadId: string; brand: string; title: string; itemsJson: string;
    subtotal: number; discountPct: number; ppnPct: number; grandTotal: number; status: string;
    notes: string | null; sentAt: Date | null; decidedAt: Date | null; decidedNote: string | null; createdAt: Date;
  },
  extra?: { lead?: { code: string; subject: string; contactName: string; companyName?: string | null } | null; projectCode?: string | null }
): QuotationDTO {
  let items: QuotationItemDTO[] = [];
  try {
    const parsed = JSON.parse(q.itemsJson);
    if (Array.isArray(parsed)) items = parsed;
  } catch {
    items = [];
  }
  return {
    id: q.id,
    number: q.number,
    leadId: q.leadId,
    brand: q.brand,
    title: q.title,
    items,
    subtotal: q.subtotal,
    discountPct: q.discountPct,
    ppnPct: q.ppnPct,
    grandTotal: q.grandTotal,
    status: q.status as QuotationStatus,
    notes: q.notes,
    sentAt: q.sentAt?.toISOString() ?? null,
    decidedAt: q.decidedAt?.toISOString() ?? null,
    decidedNote: q.decidedNote,
    createdAt: q.createdAt.toISOString(),
    lead: extra?.lead ?? null,
    projectCode: extra?.projectCode ?? null,
  };
}

export function mapInvoice(
  inv: {
    id: string; number: string; brand: string; title: string; amount: number; ppnPct: number; grandTotal: number;
    dueDate: Date | null; status: string; issuedAt: Date;
  },
  payments: { id: string; amount: number; method: string; note: string | null; paidAt: Date }[],
  extra?: { projectCode?: string | null; quotationNumber?: string | null; companyName?: string | null }
): InvoiceDTO {
  const paidAmount = payments.reduce((s, p) => s + p.amount, 0);
  return {
    id: inv.id,
    number: inv.number,
    brand: inv.brand,
    title: inv.title,
    amount: inv.amount,
    ppnPct: inv.ppnPct,
    grandTotal: inv.grandTotal,
    paidAmount,
    dueDate: inv.dueDate?.toISOString() ?? null,
    status: effectiveInvoiceStatus(inv, paidAmount),
    issuedAt: inv.issuedAt.toISOString(),
    projectCode: extra?.projectCode ?? null,
    quotationNumber: extra?.quotationNumber ?? null,
    companyName: extra?.companyName ?? null,
    payments: payments.map((p) => ({ id: p.id, amount: p.amount, method: p.method, paidAt: p.paidAt.toISOString(), note: p.note })),
  };
}

export function mapProject(
  p: {
    id: string; code: string; name: string; brand: string; status: string; progress: number; budget: number;
    managerName: string | null; startDate: Date | null; dueDate: Date | null; createdAt: Date;
  },
  milestones: { id: string; title: string; orderIdx: number; weight: number; status: string; dueDate: Date | null; doneAt: Date | null }[],
  extra?: {
    companyName?: string | null;
    leadCode?: string | null;
    quotationNumber?: string | null;
    billedAmount?: number;
    deliverables?: Parameters<typeof mapDeliverable>[0][];
    brief?: { code: string; title: string; objective: string; deliverables: string; deadline: Date | null } | null;
  }
): ProjectDTO {
  const ms: MilestoneDTO[] = milestones
    .slice()
    .sort((a, b) => a.orderIdx - b.orderIdx)
    .map((m) => ({
      id: m.id,
      title: m.title,
      orderIdx: m.orderIdx,
      weight: m.weight,
      status: m.status as MilestoneDTO["status"],
      dueDate: m.dueDate?.toISOString() ?? null,
      doneAt: m.doneAt?.toISOString() ?? null,
    }));
  return {
    id: p.id,
    code: p.code,
    name: p.name,
    brand: p.brand,
    status: p.status as ProjectStatus,
    progress: p.progress,
    budget: p.budget,
    managerName: p.managerName,
    startDate: p.startDate?.toISOString() ?? null,
    dueDate: p.dueDate?.toISOString() ?? null,
    companyName: extra?.companyName ?? null,
    leadCode: extra?.leadCode ?? null,
    quotationNumber: extra?.quotationNumber ?? null,
    billedAmount: extra?.billedAmount ?? 0,
    milestones: ms,
    deliverables: extra?.deliverables ? extra.deliverables.map(mapDeliverable) : [],
    brief: extra?.brief
      ? {
          code: extra.brief.code,
          title: extra.brief.title,
          objective: extra.brief.objective,
          deliverables: extra.brief.deliverables,
          deadline: extra.brief.deadline?.toISOString() ?? null,
        }
      : null,
  };
}

/** Template milestone default untuk proyek produksi baru. */
export function defaultMilestones(): { title: string; orderIdx: number; weight: number; offsetDays: number }[] {
  return [
    { title: "Brief & Konsep", orderIdx: 1, weight: 20, offsetDays: 5 },
    { title: "Produksi Awal", orderIdx: 2, weight: 30, offsetDays: 12 },
    { title: "Review & Revisi", orderIdx: 3, weight: 20, offsetDays: 20 },
    { title: "Finalisasi", orderIdx: 4, weight: 20, offsetDays: 28 },
    { title: "Serah Terima", orderIdx: 5, weight: 10, offsetDays: 30 },
  ];
}

/** Recompute progress proyek dari milestone DONE. */
export function progressFromMilestones(
  milestones: { weight: number; status: string }[]
): number {
  const total = milestones.reduce((s, m) => s + m.weight, 0) || 100;
  const done = milestones.filter((m) => m.status === "DONE").reduce((s, m) => s + m.weight, 0);
  return Math.min(100, Math.round((done / total) * 100));
}

/** Label bulan singkat id-ID untuk chart. */
export function monthLabel(d: Date): string {
  return d.toLocaleDateString("id-ID", { month: "short" }) + " " + String(d.getFullYear()).slice(2);
}

/** Daftar 6 bulan terakhir (tertua → terbaru), each {key: "2026-01", label}. */
export function lastMonths(n = 6): { key: string; label: string }[] {
  const out: { key: string; label: string }[] = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push({ key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`, label: monthLabel(d) });
  }
  return out;
}

export function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { LEAD_STAGES, type LeadStage, type PipelineLeadDTO, type PipelineStats } from "@/lib/crm-types";

/** GET /api/pipeline — data funnel & kanban pipeline penjualan. */
export async function GET() {
  const user = await requireAuth(["OWNER", "MANAGER", "MARKETER", "PRODUCTION", "FINANCE"]);
  if (!user) return NextResponse.json({ error: "Tidak diizinkan" }, { status: 401 });

  const leads = await db.lead.findMany({
    include: {
      contact: true,
      assignee: { select: { id: true, name: true } },
      company: { select: { name: true } },
      quotations: { select: { id: true } },
      messages: { orderBy: { createdAt: "desc" }, take: 1 },
    },
    orderBy: { updatedAt: "desc" },
    take: 300,
  });

  const stageStats = new Map<LeadStage, { count: number; value: number }>();
  for (const s of LEAD_STAGES) stageStats.set(s, { count: 0, value: 0 });

  const dtos: PipelineLeadDTO[] = leads.map((l) => {
    const stage = ((LEAD_STAGES as string[]).includes(l.stage) ? l.stage : "NEW") as LeadStage;
    const bucket = stageStats.get(stage)!;
    bucket.count += 1;
    bucket.value += l.estValue ?? 0;
    return {
      id: l.id,
      code: l.code,
      subject: l.subject,
      brand: l.brand,
      channel: l.channel as PipelineLeadDTO["channel"],
      status: l.status as PipelineLeadDTO["status"],
      stage,
      estValue: l.estValue ?? 0,
      score: l.score,
      sourceRef: l.sourceRef,
      lostReason: l.lostReason,
      createdAt: l.createdAt.toISOString(),
      updatedAt: l.updatedAt.toISOString(),
      quotationCount: l.quotations.length,
      contact: {
        id: l.contact.id,
        name: l.contact.name,
        email: l.contact.email,
        phone: l.contact.phone,
        igUsername: l.contact.igUsername,
        company: l.company?.name ?? null,
      },
      assignee: l.assignee ? { id: l.assignee.id, name: l.assignee.name } : null,
      lastMessage: l.messages[0]
        ? { body: l.messages[0].body, direction: l.messages[0].direction, createdAt: l.messages[0].createdAt.toISOString(), channel: l.messages[0].channel }
        : null,
    };
  });

  const total = leads.length;
  const won = stageStats.get("WON")!;
  const lost = stageStats.get("LOST")!;
  const newSt = stageStats.get("NEW")!;
  const qual = stageStats.get("QUALIFIED")!;
  const prop = stageStats.get("PROPOSAL")!;
  const nego = stageStats.get("NEGOTIATION")!;

  const stats: PipelineStats = {
    stages: [
      { stage: "NEW", ...newSt, pctOfWon: total ? Math.round((newSt.count / total) * 100) : 0 },
      { stage: "QUALIFIED", ...qual, pctOfWon: total ? Math.round((qual.count / total) * 100) : 0 },
      { stage: "PROPOSAL", ...prop, pctOfWon: total ? Math.round((prop.count / total) * 100) : 0 },
      { stage: "NEGOTIATION", ...nego, pctOfWon: total ? Math.round((nego.count / total) * 100) : 0 },
      { stage: "WON", ...won, pctOfWon: total ? Math.round((won.count / total) * 100) : 0 },
      { stage: "LOST", ...lost, pctOfWon: total ? Math.round((lost.count / total) * 100) : 0 },
    ],
    totalOpen: newSt.count + qual.count + prop.count + nego.count,
    totalValueOpen: newSt.value + qual.value + prop.value + nego.value,
    wonCount: won.count,
    wonValue: won.value,
    lostCount: lost.count,
    conversionPct: won.count + lost.count > 0 ? Math.round((won.count / (won.count + lost.count)) * 100) : 0,
    avgDealSize: won.count > 0 ? Math.round(won.value / won.count) : 0,
  };

  return NextResponse.json({ stats, leads: dtos });
}

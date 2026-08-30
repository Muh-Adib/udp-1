import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { ensureChannelConfigs, toChannelDTO } from "@/lib/channels";
import type { DashboardStats, LeadDTO, LeadStatus, ChannelType } from "@/lib/crm-types";

const CHANNELS_ALL: (ChannelType | "manual")[] = ["whatsapp", "email", "instagram", "web", "manual"];

export async function GET() {
  const user = await requireAuth(["OWNER", "MANAGER", "MARKETER", "FINANCE"]);
  if (!user) return NextResponse.json({ error: "Tidak diizinkan" }, { status: 401 });

  const slaRow = await db.appSetting.findUnique({ where: { key: "firstResponseSlaHours" } });
  const slaHours = slaRow ? Number(slaRow.value) : 2;

  const since7d = new Date(Date.now() - 7 * 24 * 3600 * 1000);

  const [statusGroups, channelGroups, recentRaw, responded, withIn, configsRaw] = await Promise.all([
    db.lead.groupBy({ by: ["status"], _count: { _all: true } }),
    db.lead.groupBy({ by: ["channel"], where: { createdAt: { gte: since7d } }, _count: { _all: true } }),
    db.lead.findMany({
      include: {
        contact: true,
        assignee: { select: { id: true, name: true } },
        messages: { orderBy: { createdAt: "desc" }, take: 1 },
      },
      orderBy: { createdAt: "desc" },
      take: 8,
    }),
    db.lead.count({ where: { firstOutAt: { not: null } } }),
    db.lead.count({ where: { firstInAt: { not: null } } }),
    (async () => {
      await ensureChannelConfigs();
      return db.channelConfig.findMany({ orderBy: { type: "asc" } });
    })(),
  ]);

  const byStatus = Object.fromEntries(statusGroups.map((g) => [g.status, g._count._all])) as Record<string, number>;
  const total = Object.values(byStatus).reduce((a, b) => a + b, 0);
  const chanCount = Object.fromEntries(channelGroups.map((g) => [g.channel, g._count._all]));
  const chanTotal = Object.values(chanCount).reduce((a, b) => a + b, 0) || 1;

  // rata-rata first response (menit)
  const respLeads = await db.lead.findMany({
    where: { firstInAt: { not: null }, firstOutAt: { not: null } },
    select: { firstInAt: true, firstOutAt: true },
    take: 200,
    orderBy: { firstOutAt: "desc" },
  });
  const diffs = respLeads.map((l) => (l.firstOutAt!.getTime() - l.firstInAt!.getTime()) / 60000).filter((d) => d >= 0);
  const avgFirstResponseMins = diffs.length ? Math.round(diffs.reduce((a, b) => a + b, 0) / diffs.length) : null;

  const recentLeads: LeadDTO[] = recentRaw.map((l) => ({
    id: l.id,
    code: l.code,
    subject: l.subject,
    brand: l.brand,
    channel: l.channel as LeadDTO["channel"],
    status: l.status as LeadStatus,
    score: l.score,
    sourceRef: l.sourceRef,
    lostReason: l.lostReason,
    createdAt: l.createdAt.toISOString(),
    updatedAt: l.updatedAt.toISOString(),
    slaOverdue: !l.firstOutAt && Date.now() - (l.firstInAt ?? l.createdAt).getTime() > slaHours * 3600 * 1000,
    contact: {
      id: l.contact.id,
      name: l.contact.name,
      email: l.contact.email,
      phone: l.contact.phone,
      igUsername: l.contact.igUsername,
      company: null,
    },
    assignee: l.assignee ? { id: l.assignee.id, name: l.assignee.name } : null,
    lastMessage: l.messages[0]
      ? { body: l.messages[0].body, direction: l.messages[0].direction, createdAt: l.messages[0].createdAt.toISOString(), channel: l.messages[0].channel }
      : null,
  }));

  const stats: DashboardStats = {
    totals: {
      all: total,
      new: byStatus["NEW"] ?? 0,
      followUp: byStatus["FOLLOW_UP"] ?? 0,
      quoted: byStatus["QUOTED"] ?? 0,
      won: byStatus["WON"] ?? 0,
      lost: byStatus["LOST"] ?? 0,
    },
    channelBreakdown: CHANNELS_ALL.map((c) => ({
      channel: c,
      count: chanCount[c] ?? 0,
      pct: Math.round(((chanCount[c] ?? 0) / chanTotal) * 100),
    })),
    channelHealth: configsRaw.map((r) => {
      const dto = toChannelDTO(r);
      return { type: dto.type, name: dto.name, enabled: dto.enabled, lastEventAt: dto.lastEventAt ?? null, eventCount: dto.eventCount };
    }),
    recentLeads,
    responseRatePct: withIn ? Math.round((responded / withIn) * 100) : 100,
    avgFirstResponseMins,
    slaHours,
  };

  return NextResponse.json({ stats });
}

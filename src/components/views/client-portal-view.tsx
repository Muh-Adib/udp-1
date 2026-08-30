"use client";

import { useEffect, useState } from "react";
import { Building2, Inbox, Phone } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChannelBadge } from "@/components/channel-badge";
import { toast } from "@/components/ui/sonner";
import { api } from "@/lib/api-client";
import {
  BRAND_LABEL,
  LEAD_STATUS_BADGE,
  LEAD_STATUS_LABEL,
  type LeadDTO,
  type LeadStatus,
  type SessionUser,
} from "@/lib/crm-types";

const ACTIVE_STATUSES: LeadStatus[] = ["NEW", "FOLLOW_UP", "QUOTED"];

/** Waktu relatif lokal: baru saja / Xm / Xj / Xh. */
function timeAgo(iso: string | null | undefined) {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return "baru saja";
  const m = Math.floor(diff / 60_000);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}j`;
  const d = Math.floor(h / 24);
  return `${d}h`;
}

function truncate(text: string, max = 120) {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function PortalSkeleton() {
  return (
    <div className="space-y-4">
      <div className="h-36 animate-pulse rounded-2xl bg-slate-200/70" />
      <div className="grid grid-cols-3 gap-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-24 animate-pulse rounded-2xl bg-slate-200/70" />
        ))}
      </div>
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-28 animate-pulse rounded-xl bg-slate-200/70" />
        ))}
      </div>
    </div>
  );
}

export default function ClientPortalView({ user }: { user: SessionUser }) {
  const [leads, setLeads] = useState<LeadDTO[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    api
      .leads()
      .then((res) => {
        if (!cancelled) setLeads(res.leads);
      })
      .catch((err) => {
        if (cancelled) return;
        toast.error(err instanceof Error ? err.message : "Gagal memuat pengajuan Anda.");
        if (!cancelled) setLeads([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) return <PortalSkeleton />;

  const total = leads?.length ?? 0;
  const inProgress = leads?.filter((l) => ACTIVE_STATUSES.includes(l.status)).length ?? 0;
  const done = leads?.filter((l) => l.status === "WON").length ?? 0;

  const statCards = [
    { label: "Total Pengajuan", value: total, valueClass: "text-slate-900", ring: "border-slate-200 bg-slate-50" },
    { label: "Sedang Diproses", value: inProgress, valueClass: "text-amber-600", ring: "border-amber-200 bg-amber-50" },
    { label: "Selesai", value: done, valueClass: "text-emerald-600", ring: "border-emerald-200 bg-emerald-50" },
  ];

  return (
    <div className="space-y-6">
      {/* Header portal */}
      <Card className="rounded-2xl border-emerald-200 bg-emerald-50/60">
        <CardContent className="flex items-start gap-4 px-5 py-5">
          <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700">
            <Building2 className="size-6" />
          </div>
          <div className="min-w-0 space-y-1">
            <CardTitle className="text-lg text-slate-900">Ringkasan Proyek &amp; Pengajuan Anda</CardTitle>
            <CardDescription>
              Pantau progres permintaan Anda dari semua kanal (WhatsApp, Email, Instagram, Web).
            </CardDescription>
            <p className="text-xs text-emerald-800">
              Masuk sebagai <span className="font-semibold">{user.name}</span> · Portal Klien
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Statistik */}
      <div className="grid grid-cols-3 gap-3">
        {statCards.map((s) => (
          <Card key={s.label} className={`rounded-2xl ${s.ring}`}>
            <CardContent className="px-3 py-4 sm:px-5">
              <p className="text-xs text-muted-foreground">{s.label}</p>
              <p className={`text-2xl font-bold tabular-nums sm:text-3xl ${s.valueClass}`}>{s.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Daftar lead */}
      <Card className="rounded-2xl">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Pengajuan Anda</CardTitle>
            {total > 0 && (
              <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-500">
                {total} pengajuan
              </Badge>
            )}
          </div>
          <CardDescription>Paling baru berada di urutan atas.</CardDescription>
        </CardHeader>
        <CardContent className="px-5 pb-5">
          {!leads || leads.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 text-center">
              <Inbox className="size-10 text-slate-300" />
              <p className="text-sm font-medium text-slate-700">Belum ada pengajuan</p>
              <p className="text-xs text-muted-foreground">
                Permintaan Anda yang masuk lewat kanal mana pun akan tampil di sini.
              </p>
            </div>
          ) : (
            <div className="max-h-96 space-y-3 overflow-y-auto pr-1">
              {leads.map((lead) => (
                <div key={lead.id} className="space-y-2 rounded-xl border border-slate-200 bg-white p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs text-slate-500">{lead.code}</span>
                    <Badge variant="outline" className={LEAD_STATUS_BADGE[lead.status]}>
                      {LEAD_STATUS_LABEL[lead.status]}
                    </Badge>
                    <ChannelBadge channel={lead.channel} />
                    <span className="ml-auto text-xs text-muted-foreground">
                      {timeAgo(lead.lastMessage?.createdAt ?? lead.updatedAt)}
                    </span>
                  </div>
                  <p className="text-sm font-medium text-slate-900">{lead.subject}</p>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-600">
                      {BRAND_LABEL[lead.brand] ?? lead.brand}
                    </Badge>
                    <span>·</span>
                    <span>{lead.contact.name}</span>
                  </div>
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    {lead.lastMessage ? (
                      <>
                        <span className="font-medium text-slate-600">Pesan terakhir:</span> {truncate(lead.lastMessage.body)}
                      </>
                    ) : (
                      "Belum ada pesan pada pengajuan ini."
                    )}
                  </p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Info bantuan */}
      <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        <Phone className="mt-0.5 size-4 shrink-0" />
        <span>
          Butuh bantuan? Hubungi tim kami via WhatsApp{" "}
          <span className="font-semibold">+62 811-2200-345</span>.
        </span>
      </div>
    </div>
  );
}

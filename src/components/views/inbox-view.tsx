"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AtSign,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  FileText,
  Filter,
  Inbox as InboxIcon,
  Loader2,
  Mail,
  MessageSquarePlus,
  Pencil,
  Phone,
  Search,
  Send,
  StickyNote,
  TriangleAlert,
  Trophy,
  UserRound,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ChannelBadge } from "@/components/channel-badge";
import { BrandDocDialog } from "@/components/brand-document";
import { CreateBriefFromLeadDialog, CreateQuotationFromLeadDialog } from "@/components/lead-doc-dialogs";
import { BriefDocContent, QuotationDocContent } from "@/components/doc-content";
import { IntakeLeadDialog } from "@/components/intake-lead-dialog";
import { ContactFormDialog } from "@/components/contact-form-dialog";
import { api } from "@/lib/api-client";
import { findCountry, formatPhoneDisplay } from "@/lib/countries";
import { ChannelIcon } from "@/lib/channel-meta";
import {
  LEAD_STATUS_BADGE,
  LEAD_STATUS_LABEL,
  REPLY_CHANNEL_LABEL,
  type BriefDTO,
  type ChannelAvailability,
  type ChannelType,
  type ContactDTO,
  type LeadDTO,
  type LeadMessageDTO,
  type LeadStatus,
  type QuotationDTO,
  type ReplyChannel,
  type SessionUser,
} from "@/lib/crm-types";
import { cn } from "@/lib/utils";

const STATUS_TABS: { key: string; label: string }[] = [
  { key: "OPEN", label: "Terbuka" },
  { key: "NEW", label: "Baru" },
  { key: "FOLLOW_UP", label: "Diikuti" },
  { key: "QUOTED", label: "Penawaran" },
  { key: "WON", label: "Menang" },
  { key: "LOST", label: "Hilang" },
  { key: "ALL", label: "Semua" },
];

const CHANNEL_FILTERS: { key: string; label: string }[] = [
  { key: "ALL", label: "Semua Kanal" },
  { key: "whatsapp", label: "WhatsApp" },
  { key: "email", label: "Email" },
  { key: "instagram", label: "Instagram" },
  { key: "web", label: "Form Web" },
  { key: "manual", label: "Manual" },
];

const LOST_REASONS = ["Harga", "Kompetitor", "Budget tidak ada", "Timing", "Tidak ada balasan", "Lainnya"];

/** Kanal keluar yang ditawarkan di komposer (form web bersifat pasif — tidak ada kotak masuk dua arah). */
const OUT_CHANNELS: ChannelType[] = ["whatsapp", "email", "instagram"];

/** Kanal mana yang benar-benar bisa dipakai membalas, berdasarkan handle kontak yang tersedia. */
function computeAvailability(contact: LeadDTO["contact"]): ChannelAvailability[] {
  const defs: { channel: ChannelType; destination: string | null; missingLabel: string }[] = [
    { channel: "whatsapp", destination: contact.phone ? formatPhoneDisplay(contact.phone) : null, missingLabel: "belum ada nomor WhatsApp" },
    { channel: "email", destination: contact.email ?? null, missingLabel: "belum ada email" },
    { channel: "instagram", destination: contact.igUsername ? `@${contact.igUsername}` : null, missingLabel: "belum ada username Instagram" },
  ];
  return defs.map((d) => ({
    channel: d.channel,
    available: Boolean(d.destination),
    destination: d.destination,
    missingLabel: d.destination ? null : d.missingLabel,
  }));
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "baru saja";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}j`;
  return `${Math.floor(h / 24)}h`;
}

export function InboxView({ user }: { user: SessionUser }) {
  const [leads, setLeads] = useState<LeadDTO[] | null>(null);
  const [status, setStatus] = useState("OPEN");
  const [channel, setChannel] = useState("ALL");
  const [q, setQ] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showIntake, setShowIntake] = useState(false);
  const canAct = ["OWNER", "MANAGER", "MARKETER"].includes(user.role);

  const load = useCallback(async () => {
    try {
      const { leads: rows } = await api.leads({ status, channel, q });
      setLeads(rows);
      setSelectedId((cur) => (cur && rows.some((r) => r.id === cur) ? cur : rows[0]?.id ?? null));
    } catch (e) {
      toast.error((e as Error).message);
    }
  }, [status, channel, q]);

  useEffect(() => {
    const t = setTimeout(() => void load(), q ? 300 : 0);
    return () => clearTimeout(t);
  }, [load, q]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold tracking-tight">Inbox Lead</h2>
          <p className="text-sm text-muted-foreground">
            Semua percakapan masuk dari WhatsApp, Email, Instagram, dan Form Web dalam satu antrean — catat lead baru lewat
            &quot;Lead Masuk&quot;.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative w-full sm:w-60">
            <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari nama, email, kode…" className="pl-8" />
          </div>
          <Select value={channel} onValueChange={setChannel}>
            <SelectTrigger className="w-[140px]" aria-label="Filter kanal">
              <Filter className="size-3.5 shrink-0 text-muted-foreground" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CHANNEL_FILTERS.map((c) => (
                <SelectItem key={c.key} value={c.key}>
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {canAct && (
            <Button onClick={() => setShowIntake(true)} aria-label="Catat lead masuk baru">
              <MessageSquarePlus className="size-4" /> Lead Masuk
            </Button>
          )}
        </div>
      </div>

      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {STATUS_TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setStatus(t.key)}
            className={cn(
              "whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer",
              status === t.key ? "border-transparent bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:bg-accent"
            )}
          >
            {t.label}
            {leads && t.key === status && <span className="ml-1.5 opacity-70">{leads.length}</span>}
          </button>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(300px,380px)_1fr]">
        {/* Daftar lead */}
        <Card className="overflow-hidden">
          <CardContent className="p-0">
            <div className="max-h-[65vh] min-h-40 overflow-y-auto lg:max-h-[70vh]">
              {leads === null ? (
                <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
                  <Loader2 className="mr-2 size-4 animate-spin" /> Memuat lead…
                </div>
              ) : leads.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-10 text-muted-foreground">
                  <InboxIcon className="size-8 opacity-40" />
                  <p className="text-sm">Belum ada lead pada filter ini</p>
                  {canAct && (
                    <Button size="sm" variant="outline" onClick={() => setShowIntake(true)}>
                      <MessageSquarePlus className="size-3.5" /> Catat Lead Masuk
                    </Button>
                  )}
                </div>
              ) : (
                leads.map((l) => (
                  <button
                    key={l.id}
                    onClick={() => setSelectedId(l.id)}
                    className={cn(
                      "w-full border-b px-3.5 py-3 text-left transition-colors hover:bg-accent/60 cursor-pointer",
                      selectedId === l.id && "bg-accent"
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-semibold">{l.contact.name}</span>
                      <span className="shrink-0 text-[11px] text-muted-foreground">{timeAgo(l.updatedAt)}</span>
                    </div>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">{l.subject}</p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1">
                      <ChannelBadge channel={l.channel} />
                      <Badge variant="outline" className={LEAD_STATUS_BADGE[l.status]}>
                        {LEAD_STATUS_LABEL[l.status]}
                      </Badge>
                      <Badge variant="outline" className="gap-0.5 font-mono text-[10px]">
                        {l.code}
                      </Badge>
                      {l.slaOverdue && (
                        <Badge variant="destructive" className="text-[10px]">
                          SLA terlewati
                        </Badge>
                      )}
                    </div>
                  </button>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        {/* Detail */}
        {selectedId ? (
          <LeadDetailPanel key={selectedId} leadId={selectedId} user={user} canAct={canAct} onChanged={() => void load()} />
        ) : (
          <Card className="hidden items-center justify-center lg:flex">
            <CardContent className="flex flex-col items-center gap-2 py-16 text-muted-foreground">
              <MessageSquarePlus className="size-8 opacity-40" />
              <p className="text-sm">Pilih lead untuk melihat percakapan</p>
            </CardContent>
          </Card>
        )}
      </div>

      <IntakeLeadDialog
        open={showIntake}
        onOpenChange={setShowIntake}
        onCreated={(result) => {
          void load();
          if (result.leadId) setSelectedId(result.leadId);
        }}
      />
    </div>
  );
}

function LeadDetailPanel({
  leadId,
  user,
  canAct,
  onChanged,
}: {
  leadId: string;
  user: SessionUser;
  canAct: boolean;
  onChanged: () => void;
}) {
  const [lead, setLead] = useState<(LeadDTO & { lostReason?: string | null }) | null>(null);
  const [messages, setMessages] = useState<LeadMessageDTO[]>([]);
  const [staff, setStaff] = useState<{ id: string; name: string; role: string }[]>([]);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [replyChannel, setReplyChannel] = useState<ReplyChannel>("internal");
  const [showLostDialog, setShowLostDialog] = useState(false);
  const [lostReason, setLostReason] = useState(LOST_REASONS[0]);
  const [showBriefDlg, setShowBriefDlg] = useState(false);
  const [showQuoteDlg, setShowQuoteDlg] = useState(false);
  const [showContactDlg, setShowContactDlg] = useState(false);
  const [docBrief, setDocBrief] = useState<BriefDTO | null>(null);
  const [docQuotation, setDocQuotation] = useState<QuotationDTO | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const r = await api.leadDetail(leadId);
      setLead(r.lead);
      setMessages(r.messages);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }, [leadId]);

  useEffect(() => {
    void load();
    void fetch("/api/users", { headers: { "Content-Type": "application/json" } })
      .then((r) => (r.ok ? r.json() : { users: [] }))
      .then((d) => setStaff(d.users ?? []))
      .catch(() => setStaff([]));
  }, [load]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  // Default kanal balasan: kanal asal lead bila kontak punya handle-nya; kalau tidak, kanal pertama yang tersedia.
  useEffect(() => {
    if (!lead) return;
    const avail = computeAvailability(lead.contact);
    const originOk = avail.some((a) => a.channel === lead.channel && a.available);
    setReplyChannel(originOk ? (lead.channel as ChannelType) : avail.find((a) => a.available)?.channel ?? "internal");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lead?.id, lead?.contact.phone, lead?.contact.email, lead?.contact.igUsername]);

  const availability = useMemo(() => (lead ? computeAvailability(lead.contact) : []), [lead]);

  async function send() {
    if (!reply.trim() || !lead) return;
    setSending(true);
    try {
      const isNote = replyChannel === "internal";
      const { message } = await api.sendLeadMessage(leadId, reply, isNote ? "NOTE" : "OUT", isNote ? undefined : replyChannel);
      setMessages((p) => [...p, message]);
      setReply("");
      toast.success(
        isNote
          ? "Catatan internal ditambahkan"
          : `Balasan terkirim via ${REPLY_CHANNEL_LABEL[replyChannel]}${message.destination ? ` ke ${message.destination}` : ""}`,
      );
      onChanged();
      void load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSending(false);
    }
  }

  async function setStatus(next: LeadStatus) {
    if (next === "LOST") {
      setShowLostDialog(true);
      return;
    }
    try {
      await api.updateLead(leadId, { status: next });
      toast.success(`Status → ${LEAD_STATUS_LABEL[next]}`);
      onChanged();
      void load();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function confirmLost() {
    try {
      await api.updateLead(leadId, { status: "LOST", lostReason });
      toast.success(`Ditandai hilang — alasan: ${lostReason}`);
      setShowLostDialog(false);
      onChanged();
      void load();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function setAssignee(userId: string) {
    try {
      await api.updateLead(leadId, { assigneeId: userId || null });
      toast.success("Penanggung jawab diperbarui");
      onChanged();
      void load();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  function contactAsDTO(): ContactDTO | null {
    if (!lead) return null;
    const c = lead.contact;
    return {
      id: c.id,
      name: c.name,
      position: c.position ?? null,
      companyName: c.companyName ?? null,
      country: c.country ?? "Indonesia",
      email: c.email ?? null,
      phone: c.phone ?? null,
      igUsername: c.igUsername ?? null,
      source: lead.channel,
      company: c.company ?? null,
      notes: c.notes ?? null,
      createdAt: lead.createdAt,
      leadCount: 0,
    };
  }

  if (!lead) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-16">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  const c = lead.contact;
  const countryInfo = findCountry(c.country);
  const activeDest = availability.find((a) => a.channel === replyChannel)?.destination ?? null;
  const originChannelBlocked =
    OUT_CHANNELS.includes(lead.channel as ChannelType) && !availability.some((a) => a.channel === lead.channel && a.available);

  return (
    <Card className="flex flex-col overflow-hidden">
      {/* Header lead */}
      <CardContent className="space-y-3 border-b bg-muted/30 p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge variant="outline" className="font-mono text-[10px]">
                {lead.code}
              </Badge>
              <ChannelBadge channel={lead.channel} />
              <Badge variant="outline" className={LEAD_STATUS_BADGE[lead.status]}>
                {LEAD_STATUS_LABEL[lead.status]}
              </Badge>
              {lead.slaOverdue && <Badge variant="destructive">SLA terlewati</Badge>}
            </div>
            <h3 className="mt-1.5 truncate text-base font-bold">{lead.subject}</h3>
            <p className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">{c.name}</span>
              {c.position ? ` — ${c.position}` : ""}
              {c.company ? ` · ${c.company}` : ""}
              {` — ${countryInfo.flag} ${c.country ?? "Indonesia"}`}
            </p>
          </div>
          <div className="flex items-center gap-1.5 rounded-xl bg-card px-3 py-2 shadow-sm">
            <Trophy className="size-4 text-amber-500" />
            <div>
              <p className="text-[10px] uppercase text-muted-foreground">Skor</p>
              <p className="text-sm font-bold leading-none">{lead.score}/100</p>
            </div>
          </div>
        </div>

        {/* Identitas kontak & kanal yang tersedia untuk balasan */}
        <div className="flex flex-wrap items-center gap-1.5">
          {c.phone && (
            <Badge variant="outline" className="gap-1 border-emerald-200 bg-emerald-50 text-emerald-800">
              <Phone className="size-3" aria-hidden /> {formatPhoneDisplay(c.phone)}
            </Badge>
          )}
          {c.email && (
            <Badge variant="outline" className="gap-1 border-amber-200 bg-amber-50 text-amber-800">
              <Mail className="size-3" aria-hidden /> {c.email}
            </Badge>
          )}
          {c.igUsername && (
            <Badge variant="outline" className="gap-1 border-rose-200 bg-rose-50 text-rose-800">
              <AtSign className="size-3" aria-hidden /> {c.igUsername}
            </Badge>
          )}
          {!c.phone && !c.email && !c.igUsername && (
            <Badge variant="outline" className="border-dashed text-muted-foreground">
              Kontak belum punya kanal balasan
            </Badge>
          )}
          {canAct && (
            <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => setShowContactDlg(true)} aria-label="Edit kontak lead">
              <Pencil className="size-3" /> Edit Kontak
            </Button>
          )}
        </div>

        {canAct && (
          <div className="flex flex-wrap items-center gap-2">
            <Select value={lead.status} onValueChange={(v) => void setStatus(v as LeadStatus)}>
              <SelectTrigger className="h-8 w-[150px]" aria-label="Ubah status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(LEAD_STATUS_LABEL) as LeadStatus[]).map((s) => (
                  <SelectItem key={s} value={s}>
                    {LEAD_STATUS_LABEL[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={lead.assignee?.id ?? ""} onValueChange={(v) => void setAssignee(v)}>
              <SelectTrigger className="h-8 w-[170px]" aria-label="Penanggung jawab">
                <UserRound className="size-3.5 shrink-0 text-muted-foreground" />
                <SelectValue placeholder="Penanggung jawab" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">Belum ditentukan</SelectItem>
                {staff.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {lead.status === "LOST" && lead.lostReason && (
              <Badge variant="outline" className="border-rose-200 bg-rose-50 text-rose-700">
                Alasan: {lead.lostReason}
              </Badge>
            )}
            {lead.status !== "LOST" && lead.status !== "WON" && (
              <>
                <Button size="sm" variant="outline" onClick={() => setShowBriefDlg(true)} aria-label={`Buat brief dari lead ${lead.code}`}>
                  <ClipboardList className="size-3.5" /> Buat Brief
                </Button>
                <Button size="sm" variant="outline" onClick={() => setShowQuoteDlg(true)} aria-label={`Buat penawaran dari lead ${lead.code}`}>
                  <FileText className="size-3.5" /> Buat Penawaran
                </Button>
              </>
            )}
          </div>
        )}
      </CardContent>

      {/* Percakapan */}
      <CardContent className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4" style={{ maxHeight: "48vh" }}>
        {messages.map((m) => {
          const isIn = m.direction === "IN";
          const isNote = m.direction === "NOTE";
          const Icon = Object.prototype.hasOwnProperty.call(ChannelIcon, m.channel) ? ChannelIcon[m.channel as ChannelType] : null;
          return (
            <div key={m.id} className={cn("flex", isNote ? "justify-center" : isIn ? "justify-start" : "justify-end")}>
              {isNote ? (
                <div className="flex max-w-[85%] items-start gap-2 rounded-xl border border-dashed bg-amber-50/70 px-3 py-2 text-xs text-amber-900">
                  <StickyNote className="mt-0.5 size-3.5 shrink-0" />
                  <div>
                    <p className="whitespace-pre-wrap">{m.body}</p>
                    <p className="mt-1 text-[10px] text-amber-700/80">
                      Catatan internal — {m.senderName} · {timeAgo(m.createdAt)}
                    </p>
                  </div>
                </div>
              ) : (
                <div
                  className={cn(
                    "max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm shadow-sm",
                    isIn ? "rounded-tl-sm bg-card border" : "rounded-tr-sm bg-slate-900 text-slate-50"
                  )}
                >
                  <p className="whitespace-pre-wrap">{m.body}</p>
                  <p className={cn("mt-1 flex flex-wrap items-center gap-1 text-[10px]", isIn ? "text-muted-foreground" : "text-slate-400")}>
                    {Icon && <Icon className="size-3" aria-hidden />}
                    <span>
                      {m.senderName} · {timeAgo(m.createdAt)} · {isIn ? `masuk via ${m.channel}` : `dikirim via ${m.channel}`}
                      {!isIn && m.destination ? ` → ${m.destination}` : ""}
                    </span>
                  </p>
                </div>
              )}
            </div>
          );
        })}
        <div ref={bottomRef} />
      </CardContent>

      {/* Komposer — routing kanal tervalidasi */}
      {canAct && lead.status !== "WON" && lead.status !== "LOST" ? (
        <CardContent className="space-y-2 border-t bg-muted/30 p-3">
          {originChannelBlocked && (
            <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900" role="alert">
              <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
              <p>
                Lead ini masuk via <strong>{REPLY_CHANNEL_LABEL[lead.channel as ChannelType] ?? lead.channel}</strong>, tetapi kontak belum
                punya kanal tersebut. Lengkapi dengan <button type="button" className="font-semibold underline cursor-pointer" onClick={() => setShowContactDlg(true)}>Edit Kontak</button>, atau balas lewat kanal yang tersedia.
              </p>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={replyChannel}
              onValueChange={(v) => setReplyChannel(v as ReplyChannel)}
            >
              <SelectTrigger className="h-8 w-[200px]" aria-label="Kanal balasan">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {availability.map((a) => {
                  const Icon = ChannelIcon[a.channel];
                  return (
                    <SelectItem key={a.channel} value={a.channel} disabled={!a.available}>
                      <span className="flex items-center gap-1.5">
                        <Icon className="size-3.5" aria-hidden />
                        <span>{REPLY_CHANNEL_LABEL[a.channel]}</span>
                        <span className={cn("text-[10px]", a.available ? "text-muted-foreground" : "text-rose-600")}>
                          {a.available ? `→ ${a.destination}` : a.missingLabel}
                        </span>
                      </span>
                    </SelectItem>
                  );
                })}
                <SelectItem value="internal">
                  <span className="flex items-center gap-1.5">
                    <StickyNote className="size-3.5" aria-hidden /> Catatan internal
                  </span>
                </SelectItem>
              </SelectContent>
            </Select>
            <Button size="sm" variant="ghost" className="text-emerald-700" onClick={() => void setStatus("WON")}>
              <CheckCircle2 className="size-3.5" /> Tandai Menang
            </Button>
            <Button size="sm" variant="ghost" className="text-rose-600" onClick={() => setShowLostDialog(true)}>
              <XCircle className="size-3.5" /> Hilang
            </Button>
          </div>
          <div className="flex gap-2">
            <Textarea
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              placeholder={
                replyChannel === "internal"
                  ? "Tulis catatan internal (tidak terlihat klien)…"
                  : `Tulis balasan — dikirim ke ${activeDest ?? ""} via ${REPLY_CHANNEL_LABEL[replyChannel]}…`
              }
              className="min-h-11 resize-none"
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void send();
              }}
            />
            <Button onClick={() => void send()} disabled={sending || !reply.trim()} className="self-end">
              {sending ? <Loader2 className="size-4 animate-spin" /> : replyChannel === "internal" ? <StickyNote className="size-4" /> : <Send className="size-4" />}
              <span className="sr-only">{replyChannel === "internal" ? "Simpan catatan" : "Kirim balasan"}</span>
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            {replyChannel === "internal" ? (
              "Catatan hanya terlihat oleh tim internal."
            ) : (
              <>
                Balasan diarahkan ke <strong>{activeDest}</strong> via <strong>{REPLY_CHANNEL_LABEL[replyChannel]}</strong> — sesuai kanal
                tempat lead berkomunikasi.
              </>
            )}
          </p>
        </CardContent>
      ) : (
        <CardContent className="border-t bg-muted/30 p-3 text-center text-xs text-muted-foreground">
          Percakapan ini sudah ditutup ({LEAD_STATUS_LABEL[lead.status]}
          {lead.lostReason ? ` — ${lead.lostReason}` : ""}).
        </CardContent>
      )}

      {/* Dialog alasan hilang */}
      {showLostDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setShowLostDialog(false)}>
          <div className="w-full max-w-sm rounded-2xl bg-card p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h4 className="text-base font-semibold">Mengapa lead ini hilang?</h4>
            <p className="mt-1 text-sm text-muted-foreground">Alasan ini dipakai untuk laporan konversi mingguan.</p>
            <div className="mt-3 space-y-1.5">
              {LOST_REASONS.map((r) => (
                <button
                  key={r}
                  onClick={() => setLostReason(r)}
                  className={cn(
                    "w-full rounded-lg border px-3 py-2 text-left text-sm transition-colors cursor-pointer",
                    lostReason === r ? "border-primary bg-accent font-medium" : "hover:bg-accent/60"
                  )}
                >
                  {r}
                </button>
              ))}
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setShowLostDialog(false)}>
                Batal
              </Button>
              <Button variant="destructive" size="sm" onClick={() => void confirmLost()}>
                <ChevronRight className="size-3.5" /> Tandai Hilang
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Dialog buat brief / penawaran dari percakapan */}
      {lead && (
        <>
          <CreateBriefFromLeadDialog
            open={showBriefDlg}
            onOpenChange={setShowBriefDlg}
            lead={{ id: lead.id, code: lead.code, subject: lead.subject, contact: { name: lead.contact.name, company: lead.contact.company ?? null } }}
            onCreated={(brief) => {
              onChanged();
              void load();
              setDocBrief(brief);
            }}
          />
          <CreateQuotationFromLeadDialog
            open={showQuoteDlg}
            onOpenChange={setShowQuoteDlg}
            lead={{ id: lead.id, code: lead.code, subject: lead.subject, contact: { name: lead.contact.name, company: lead.contact.company ?? null } }}
            onCreated={(quotation) => {
              onChanged();
              void load();
              setDocQuotation(quotation);
            }}
          />
        </>
      )}

      {/* Edit kontak dari detail lead */}
      <ContactFormDialog
        open={showContactDlg}
        onOpenChange={setShowContactDlg}
        contact={contactAsDTO()}
        onSaved={() => {
          onChanged();
          void load();
        }}
        onUseExisting={(existingId) => {
          toast.info("Kontak sudah terdaftar — data existing tetap dipakai");
          void existingId;
        }}
      />

      {/* Pratinjau dokumen ter-brand hasil pembuatan */}
      <BrandDocDialog
        open={Boolean(docBrief)}
        onOpenChange={(o) => {
          if (!o) setDocBrief(null);
        }}
        brandKey={docBrief?.brand ?? lead?.brand ?? "unimasi"}
        docLabel="BRIEF PROYEK"
        docNumber={docBrief?.code ?? ""}
        dateIso={docBrief?.createdAt ?? new Date().toISOString()}
        toName={lead?.contact.name ?? null}
        toCompany={lead?.contact.company ?? null}
        signatureName={docBrief?.createdByName ?? user.name}
      >
        {docBrief ? <BriefDocContent b={docBrief} /> : null}
      </BrandDocDialog>
      <BrandDocDialog
        open={Boolean(docQuotation)}
        onOpenChange={(o) => {
          if (!o) setDocQuotation(null);
        }}
        brandKey={docQuotation?.brand ?? lead?.brand ?? "unimasi"}
        docLabel="SURAT PENAWARAN"
        docNumber={docQuotation?.number ?? ""}
        dateIso={docQuotation?.createdAt ?? new Date().toISOString()}
        toName={lead?.contact.name ?? null}
        toCompany={lead?.contact.company ?? null}
        showBankInfo
        signatureName={user.name}
      >
        {docQuotation ? <QuotationDocContent q={docQuotation} /> : null}
      </BrandDocDialog>
    </Card>
  );
}

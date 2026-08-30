import { db } from "@/lib/db";
import { CHANNEL_BASE_SCORE, type ChannelType } from "@/lib/crm-types";
import { DEFAULT_COUNTRY, normalizePhoneGlobal } from "@/lib/countries";
import { logAudit, notifyRoles } from "@/lib/audit";

export interface IngestInput {
  channel: ChannelType | "manual";
  /** Identitas pengirim — minimal salah satu kontak terisi. */
  name: string;
  phone?: string | null;
  email?: string | null;
  igUsername?: string | null;
  company?: string | null; // nama perusahaan teks bebas
  position?: string | null; // jabatan
  country?: string | null; // negara (lead mancanegara)
  contactNotes?: string | null;
  body: string;
  subject?: string | null;
  brand?: string | null;
  sourceRef?: string | null;
  externalId?: string | null;
  receivedAt?: Date;
}

export interface IngestResult {
  leadId: string;
  leadCode: string;
  isNewLead: boolean;
  contactId: string;
  contactName: string;
  newContact: boolean;
  /** Field yang mencocokkan kontak existing (dedupe): phone | email | instagram | null */
  matchedBy: "phone" | "email" | "instagram" | null;
}

function normalizePhone(p?: string | null): string | null {
  return normalizePhoneGlobal(p);
}

function normalizeIg(u?: string | null): string | null {
  if (!u) return null;
  const clean = u.trim().replace(/^@/, "").toLowerCase();
  return clean || null;
}

const OPEN_STATUSES = ["NEW", "FOLLOW_UP", "QUOTED"];
const DEDUPE_WINDOW_DAYS = 14;

/**
 * Memasukkan satu pesan masuk dari kanal eksternal (WhatsApp/Email/Instagram/Web) atau input manual.
 * - Upsert kontak (dedupe by phone → email → ig; field kosong otomatis diperkaya)
 * - Dedupe lead terbuka pada kanal yang sama (window 14 hari) → append pesan
 * - Lead baru → kode LD-XXXXXX, skor awal per kanal, notifikasi staff, audit
 */
export async function ingestChannelMessage(input: IngestInput): Promise<IngestResult> {
  const receivedAt = input.receivedAt ?? new Date();

  // 1. Dedupe berdasarkan externalId (webhook bisa retry)
  if (input.externalId) {
    const dupe = await db.leadMessage.findUnique({ where: { externalId: input.externalId } });
    if (dupe) {
      const lead = await db.lead.findUnique({ where: { id: dupe.leadId } });
      return {
        leadId: dupe.leadId,
        leadCode: lead?.code ?? "",
        isNewLead: false,
        contactId: lead?.contactId ?? "",
        contactName: "",
        newContact: false,
        matchedBy: null,
      };
    }
  }

  // 2. Upsert kontak — dedupe berurutan: phone → email → instagram
  const phone = normalizePhone(input.phone);
  const email = input.email?.trim().toLowerCase() || null;
  const ig = normalizeIg(input.igUsername);
  const companyName = input.company?.trim() || null;
  const position = input.position?.trim() || null;
  const country = input.country?.trim() || DEFAULT_COUNTRY;

  let contact = null as null | Awaited<ReturnType<typeof db.contact.findFirst>>;
  let matchedBy: IngestResult["matchedBy"] = null;
  if (phone) {
    contact = await db.contact.findFirst({ where: { phone } });
    if (contact) matchedBy = "phone";
  }
  if (!contact && email) {
    contact = await db.contact.findFirst({ where: { email } });
    if (contact) matchedBy = "email";
  }
  if (!contact && ig) {
    contact = await db.contact.findFirst({ where: { igUsername: ig } });
    if (contact) matchedBy = "instagram";
  }

  const displayName = input.name?.trim() || email?.split("@")[0] || ig || phone || "Pengunjung Web";

  if (!contact) {
    contact = await db.contact.create({
      data: {
        name: displayName,
        position,
        companyName,
        country,
        email,
        phone,
        igUsername: ig,
        notes: input.contactNotes ?? null,
        source: input.channel,
      },
    });
  } else {
    // Perkaya identitas kontak jika field masih kosong (lead bisa pindah kanal, mis. IG → WhatsApp)
    await db.contact.update({
      where: { id: contact.id },
      data: {
        phone: contact.phone ?? phone,
        email: contact.email ?? email,
        igUsername: contact.igUsername ?? ig,
        position: contact.position ?? position,
        companyName: contact.companyName ?? companyName,
        country: contact.country || country,
        notes: contact.notes ?? input.contactNotes ?? null,
        name: contact.name === "Pengunjung Web" ? displayName : contact.name,
      },
    });
  }

  // Opsional: hubungkan ke perusahaan klien yang sudah ada (match nama kasar)
  let companyId: string | null = null;
  if (input.company) {
    const company = await db.company.findFirst({ where: { name: { contains: input.company.trim() } } });
    companyId = company?.id ?? null;
    if (companyId && !contact.companyId) {
      await db.contact.update({ where: { id: contact.id }, data: { companyId } });
    }
  }

  // 3. Cari lead terbuka pada kanal yang sama (window dedupe)
  const windowStart = new Date(Date.now() - DEDUPE_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  let lead =
    (await db.lead.findFirst({
      where: {
        contactId: contact.id,
        channel: input.channel,
        status: { in: OPEN_STATUSES },
        createdAt: { gte: windowStart },
      },
      orderBy: { createdAt: "desc" },
    })) ?? null;

  let isNewLead = false;

  if (!lead) {
    isNewLead = true;
    const code = await nextLeadCode();
    const subject =
      input.subject?.trim() ||
      (input.channel === "email"
        ? email
          ? `Email dari ${displayName}`
          : `Inquiry dari ${displayName}`
        : input.channel === "web"
          ? `Form Web — ${displayName}`
          : `Chat ${input.channel === "whatsapp" ? "WhatsApp" : "Instagram"} — ${displayName}`);

    lead = await db.lead.create({
      data: {
        code,
        subject,
        brand: normalizeBrand(input.brand),
        channel: input.channel,
        status: "NEW",
        score: CHANNEL_BASE_SCORE[input.channel],
        contactId: contact.id,
        companyId,
        sourceRef: input.sourceRef ?? null,
        firstInAt: receivedAt,
      },
    });
  }

  // 4. Tambahkan pesan masuk
  await db.leadMessage.create({
    data: {
      leadId: lead.id,
      direction: "IN",
      channel: input.channel,
      body: input.body,
      externalId: input.externalId ?? null,
      senderName: displayName,
      createdAt: receivedAt,
    },
  });

  // 5. Perbarui skor + status
  const msgCount = await db.leadMessage.count({ where: { leadId: lead.id, direction: "IN" } });
  const newScore = Math.min(100, Math.max(lead.score, CHANNEL_BASE_SCORE[input.channel]) + Math.min(msgCount - 1, 5) * 5);
  await db.lead.update({
    where: { id: lead.id },
    data: { score: newScore, firstInAt: lead.firstInAt ?? receivedAt, updatedAt: new Date() },
  });

  // 6. Statistik kanal (hanya kanal nyata, bukan manual) + notifikasi + audit (hanya saat lead baru)
  if (input.channel !== "manual") {
    await db.channelConfig.update({
      where: { type: input.channel },
      data: { lastEventAt: receivedAt, eventCount: { increment: 1 } },
    });
  }

  if (isNewLead) {
    const label = BRAND_LABEL_FALLBACK(normalizeBrand(input.brand));
    await notifyRoles(["OWNER", "MANAGER", "MARKETER"], {
      title: `Lead baru dari ${channelLabel(input.channel)}`,
      body: `${displayName} — ${lead.subject} (${label})`,
      type: "NEW_LEAD",
      link: `/inbox?lead=${lead.id}`,
    });
    await logAudit({
      actorName: "system:channel",
      action: "LEAD_CREATED",
      entity: "Lead",
      entityId: lead.id,
      detail: `Kanal ${input.channel} — ${displayName}`,
    });
  }

  return { leadId: lead.id, leadCode: lead.code, isNewLead, contactId: contact.id, contactName: contact.name, newContact: matchedBy === null, matchedBy };
}

function normalizeBrand(b?: string | null): string {
  const v = (b ?? "").trim().toLowerCase();
  return ["unimasi", "segia", "erfo", "unicam"].includes(v) ? v : "unimasi";
}

function channelLabel(c: ChannelType | "manual"): string {
  return { whatsapp: "WhatsApp", email: "Email", instagram: "Instagram", web: "Form Web", manual: "Input Manual" }[c];
}

function BRAND_LABEL_FALLBACK(brand: string): string {
  return { unimasi: "Unimasi", segia: "Segia Tech", erfo: "Erfo Multimedia", unicam: "Unicam Studio" }[brand] ?? brand;
}

export async function nextLeadCode(): Promise<string> {
  const count = await db.lead.count();
  for (let i = count + 1; i < count + 50; i++) {
    const code = `LD-${String(i).padStart(6, "0")}`;
    const exists = await db.lead.findUnique({ where: { code } });
    if (!exists) return code;
  }
  return `LD-${Date.now().toString().slice(-6)}`;
}

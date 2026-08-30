"use client";

import { useEffect, useState } from "react";
import { Loader2, Pencil, Search, UserRound, UserRoundPlus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ChannelBadge } from "@/components/channel-badge";
import { ContactFormDialog } from "@/components/contact-form-dialog";
import { toast } from "@/components/ui/sonner";
import { api } from "@/lib/api-client";
import { findCountry, formatPhoneDisplay } from "@/lib/countries";
import { CHANNELS, type ChannelType, type ContactDTO, type SessionUser } from "@/lib/crm-types";

const shortDateFmt = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric" });

function TextCell({ value }: { value?: string | null }) {
  if (!value) return <span className="text-muted-foreground">—</span>;
  return <span className="text-slate-700">{value}</span>;
}

export default function ContactsView({ user }: { user: SessionUser }) {
  void user; // dipakai kontrak props; gating aksi via role di bawah
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [contacts, setContacts] = useState<ContactDTO[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ContactDTO | null>(null);
  const canManage = ["OWNER", "MANAGER", "MARKETER"].includes(user.role);

  // Debounce input pencarian 300ms
  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 300);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .contacts(debounced || undefined)
      .then((res) => {
        if (!cancelled) setContacts(res.contacts);
      })
      .catch((err) => {
        if (cancelled) return;
        toast.error(err instanceof Error ? err.message : "Gagal memuat kontak.");
        if (!cancelled) setContacts([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [debounced]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Kontak</h1>
          <p className="text-sm text-muted-foreground">
            Basis data kontak gabungan dari semua kanal — dedupe otomatis mencegah data ganda, identitas lengkap menentukan kanal
            balasan.
          </p>
        </div>
        {canManage && (
          <Button
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
            aria-label="Tambah kontak baru"
          >
            <UserRoundPlus className="size-4" /> Tambah Kontak
          </Button>
        )}
      </div>

      <Card className="rounded-2xl">
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="text-base">Daftar Kontak</CardTitle>
              <CardDescription>
                {contacts === null ? "Memuat…" : `${contacts.length} kontak ditemukan`}
              </CardDescription>
            </div>
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
              <Input
                type="search"
                placeholder="Cari nama, email, telepon, jabatan…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="rounded-xl pl-9 pr-9"
              />
              {loading && contacts !== null && (
                <Loader2 className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-slate-400" />
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="px-0 pb-2 sm:pb-4">
          <Table className="min-w-[860px]">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-5 sm:pl-6">Nama &amp; Jabatan</TableHead>
                <TableHead>WhatsApp</TableHead>
                <TableHead>Email</TableHead>
                <TableHead className="hidden md:table-cell">Instagram</TableHead>
                <TableHead className="hidden lg:table-cell">Negara</TableHead>
                <TableHead>Sumber</TableHead>
                <TableHead className="hidden md:table-cell">Perusahaan</TableHead>
                <TableHead>Lead</TableHead>
                <TableHead className="pr-5 sm:pr-6">Bergabung</TableHead>
                {canManage && <TableHead className="pr-5 sm:pr-6"><span className="sr-only">Aksi</span></TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && contacts === null
                ? Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: canManage ? 10 : 9 }).map((_, j) => (
                        <TableCell key={j} className={j === 0 ? "pl-5 sm:pl-6" : ""}>
                          <div className="h-4 w-full max-w-28 animate-pulse rounded-md bg-slate-200/70" />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                : contacts && contacts.length > 0
                  ? contacts.map((c) => (
                      <TableRow key={c.id}>
                        <TableCell className="pl-5 sm:pl-6">
                          <div className="min-w-0">
                            <p className="font-medium text-slate-900">{c.name}</p>
                            {c.position ? <p className="text-xs text-muted-foreground">{c.position}</p> : null}
                          </div>
                        </TableCell>
                        <TableCell>
                          <TextCell value={c.phone ? formatPhoneDisplay(c.phone) : null} />
                        </TableCell>
                        <TableCell>
                          <TextCell value={c.email} />
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          <TextCell value={c.igUsername} />
                        </TableCell>
                        <TableCell className="hidden lg:table-cell">
                          <span className="whitespace-nowrap text-slate-700">
                            <span aria-hidden>{findCountry(c.country).flag}</span> {c.country}
                          </span>
                        </TableCell>
                        <TableCell>
                          {(CHANNELS as readonly string[]).includes(c.source) ? (
                            <ChannelBadge channel={c.source as ChannelType} />
                          ) : (
                            <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-500">
                              Manual
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          <TextCell value={c.company} />
                        </TableCell>
                        <TableCell>
                          <span className="text-slate-700">{c.leadCount} lead</span>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {shortDateFmt.format(new Date(c.createdAt))}
                        </TableCell>
                        {canManage && (
                          <TableCell className="pr-5 sm:pr-6">
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-8 px-2 text-xs"
                              aria-label={`Edit kontak ${c.name}`}
                              onClick={() => {
                                setEditing(c);
                                setFormOpen(true);
                              }}
                            >
                              <Pencil className="size-3.5" /> Edit
                            </Button>
                          </TableCell>
                        )}
                      </TableRow>
                    ))
                  : (
                      <TableRow className="hover:bg-transparent">
                        <TableCell colSpan={canManage ? 10 : 9} className="px-5 py-12 text-center">
                          <div className="flex flex-col items-center gap-2">
                            <UserRound className="size-10 text-slate-300" />
                            <p className="text-sm font-medium text-slate-700">Belum ada kontak yang cocok</p>
                            <p className="text-xs text-muted-foreground">
                              {canManage
                                ? "Coba kata kunci lain atau tambahkan kontak baru."
                                : "Coba kata kunci lain."}
                            </p>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <ContactFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        contact={editing}
        onSaved={() => {
          setLoading(true);
          api
            .contacts(debounced || undefined)
            .then((res) => setContacts(res.contacts))
            .catch(() => undefined)
            .finally(() => setLoading(false));
        }}
      />
    </div>
  );
}

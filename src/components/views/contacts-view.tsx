"use client";

import { useEffect, useState } from "react";
import { Loader2, Search, UserRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
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
import { toast } from "@/components/ui/sonner";
import { api } from "@/lib/api-client";
import { CHANNELS, type ChannelType, type ContactDTO, type SessionUser } from "@/lib/crm-types";

const shortDateFmt = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric" });

function TextCell({ value }: { value?: string | null }) {
  if (!value) return <span className="text-muted-foreground">—</span>;
  return <span className="text-slate-700">{value}</span>;
}

export default function ContactsView({ user }: { user: SessionUser }) {
  void user; // dipakai kontrak props; tampilan kontak sama untuk semua role internal
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [contacts, setContacts] = useState<ContactDTO[] | null>(null);
  const [loading, setLoading] = useState(true);

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
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Kontak</h1>
        <p className="text-sm text-muted-foreground">
          Basis data kontak gabungan dari semua kanal (WhatsApp, Email, Instagram, Web, dan input manual).
        </p>
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
                placeholder="Cari nama, email, telepon…"
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
          <Table className="min-w-[720px]">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-5 sm:pl-6">Nama</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Telepon</TableHead>
                <TableHead className="hidden md:table-cell">Instagram</TableHead>
                <TableHead>Sumber</TableHead>
                <TableHead className="hidden md:table-cell">Perusahaan</TableHead>
                <TableHead>Lead</TableHead>
                <TableHead className="pr-5 sm:pr-6">Bergabung</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && contacts === null
                ? Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 8 }).map((_, j) => (
                        <TableCell key={j} className={j === 0 ? "pl-5 sm:pl-6" : ""}>
                          <div className="h-4 w-full max-w-28 animate-pulse rounded-md bg-slate-200/70" />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                : contacts && contacts.length > 0
                  ? contacts.map((c) => (
                      <TableRow key={c.id}>
                        <TableCell className="pl-5 font-medium text-slate-900 sm:pl-6">{c.name}</TableCell>
                        <TableCell>
                          <TextCell value={c.email} />
                        </TableCell>
                        <TableCell>
                          <TextCell value={c.phone} />
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          <TextCell value={c.igUsername} />
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
                        <TableCell className="pr-5 text-muted-foreground sm:pr-6">
                          {shortDateFmt.format(new Date(c.createdAt))}
                        </TableCell>
                      </TableRow>
                    ))
                  : (
                      <TableRow className="hover:bg-transparent">
                        <TableCell colSpan={8} className="px-5 py-12 text-center">
                          <div className="flex flex-col items-center gap-2">
                            <UserRound className="size-10 text-slate-300" />
                            <p className="text-sm font-medium text-slate-700">Belum ada kontak yang cocok</p>
                            <p className="text-xs text-muted-foreground">
                              Coba kata kunci lain atau tambah kontak lewat lead baru.
                            </p>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

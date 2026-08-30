"use client";

import { useState } from "react";
import { ChevronDown, Eye, EyeOff, Loader2, LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/sonner";
import { api } from "@/lib/api-client";
import type { SessionUser } from "@/lib/crm-types";

const DEMO_ACCOUNTS: { label: string; email: string; password: string }[] = [
  { label: "Owner", email: "owner@udp.co.id", password: "owner123" },
  { label: "Manajer", email: "manager@udp.co.id", password: "manager123" },
  { label: "Marketing", email: "marketing@udp.co.id", password: "marketing123" },
  { label: "Produksi", email: "produksi@udp.co.id", password: "produksi123" },
  { label: "Finance", email: "finance@udp.co.id", password: "finance123" },
  { label: "Klien", email: "klien@majubersama.co.id", password: "klien123" },
];

export default function LoginView({ onLogin }: { onLogin: (user: SessionUser) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [demoOpen, setDemoOpen] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    try {
      const { user } = await api.login(email.trim(), password);
      toast.success("Berhasil masuk", { description: `Selamat datang, ${user.name}` });
      onLogin(user);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal masuk. Periksa email dan password Anda.");
    } finally {
      setLoading(false);
    }
  }

  function autofill(acc: (typeof DEMO_ACCOUNTS)[number]) {
    setEmail(acc.email);
    setPassword(acc.password);
    toast.info(`Kredensial ${acc.label} terisi — klik Masuk untuk lanjut.`);
  }

  return (
    <div
      className="flex min-h-screen items-center justify-center bg-slate-950 px-4 py-10"
      style={{
        backgroundImage: "radial-gradient(circle, rgba(148,163,184,0.14) 1px, transparent 1px)",
        backgroundSize: "24px 24px",
      }}
    >
      <div className="w-full max-w-md space-y-6">
        {/* Brand header */}
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="flex size-12 items-center justify-center rounded-2xl bg-emerald-500 shadow-lg shadow-emerald-500/25">
            <span className="text-lg font-black tracking-tight text-slate-950">UDP</span>
          </div>
          <div className="space-y-1">
            <h1 className="text-2xl font-bold tracking-tight text-slate-50">UDP CRM</h1>
            <p className="text-[11px] font-medium tracking-wide text-emerald-400">PT. UNICAM DIGITAL PICTVRES</p>
            <p className="text-xs text-slate-400 sm:text-sm">
              CRM Multi-Brand — Unimasi · Segia Tech · Erfo Multimedia · Unicam Studio
            </p>
          </div>
        </div>

        {/* Login card */}
        <Card className="rounded-2xl border-slate-200 shadow-xl">
          <CardHeader>
            <CardTitle className="text-lg text-slate-900">Masuk ke CRM</CardTitle>
            <CardDescription>Gunakan email kantor Anda untuk melanjutkan.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="login-email">Email</Label>
                <Input
                  id="login-email"
                  type="email"
                  autoComplete="email"
                  placeholder="nama@udp.co.id"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={loading}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="login-password">Password</Label>
                <div className="relative">
                  <Input
                    id="login-password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    disabled={loading}
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 transition-colors hover:text-slate-600"
                    aria-label={showPassword ? "Sembunyikan password" : "Tampilkan password"}
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
              </div>
              <Button
                type="submit"
                disabled={loading}
                className="h-10 w-full rounded-xl bg-emerald-600 text-white hover:bg-emerald-700"
              >
                {loading ? <Loader2 className="size-4 animate-spin" /> : <LogIn className="size-4" />}
                {loading ? "Memproses…" : "Masuk"}
              </Button>
            </form>

            {/* Akun demo */}
            <div className="mt-5 border-t border-slate-200 pt-4">
              <button
                type="button"
                onClick={() => setDemoOpen((v) => !v)}
                className="flex w-full items-center justify-between rounded-lg px-1 py-1 text-sm font-medium text-slate-500 transition-colors hover:text-slate-700"
              >
                <span>Akun Demo</span>
                <ChevronDown className={`size-4 transition-transform ${demoOpen ? "rotate-180" : ""}`} />
              </button>
              {demoOpen && (
                <div className="mt-3 grid gap-2">
                  {DEMO_ACCOUNTS.map((acc) => (
                    <Button
                      key={acc.email}
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => autofill(acc)}
                      className="h-auto justify-between rounded-xl px-3 py-2 text-left"
                    >
                      <span className="flex flex-col items-start gap-0.5">
                        <span className="text-xs font-semibold text-slate-700">{acc.label}</span>
                        <span className="text-xs font-normal text-slate-400">{acc.email}</span>
                      </span>
                      <span className="font-mono text-[10px] text-slate-400">{acc.password}</span>
                    </Button>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-slate-500">
          © {new Date().getFullYear()} UDP — Semua kanal lead dalam satu dashboard.
        </p>
      </div>
    </div>
  );
}

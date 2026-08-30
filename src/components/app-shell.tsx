"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Bell,
  BookOpen,
  Building2,
  Banknote,
  Factory,
  Inbox,
  KanbanSquare,
  LayoutDashboard,
  LogOut,
  Menu,
  Radio,
  RefreshCw,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Toaster } from "@/components/ui/sonner";
import LoginView from "@/components/views/login-view";
import DashboardView from "@/components/views/dashboard-view";
import { InboxView } from "@/components/views/inbox-view";
import { ChannelsView } from "@/components/views/channels-view";
import ContactsView from "@/components/views/contacts-view";
import ClientPortalView from "@/components/views/client-portal-view";
import PipelineView from "@/components/views/pipeline-view";
import FinanceView from "@/components/views/finance-view";
import ProductionView from "@/components/views/production-view";
import GuideView from "@/components/views/guide-view";
import { api } from "@/lib/api-client";
import { ROLE_LABEL, type NotificationDTO, type SessionUser } from "@/lib/crm-types";
import { cn } from "@/lib/utils";

type ViewKey = "dashboard" | "inbox" | "pipeline" | "finance" | "production" | "channels" | "contacts" | "guide" | "portal";

const INTERNAL_ROLES = ["OWNER", "MANAGER", "MARKETER", "FINANCE"];

const NAV: { key: ViewKey; label: string; icon: typeof LayoutDashboard; roles: string[] }[] = [
  { key: "dashboard", label: "Dashboard", icon: LayoutDashboard, roles: INTERNAL_ROLES },
  { key: "inbox", label: "Inbox Lead", icon: Inbox, roles: INTERNAL_ROLES },
  { key: "pipeline", label: "Pipeline & Funnel", icon: KanbanSquare, roles: INTERNAL_ROLES },
  { key: "finance", label: "Keuangan", icon: Banknote, roles: ["OWNER", "MANAGER", "FINANCE"] },
  { key: "production", label: "Produksi", icon: Factory, roles: INTERNAL_ROLES },
  { key: "channels", label: "Pengaturan Kanal", icon: Radio, roles: INTERNAL_ROLES },
  { key: "contacts", label: "Kontak", icon: Users, roles: INTERNAL_ROLES },
  { key: "portal", label: "Portal Klien", icon: Building2, roles: ["CLIENT"] },
  { key: "guide", label: "Petunjuk", icon: BookOpen, roles: [...INTERNAL_ROLES, "CLIENT"] },
];

export function AppShell() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [booting, setBooting] = useState(true);
  const [view, setView] = useState<ViewKey>("dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [notifs, setNotifs] = useState<NotificationDTO[]>([]);
  const [unread, setUnread] = useState(0);
  const [notifOpen, setNotifOpen] = useState(false);

  useEffect(() => {
    api
      .me()
      .then((r) => setUser(r.user))
      .catch(() => setUser(null))
      .finally(() => setBooting(false));
  }, []);

  const loadNotifs = useCallback(async (markAll = false) => {
    try {
      const r = await api.notifications(markAll);
      setNotifs(r.notifications);
      setUnread(r.unread);
    } catch {
      /* diabaikan: user mungkin belum login */
    }
  }, []);

  useEffect(() => {
    if (user && user.role !== "CLIENT") {
      void loadNotifs();
      const t = setInterval(() => void loadNotifs(), 30000);
      return () => clearInterval(t);
    }
  }, [user, loadNotifs]);

  async function handleLogout() {
    await api.logout().catch(() => undefined);
    setUser(null);
    setView("dashboard");
    toast.success("Berhasil keluar");
  }

  if (booting) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <RefreshCw className="size-6 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Memuat CRM UDP…</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <>
        <LoginView onLogin={(u) => setUser(u)} />
        <Toaster />
      </>
    );
  }

  const nav = NAV.filter((n) => n.roles.includes(user.role));
  // View efektif: selalu jatuh ke nav pertama yang diizinkan role (mis. CLIENT → portal)
  const effectiveView: ViewKey = nav.some((n) => n.key === view) ? view : (nav[0]?.key ?? "dashboard");
  const current = nav.find((n) => n.key === effectiveView) ?? nav[0];
  const initials = user.name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();

  const SidebarContent = (
    <>
      <div className="flex items-center gap-2.5 px-4 py-5">
        <span className="flex size-9 items-center justify-center rounded-xl bg-emerald-500 font-black text-white">UDP</span>
        <div>
          <p className="text-sm font-bold leading-tight">UDP CRM</p>
          <p className="text-[10px] leading-tight text-slate-400">PT. Unicam Digital Pictvres</p>
        </div>
      </div>
      <nav className="flex-1 space-y-1 px-3" aria-label="Navigasi utama">
        {nav.map((n) => {
          const Icon = n.icon;
          return (
            <button
              key={n.key}
              onClick={() => {
                setView(n.key);
                setSidebarOpen(false);
              }}
              className={cn(
                "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors cursor-pointer",
                effectiveView === n.key ? "bg-white/10 text-white" : "text-slate-400 hover:bg-white/5 hover:text-slate-200"
              )}
            >
              <Icon className="size-4" />
              {n.label}
              {n.key === "inbox" && unread > 0 && (
                <span className="ml-auto rounded-full bg-emerald-500 px-1.5 py-0.5 text-[10px] font-bold text-white">{unread}</span>
              )}
            </button>
          );
        })}
      </nav>
      <div className="border-t border-white/10 p-4">
        <div className="flex items-center gap-2.5">
          <Avatar className="size-9 border border-white/20">
            <AvatarFallback className="bg-white/10 text-xs text-white">{initials}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-semibold text-white">{user.name}</p>
            <p className="truncate text-[10px] text-slate-400">{ROLE_LABEL[user.role]}</p>
          </div>
          <Button variant="ghost" size="icon-sm" className="text-slate-400 hover:bg-white/10 hover:text-white" onClick={() => void handleLogout()} aria-label="Keluar">
            <LogOut className="size-4" />
          </Button>
        </div>
      </div>
    </>
  );

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Topbar mobile */}
      <header className="sticky top-0 z-40 flex items-center gap-3 border-b bg-card px-4 py-2.5 lg:hidden">
        <Button variant="ghost" size="icon-sm" onClick={() => setSidebarOpen(true)} aria-label="Buka menu">
          <Menu className="size-5" />
        </Button>
        <span className="flex items-center gap-2 text-sm font-bold">
          <span className="flex size-7 items-center justify-center rounded-lg bg-slate-900 text-[10px] font-black text-white">UDP</span>
          UDP CRM
        </span>
        <div className="ml-auto flex items-center gap-1">
          {user.role !== "CLIENT" && <NotifBell unread={unread} notifs={notifs} open={notifOpen} setOpen={setNotifOpen} onMarkAll={() => void loadNotifs(true)} onOpenChange={() => void loadNotifs()} />}
          <Avatar className="size-8">
            <AvatarFallback className="bg-slate-900 text-[10px] text-white">{initials}</AvatarFallback>
          </Avatar>
        </div>
      </header>

      {/* Drawer mobile */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-black/50" onClick={() => setSidebarOpen(false)} />
          <aside className="absolute left-0 top-0 flex h-full w-64 flex-col bg-slate-900">
            <button className="absolute right-3 top-4 text-slate-400 cursor-pointer" onClick={() => setSidebarOpen(false)} aria-label="Tutup menu">
              <X className="size-5" />
            </button>
            {SidebarContent}
          </aside>
        </div>
      )}

      <div className="flex flex-1">
        {/* Sidebar desktop */}
        <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col bg-slate-900 lg:flex">{SidebarContent}</aside>

        {/* Konten */}
        <main className="min-w-0 flex-1 px-4 py-5 sm:px-6 lg:px-8">
          <div className="mx-auto w-full max-w-6xl">
            {/* Header desktop */}
            <div className="mb-5 hidden items-center justify-between lg:flex">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <current.icon className="size-4" />
                <span className="font-medium text-foreground">{current.label}</span>
              </div>
              {user.role !== "CLIENT" && (
                <div className="flex items-center gap-2">
                  <NotifBell unread={unread} notifs={notifs} open={notifOpen} setOpen={setNotifOpen} onMarkAll={() => void loadNotifs(true)} onOpenChange={() => void loadNotifs()} />
                  <Avatar className="size-8">
                    <AvatarFallback className="bg-slate-900 text-[10px] text-white">{initials}</AvatarFallback>
                  </Avatar>
                </div>
              )}
            </div>

            {effectiveView === "dashboard" && <DashboardView user={user} />}
            {effectiveView === "inbox" && <InboxView user={user} />}
            {effectiveView === "pipeline" && <PipelineView user={user} />}
            {effectiveView === "finance" && <FinanceView user={user} />}
            {effectiveView === "production" && <ProductionView user={user} />}
            {effectiveView === "channels" && <ChannelsView user={user} />}
            {effectiveView === "contacts" && <ContactsView user={user} />}
            {effectiveView === "guide" && <GuideView user={user} />}
            {effectiveView === "portal" && <ClientPortalView user={user} />}
          </div>
        </main>
      </div>

      {/* Footer sticky */}
      <footer className="mt-auto border-t bg-card">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-1.5 px-4 py-3 text-xs text-muted-foreground sm:flex-row sm:px-6 lg:px-8">
          <p>© 2026 UDP — PT. Unicam Digital Pictvres · Unimasi · Segia Tech · Erfo Multimedia · Unicam Studio</p>
          <p className="flex items-center gap-1.5">
            <Radio className="size-3" /> Kanal terhubung: WhatsApp · Email · Instagram · Web
          </p>
        </div>
      </footer>

      <Toaster />
    </div>
  );
}

function NotifBell({
  unread,
  notifs,
  open,
  setOpen,
  onMarkAll,
  onOpenChange,
}: {
  unread: number;
  notifs: NotificationDTO[];
  open: boolean;
  setOpen: (o: boolean) => void;
  onMarkAll: () => void;
  onOpenChange: () => void;
}) {
  return (
    <DropdownMenu
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) onOpenChange();
      }}
    >
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label={`Notifikasi${unread ? ` (${unread} belum dibaca)` : ""}`}>
          <Bell className="size-4.5" />
          {unread > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex size-4.5 items-center justify-center rounded-full bg-rose-500 text-[10px] font-bold text-white">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <div className="flex items-center justify-between px-2 py-1.5">
          <DropdownMenuLabel className="p-0">Notifikasi</DropdownMenuLabel>
          {unread > 0 && (
            <button className="text-xs font-medium text-emerald-700 hover:underline cursor-pointer" onClick={onMarkAll}>
              Tandai semua dibaca
            </button>
          )}
        </div>
        <DropdownMenuSeparator />
        <div className="max-h-80 overflow-y-auto">
          {notifs.length === 0 ? (
            <p className="px-3 py-6 text-center text-xs text-muted-foreground">Belum ada notifikasi</p>
          ) : (
            notifs.map((n) => (
              <div key={n.id} className={cn("flex gap-2.5 rounded-lg px-2.5 py-2", !n.read && "bg-emerald-50/70")}>
                <span className={cn("mt-1 size-2 shrink-0 rounded-full", n.type === "NEW_LEAD" ? "bg-emerald-500" : "bg-stone-400", !n.read && "animate-pulse")} />
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold">{n.title}</p>
                  <p className="line-clamp-2 text-xs text-muted-foreground">{n.body}</p>
                  <p className="mt-0.5 text-[10px] text-muted-foreground/70">{new Date(n.createdAt).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}</p>
                </div>
              </div>
            ))
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

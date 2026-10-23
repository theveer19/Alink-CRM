"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  LayoutDashboard, Users, PhoneCall, Contact, Map, Plane, FileText, Wallet, Ticket, BarChart3, Database,
  UserCog, Settings, Search, Bell, Plus, LogOut, Menu, X, AlarmClock, AlertTriangle,
} from "lucide-react";
import { sb } from "@/lib/supabase/client";
import { cn, fmtDateTime, timeAgo } from "@/lib/utils";
import { useAuth } from "./auth";
import { useDebounced } from "@/lib/hooks";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, module: "dashboard" },
  { href: "/leads", label: "Leads", icon: Users, module: "leads" },
  { href: "/followups", label: "Follow-ups", icon: PhoneCall, module: "followups" },
  { href: "/contacts", label: "Contacts", icon: Contact, module: "contacts" },
  { href: "/itineraries", label: "Itineraries", icon: Map, module: "itineraries" },
  { href: "/bookings", label: "Bookings / Trips", icon: Plane, module: "bookings" },
  { href: "/invoices", label: "Invoices", icon: FileText, module: "invoices" },
  { href: "/payments", label: "Payments", icon: Wallet, module: "payments" },
  { href: "/vouchers", label: "Vouchers", icon: Ticket, module: "vouchers" },
  { href: "/reports", label: "Reports", icon: BarChart3, module: "reports" },
  { href: "/masters", label: "Masters", icon: Database, module: "masters" },
  { href: "/team", label: "Users & Team", icon: UserCog, module: "team" },
  { href: "/settings", label: "Settings", icon: Settings, module: "settings", action: "edit" },
];

export function Shell({ children }: { children: ReactNode }) {
  const { can, settings, profile, role } = useAuth();
  const path = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  useEffect(() => setOpen(false), [path]);

  const nav = NAV.filter((n) => can(n.module, n.action ?? "view"));

  return (
    <div className="min-h-screen bg-slate-50">
      {/* sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-60 flex-col border-r border-slate-200 bg-white transition-transform lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex h-14 items-center gap-2 border-b border-slate-100 px-4">
          {settings.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={settings.logo_url} alt="" className="h-8 w-8 rounded object-contain" />
          ) : (
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-700 text-sm font-bold text-white">A</div>
          )}
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-900">{settings.company_name}</p>
            <p className="text-[11px] text-slate-500">Travel CRM</p>
          </div>
          <button className="ml-auto lg:hidden" onClick={() => setOpen(false)} aria-label="Close menu"><X className="h-5 w-5" /></button>
        </div>
        <nav className="flex-1 space-y-0.5 overflow-y-auto p-2">
          {nav.map((n) => {
            const active = path === n.href || path.startsWith(n.href + "/");
            return (
              <Link
                key={n.href}
                href={n.href}
                className={cn(
                  "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  active ? "bg-brand-50 text-brand-800" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                )}
              >
                <n.icon className={cn("h-4 w-4", active ? "text-brand-700" : "text-slate-400")} />
                {n.label}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-slate-100 p-3">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-200 text-xs font-semibold text-slate-700">
              {profile.full_name.slice(0, 2).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-slate-800">{profile.full_name}</p>
              <p className="truncate text-[11px] text-slate-500">{role?.name}</p>
            </div>
            <button
              title="Sign out"
              onClick={async () => { await sb().auth.signOut(); router.replace("/login"); }}
              className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>
      {open && <div className="fixed inset-0 z-30 bg-slate-900/30 lg:hidden" onClick={() => setOpen(false)} />}

      <div className="lg:pl-60">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-slate-200 bg-white/90 px-4 backdrop-blur">
          <button className="lg:hidden" onClick={() => setOpen(true)} aria-label="Open menu"><Menu className="h-5 w-5" /></button>
          <GlobalSearch />
          <div className="ml-auto flex items-center gap-2">
            {can("leads", "create") && (
              <Link href="/leads?new=1" className="hidden items-center gap-1 rounded-lg bg-brand-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-800 sm:inline-flex">
                <Plus className="h-4 w-4" /> New Lead
              </Link>
            )}
            <Notifications />
          </div>
        </header>
        <main className="mx-auto max-w-[1400px] p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}

type Hit = { kind: string; id: string; title: string; sub: string; href: string };

function GlobalSearch() {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [show, setShow] = useState(false);
  const dq = useDebounced(q, 250);
  const { can } = useAuth();
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const h = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setShow(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  useEffect(() => {
    const term = dq.trim().replace(/[%,()]/g, "");
    if (term.length < 2) { setHits([]); return; }
    const like = `%${term}%`;
    const supa = sb();
    (async () => {
      const out: Hit[] = [];
      const jobs: Promise<void>[] = [];
      if (can("leads")) jobs.push((async () => {
        const { data } = await supa.from("leads").select("id, lead_no, name, phone, destination")
          .or(`name.ilike.${like},phone.ilike.${like},lead_no.ilike.${like},email.ilike.${like}`).limit(5);
        data?.forEach((d) => out.push({ kind: "Lead", id: d.id, title: `${d.name}`, sub: `${d.lead_no} · ${d.phone ?? ""} ${d.destination ?? ""}`, href: `/leads/${d.id}` }));
      })());
      if (can("contacts")) jobs.push((async () => {
        const { data } = await supa.from("contacts").select("id, name, phone, city")
          .or(`name.ilike.${like},phone.ilike.${like},email.ilike.${like}`).limit(5);
        data?.forEach((d) => out.push({ kind: "Contact", id: d.id, title: d.name, sub: `${d.phone ?? ""} ${d.city ?? ""}`, href: `/contacts/${d.id}` }));
      })());
      if (can("bookings")) jobs.push((async () => {
        const { data } = await supa.from("bookings").select("id, booking_no, title").or(`booking_no.ilike.${like},title.ilike.${like}`).limit(4);
        data?.forEach((d) => out.push({ kind: "Booking", id: d.id, title: d.title, sub: d.booking_no, href: `/bookings/${d.id}` }));
      })());
      if (can("invoices")) jobs.push((async () => {
        const { data } = await supa.from("invoices").select("id, invoice_no, bill_to_name").or(`invoice_no.ilike.${like},bill_to_name.ilike.${like}`).limit(4);
        data?.forEach((d) => out.push({ kind: "Invoice", id: d.id, title: d.bill_to_name, sub: d.invoice_no, href: `/invoices/${d.id}` }));
      })());
      if (can("itineraries")) jobs.push((async () => {
        const { data } = await supa.from("itineraries").select("id, quote_no, title").or(`quote_no.ilike.${like},title.ilike.${like}`).limit(4);
        data?.forEach((d) => out.push({ kind: "Itinerary", id: d.id, title: d.title, sub: d.quote_no, href: `/itineraries/${d.id}` }));
      })());
      await Promise.all(jobs);
      setHits(out);
      setShow(true);
    })();
  }, [dq, can]);

  return (
    <div ref={box} className="relative w-full max-w-md">
      <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onFocus={() => hits.length && setShow(true)}
        placeholder="Search leads, customers, bookings, invoices…"
        className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm focus:border-brand-500 focus:bg-white focus:outline-none"
      />
      {show && q.length >= 2 && (
        <div className="absolute left-0 right-0 top-11 z-50 max-h-96 overflow-y-auto rounded-xl border border-slate-200 bg-white py-1 shadow-xl">
          {hits.length === 0 && <p className="px-4 py-3 text-sm text-slate-500">No results</p>}
          {hits.map((h) => (
            <Link key={h.kind + h.id} href={h.href} onClick={() => { setShow(false); setQ(""); }} className="flex items-center gap-3 px-4 py-2 hover:bg-slate-50">
              <span className="w-16 shrink-0 text-[10px] font-semibold uppercase text-slate-400">{h.kind}</span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-slate-800">{h.title}</span>
                <span className="block truncate text-xs text-slate-500">{h.sub}</span>
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

type Note = { id: string; title: string; sub: string; href: string; kind: "overdue" | "today" | "unattended" };

function Notifications() {
  const { can, settings, userId } = useAuth();
  const [items, setItems] = useState<Note[]>([]);
  const [open, setOpen] = useState(false);
  const notified = useRef<Set<string>>(new Set());

  useEffect(() => {
    let alive = true;
    const run = async () => {
      const supa = sb();
      const out: Note[] = [];
      const endOfDay = new Date(); endOfDay.setHours(23, 59, 59, 999);
      if (can("followups")) {
        const { data } = await supa.from("followups").select("id, title, due_at, kind, lead_id, leads(name)")
          .eq("status", "pending").eq("assigned_to", userId).lte("due_at", endOfDay.toISOString()).order("due_at").limit(30);
        (data ?? []).forEach((f: any) => {
          const overdue = new Date(f.due_at) < new Date();
          out.push({
            id: "f" + f.id, kind: overdue ? "overdue" : "today",
            title: `${f.title}${f.leads?.name ? " – " + f.leads.name : ""}`,
            sub: `${f.kind} · ${fmtDateTime(f.due_at)}`,
            href: f.lead_id ? `/leads/${f.lead_id}` : "/followups",
          });
          // browser notification when a follow-up becomes due
          const due = new Date(f.due_at).getTime();
          if (due <= Date.now() && Date.now() - due < 10 * 60_000 && !notified.current.has(f.id) &&
              typeof Notification !== "undefined" && Notification.permission === "granted") {
            notified.current.add(f.id);
            new Notification("Follow-up due", { body: `${f.title}${f.leads?.name ? " – " + f.leads.name : ""}` });
          }
        });
      }
      if (can("leads")) {
        const cutoff = new Date(Date.now() - (settings.unattended_hours || 24) * 3600_000).toISOString();
        const { data } = await supa.from("leads").select("id, name, created_at, source")
          .eq("status", "new").is("next_followup_at", null).lte("created_at", cutoff).eq("assigned_to", userId).limit(20);
        (data ?? []).forEach((l) => out.push({ id: "l" + l.id, kind: "unattended", title: `Unattended lead: ${l.name}`, sub: `${l.source} · ${timeAgo(l.created_at)}`, href: `/leads/${l.id}` }));
      }
      if (alive) setItems(out);
    };
    run();
    const t = setInterval(run, 60_000);
    return () => { alive = false; clearInterval(t); };
  }, [can, settings.unattended_hours, userId]);

  return (
    <div className="relative">
      <button
        onClick={() => {
          setOpen((o) => !o);
          if (typeof Notification !== "undefined" && Notification.permission === "default") Notification.requestPermission();
        }}
        className="relative rounded-lg p-2 text-slate-500 hover:bg-slate-100"
        aria-label="Notifications"
      >
        <Bell className="h-5 w-5" />
        {items.length > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">
            {items.length > 99 ? "99+" : items.length}
          </span>
        )}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-11 z-50 w-80 rounded-xl border border-slate-200 bg-white shadow-xl">
            <div className="border-b border-slate-100 px-4 py-2.5 text-sm font-semibold">Reminders</div>
            <div className="max-h-96 overflow-y-auto">
              {items.length === 0 && <p className="px-4 py-6 text-center text-sm text-slate-500">All caught up 🎉</p>}
              {items.map((n) => (
                <Link key={n.id} href={n.href} onClick={() => setOpen(false)} className="flex gap-3 border-b border-slate-50 px-4 py-2.5 hover:bg-slate-50">
                  {n.kind === "unattended" ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" /> : <AlarmClock className={cn("mt-0.5 h-4 w-4 shrink-0", n.kind === "overdue" ? "text-rose-500" : "text-sky-500")} />}
                  <span className="min-w-0">
                    <span className="block truncate text-sm text-slate-800">{n.title}</span>
                    <span className={cn("block text-xs", n.kind === "overdue" ? "text-rose-600" : "text-slate-500")}>{n.kind === "overdue" ? "Overdue · " : ""}{n.sub}</span>
                  </span>
                </Link>
              ))}
            </div>
            <Link href="/followups" onClick={() => setOpen(false)} className="block border-t border-slate-100 px-4 py-2 text-center text-xs font-medium text-brand-700 hover:bg-slate-50">
              Open follow-ups
            </Link>
          </div>
        </>
      )}
    </div>
  );
}

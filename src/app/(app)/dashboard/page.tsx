"use client";
import { useState } from "react";
import Link from "next/link";
import { AlarmClock, AlertTriangle, CalendarCheck, IndianRupee, Plane, TrendingUp, Users, Wallet, Cake } from "lucide-react";
import { sb } from "@/lib/supabase/client";
import { LEAD_STATUSES } from "@/lib/constants";
import { cn, fmtDate, fmtDateTime, inr, isoDate, timeAgo, addDays } from "@/lib/utils";
import { useLoad } from "@/lib/hooks";
import { Guard, useAuth } from "@/components/auth";
import { Badge, Bar, Card, PageHeader, Select, Spinner, Stat } from "@/components/ui";
import { PackagesBoard } from "@/components/packages-board";

export default function DashboardPage() {
  return <Guard module="dashboard"><Dashboard /></Guard>;
}

function Dashboard() {
  const { can, profile, settings, userId } = useAuth();
  const teamView = can("leads", "view_all");
  const [scope, setScope] = useState<"me" | "all">(teamView ? "all" : "me");
  const [period, setPeriod] = useState("month");

  const { data, loading } = useLoad(async () => {
    const supa = sb();
    const now = new Date();
    const today = isoDate();
    const start = period === "month" ? isoDate(new Date(now.getFullYear(), now.getMonth(), 1))
      : period === "week" ? addDays(today, -6)
      : period === "fy" ? `${now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1}-04-01` : addDays(today, -89);
    const eod = new Date(); eod.setHours(23, 59, 59, 999);
    const mine = scope === "me";
    const L = () => { let q = supa.from("leads").select("id, source, status, created_at", { count: "exact" }); if (mine) q = q.eq("assigned_to", userId); return q; };

    const jobs: Record<string, PromiseLike<any>> = {};
    if (can("leads")) {
      jobs.periodLeads = L().gte("created_at", start).limit(10000);
      jobs.openLeads = (() => { let q = supa.from("leads").select("status"); if (mine) q = q.eq("assigned_to", userId); return q.not("status", "in", "(won,lost)").limit(10000); })();
      jobs.todayLeads = L().gte("created_at", today).limit(1);
      jobs.unattended = (() => {
        let q = supa.from("leads").select("id, name, source, created_at, phone").eq("status", "new").is("next_followup_at", null)
          .lte("created_at", new Date(Date.now() - settings.unattended_hours * 3600_000).toISOString()).order("created_at").limit(8);
        if (mine) q = q.eq("assigned_to", userId);
        return q;
      })();
    }
    if (can("followups")) {
      let q = supa.from("followups").select("id, title, due_at, kind, lead_id, leads(name, phone)").eq("status", "pending").lte("due_at", eod.toISOString()).order("due_at").limit(12);
      if (mine) q = q.eq("assigned_to", userId);
      jobs.fus = q;
    }
    if (can("bookings")) {
      jobs.trips = supa.from("booking_summary").select("id, booking_no, title, start_date, end_date, contact_name, balance_due, status").neq("status", "cancelled").gte("start_date", today).lte("start_date", addDays(today, 30)).order("start_date").limit(10);
      jobs.onTrip = supa.from("bookings").select("id", { count: "exact", head: true }).neq("status", "cancelled").lte("start_date", today).gte("end_date", today);
      jobs.periodBookings = supa.from("bookings").select("sell_amount, tax_amount, cost_amount, created_at, handled_by").neq("status", "cancelled").gte("created_at", addDays(today, -183));
      jobs.due = supa.from("booking_summary").select("balance_due").neq("status", "cancelled").gt("balance_due", 0);
    }
    if (can("payments")) jobs.pays = supa.from("payments").select("id, amount, payment_date, mode, direction, contacts(name)").eq("direction", "in").order("created_at", { ascending: false }).limit(6);
    if (can("contacts")) jobs.bdays = supa.from("contacts").select("id, name, phone, dob, anniversary").or("dob.not.is.null,anniversary.not.is.null").limit(3000);

    const keys = Object.keys(jobs);
    const res = await Promise.all(keys.map((k) => jobs[k]));
    const r: Record<string, any> = {};
    keys.forEach((k, i) => (r[k] = res[i]));
    return { r, start };
  }, [scope, period]);

  if (loading || !data) return <Spinner />;
  const { r, start } = data;
  const periodLeads: any[] = r.periodLeads?.data ?? [];
  const won = periodLeads.filter((l) => l.status === "won").length;
  const bySource: Record<string, number> = {};
  periodLeads.forEach((l) => (bySource[l.source] = (bySource[l.source] ?? 0) + 1));
  const open: any[] = r.openLeads?.data ?? [];
  const pb: any[] = r.periodBookings?.data ?? [];
  const pbMine = scope === "me" ? pb.filter((b) => b.handled_by === userId) : pb;
  const inPeriod = pbMine.filter((b) => b.created_at >= start);
  const sales = inPeriod.reduce((a, b) => a + Number(b.sell_amount), 0);
  const profit = inPeriod.reduce((a, b) => a + Number(b.sell_amount) - Number(b.tax_amount) - Number(b.cost_amount), 0);
  const due = (r.due?.data ?? []).reduce((a: number, b: any) => a + Number(b.balance_due), 0);

  // last 6 months bookings value
  const months: { k: string; label: string; v: number }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - i);
    const k = isoDate(d).slice(0, 7);
    months.push({ k, label: d.toLocaleString("en-IN", { month: "short" }), v: pbMine.filter((b) => b.created_at.slice(0, 7) === k).reduce((a, b) => a + Number(b.sell_amount), 0) });
  }
  const maxM = Math.max(1, ...months.map((m) => m.v));

  // birthdays/anniversaries in next 7 days
  const soon: { id: string; name: string; what: string; date: string }[] = [];
  const t0 = new Date(new Date().toDateString());
  (r.bdays?.data ?? []).forEach((c: any) => {
    ([["dob", "🎂 Birthday"], ["anniversary", "💍 Anniversary"]] as const).forEach(([k, label]) => {
      if (!c[k]) return;
      const d = new Date(t0.getFullYear(), Number(c[k].slice(5, 7)) - 1, Number(c[k].slice(8, 10)));
      if (d < t0) d.setFullYear(d.getFullYear() + 1);
      const diff = (d.getTime() - t0.getTime()) / 86400000;
      if (diff <= 7) soon.push({ id: c.id, name: c.name, what: label, date: isoDate(d) });
    });
  });
  soon.sort((a, b) => a.date.localeCompare(b.date));

  const greeting = new Date().getHours() < 12 ? "Good morning" : new Date().getHours() < 17 ? "Good afternoon" : "Good evening";

  return (
    <>
      <PageHeader title={`${greeting}, ${profile.full_name.split(" ")[0]}`} subtitle={new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" })} actions={
        <>
          {teamView && <Select value={scope} onChange={(e) => setScope(e.target.value as any)} className="w-40"><option value="all">Whole team</option><option value="me">Only me</option></Select>}
          <Select value={period} onChange={(e) => setPeriod(e.target.value)} className="w-36"><option value="week">Last 7 days</option><option value="month">This month</option><option value="90">Last 90 days</option><option value="fy">This FY</option></Select>
        </>
      } />

      {can("itineraries") && <div className="mb-6"><PackagesBoard compact /></div>}
      <p className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-600">CRM overview</p>
      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {can("leads") && <Stat label="New leads" value={periodLeads.length} sub={`${r.todayLeads?.count ?? 0} today`} icon={<Users className="h-5 w-5" />} />}
        {can("leads") && <Stat label="Open pipeline" value={open.length} sub={`${open.filter((l) => l.status === "new").length} not contacted`} icon={<TrendingUp className="h-5 w-5" />} tone="violet" />}
        {can("leads") && <Stat label="Conversion" value={periodLeads.length ? `${((won / periodLeads.length) * 100).toFixed(1)}%` : "—"} sub={`${won} won`} icon={<CalendarCheck className="h-5 w-5" />} tone="emerald" />}
        {can("bookings") && <Stat label="Sales booked" value={inr(sales)} sub={`profit ${inr(profit)}`} icon={<IndianRupee className="h-5 w-5" />} tone="sky" />}
        {can("bookings") && <Stat label="Trips next 30 days" value={(r.trips?.data ?? []).length} sub={`${r.onTrip?.count ?? 0} on trip now`} icon={<Plane className="h-5 w-5" />} tone="amber" />}
        {can("bookings") && <Stat label="To collect" value={inr(due)} sub="customer balance" icon={<Wallet className="h-5 w-5" />} tone="rose" />}
      </div>

      <div className="grid gap-5 xl:grid-cols-3">
        {can("followups") && (
          <Card title={<span className="flex items-center gap-2"><AlarmClock className="h-4 w-4 text-sky-600" /> Today&apos;s follow-ups</span>} action={<Link href="/followups" className="text-xs text-brand-700 hover:underline">All</Link>}>
            <ul className="space-y-2">
              {(r.fus?.data ?? []).map((f: any) => {
                const overdue = new Date(f.due_at) < new Date();
                return (
                  <li key={f.id}>
                    <Link href={f.lead_id ? `/leads/${f.lead_id}` : "/followups"} className="flex items-start justify-between gap-2 rounded-lg p-1.5 hover:bg-slate-50">
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium text-slate-800">{f.title}</span>
                        <span className="block truncate text-xs text-slate-500">{f.leads?.name ?? "Task"} · {f.kind}</span>
                      </span>
                      <span className={cn("shrink-0 text-xs", overdue ? "font-medium text-rose-600" : "text-slate-500")}>{overdue ? "overdue" : fmtDateTime(f.due_at).split(", ")[1]}</span>
                    </Link>
                  </li>
                );
              })}
              {!(r.fus?.data ?? []).length && <p className="text-sm text-slate-400">Nothing due today 🎉</p>}
            </ul>
          </Card>
        )}

        {can("leads") && (
          <Card title="Leads by source">
            <div className="space-y-3">
              {Object.entries(bySource).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => (
                <Link key={k} href={`/leads?source=${encodeURIComponent(k)}`} className="block"><Bar label={k} value={v} max={Math.max(...Object.values(bySource))} /></Link>
              ))}
              {!periodLeads.length && <p className="text-sm text-slate-400">No leads in this period.</p>}
            </div>
          </Card>
        )}

        {can("leads") && (
          <Card title="Pipeline status (open + this period)">
            <div className="space-y-3">
              {LEAD_STATUSES.filter((s) => !["won", "lost"].includes(s.value)).map((s) => {
                const n = open.filter((l) => l.status === s.value).length;
                return <Link key={s.value} href={`/leads?status=${s.value}`} className="block"><Bar label={s.label} value={n} max={Math.max(1, open.length)} color={s.dot} /></Link>;
              })}
              <Bar label="Won (period)" value={won} max={Math.max(1, periodLeads.length)} color="bg-emerald-500" />
              <Bar label="Lost (period)" value={periodLeads.filter((l) => l.status === "lost").length} max={Math.max(1, periodLeads.length)} color="bg-rose-500" />
            </div>
          </Card>
        )}

        {can("leads") && (r.unattended?.data ?? []).length > 0 && (
          <Card title={<span className="flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-amber-500" /> Unattended leads</span>} action={<Link href="/leads?fu=none&status=new" className="text-xs text-brand-700 hover:underline">All</Link>}>
            <ul className="space-y-1.5">
              {(r.unattended?.data ?? []).map((l: any) => (
                <li key={l.id}><Link href={`/leads/${l.id}`} className="flex justify-between rounded p-1.5 text-sm hover:bg-slate-50"><span>{l.name} <span className="text-xs text-slate-500">· {l.source}</span></span><span className="text-xs text-amber-600">{timeAgo(l.created_at)}</span></Link></li>
              ))}
            </ul>
          </Card>
        )}

        {can("bookings") && (
          <Card title="Upcoming trips" action={<Link href="/bookings" className="text-xs text-brand-700 hover:underline">All</Link>} className={cn((r.unattended?.data ?? []).length ? "" : "xl:col-span-1")}>
            <ul className="space-y-1.5">
              {(r.trips?.data ?? []).map((b: any) => (
                <li key={b.id}>
                  <Link href={`/bookings/${b.id}`} className="flex items-center justify-between rounded p-1.5 hover:bg-slate-50">
                    <span className="min-w-0"><span className="block truncate text-sm font-medium">{b.title}</span><span className="text-xs text-slate-500">{b.contact_name} · {fmtDate(b.start_date)}</span></span>
                    {Number(b.balance_due) > 0 ? <Badge className="bg-rose-100 text-rose-700">due {inr(b.balance_due)}</Badge> : <Badge className="bg-emerald-100 text-emerald-700">paid</Badge>}
                  </Link>
                </li>
              ))}
              {!(r.trips?.data ?? []).length && <p className="text-sm text-slate-400">No trips in the next 30 days.</p>}
            </ul>
          </Card>
        )}

        {can("bookings") && (
          <Card title="Sales booked — last 6 months">
            <div className="flex h-40 items-end gap-3">
              {months.map((m) => (
                <div key={m.k} className="flex flex-1 flex-col items-center gap-1">
                  <span className="text-[10px] text-slate-500">{m.v ? `${(m.v / 1000).toFixed(0)}k` : ""}</span>
                  <div className="w-full rounded-t-md bg-brand-500" style={{ height: `${Math.max(2, (m.v / maxM) * 120)}px` }} />
                  <span className="text-xs text-slate-600">{m.label}</span>
                </div>
              ))}
            </div>
          </Card>
        )}

        {can("payments") && (
          <Card title="Recent payments received" action={<Link href="/payments" className="text-xs text-brand-700 hover:underline">All</Link>}>
            <ul className="space-y-1.5">
              {(r.pays?.data ?? []).map((p: any) => (
                <li key={p.id} className="flex justify-between text-sm"><span>{p.contacts?.name ?? "—"} <span className="text-xs text-slate-500">· {p.mode} · {fmtDate(p.payment_date)}</span></span><span className="font-medium text-emerald-700">{inr(p.amount)}</span></li>
              ))}
              {!(r.pays?.data ?? []).length && <p className="text-sm text-slate-400">No payments yet.</p>}
            </ul>
          </Card>
        )}

        {soon.length > 0 && (
          <Card title={<span className="flex items-center gap-2"><Cake className="h-4 w-4 text-pink-500" /> Wish your customers (next 7 days)</span>}>
            <ul className="space-y-1.5">
              {soon.slice(0, 8).map((s) => (
                <li key={s.id + s.what}><Link href={`/contacts/${s.id}`} className="flex justify-between rounded p-1.5 text-sm hover:bg-slate-50"><span>{s.name}</span><span className="text-xs text-slate-500">{s.what} · {fmtDate(s.date)}</span></Link></li>
              ))}
            </ul>
          </Card>
        )}
      </div>
    </>
  );
}

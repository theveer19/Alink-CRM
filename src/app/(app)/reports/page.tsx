"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { Download } from "lucide-react";
import { sb } from "@/lib/supabase/client";
import { LEAD_STATUSES } from "@/lib/constants";
import { cn, downloadCsv, fmtDate, inr, isoDate } from "@/lib/utils";
import { useLoad } from "@/lib/hooks";
import { Guard, useAuth } from "@/components/auth";
import { Bar, Button, Card, Input, PageHeader, Select, Spinner, Stat, Table, Tabs, Td, Th } from "@/components/ui";

export default function ReportsPage() {
  return <Guard module="reports"><Reports /></Guard>;
}

function fyStart() {
  const d = new Date();
  const y = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1;
  return `${y}-04-01`;
}

function Reports() {
  const [tab, setTab] = useState("pnl");
  const [preset, setPreset] = useState("month");
  const [from, setFrom] = useState(() => { const d = new Date(); return isoDate(new Date(d.getFullYear(), d.getMonth(), 1)); });
  const [to, setTo] = useState(isoDate());

  function applyPreset(p: string) {
    setPreset(p);
    const d = new Date();
    if (p === "month") { setFrom(isoDate(new Date(d.getFullYear(), d.getMonth(), 1))); setTo(isoDate()); }
    if (p === "last") { setFrom(isoDate(new Date(d.getFullYear(), d.getMonth() - 1, 1))); setTo(isoDate(new Date(d.getFullYear(), d.getMonth(), 0))); }
    if (p === "quarter") { const q = Math.floor(d.getMonth() / 3) * 3; setFrom(isoDate(new Date(d.getFullYear(), q, 1))); setTo(isoDate()); }
    if (p === "fy") { setFrom(fyStart()); setTo(isoDate()); }
  }

  return (
    <>
      <PageHeader title="Reports" subtitle="Profit & loss, GST / tax, sales performance, receivables and payables" />
      <Tabs value={tab} onChange={setTab} tabs={[
        { value: "pnl", label: "Profit & Loss" }, { value: "tax", label: "GST / Tax" }, { value: "sales", label: "Sales & leads" },
        { value: "recv", label: "Receivables" }, { value: "pay", label: "Supplier payables" },
      ]} />
      {(tab === "pnl" || tab === "tax" || tab === "sales") && (
        <Card bodyClass="p-3" className="mb-4">
          <div className="flex flex-wrap items-center gap-2">
            <Select value={preset} onChange={(e) => applyPreset(e.target.value)} className="w-40">
              <option value="month">This month</option><option value="last">Last month</option><option value="quarter">This quarter</option><option value="fy">This financial year</option><option value="custom">Custom</option>
            </Select>
            <Input type="date" value={from} onChange={(e) => { setPreset("custom"); setFrom(e.target.value); }} className="w-40" />
            <span className="text-slate-400">to</span>
            <Input type="date" value={to} onChange={(e) => { setPreset("custom"); setTo(e.target.value); }} className="w-40" />
          </div>
        </Card>
      )}
      {tab === "pnl" && <PnL from={from} to={to} />}
      {tab === "tax" && <Tax from={from} to={to} />}
      {tab === "sales" && <Sales from={from} to={to} />}
      {tab === "recv" && <Receivables />}
      {tab === "pay" && <Payables />}
    </>
  );
}

function PnL({ from, to }: { from: string; to: string }) {
  const [basis, setBasis] = useState<"start" | "created">("start");
  const { data, loading } = useLoad(async () => {
    const supa = sb();
    let bq = supa.from("bookings").select("id, booking_no, title, start_date, created_at, status, sell_amount, tax_amount, cost_amount, itinerary_id, contacts(name), itineraries!bookings_itinerary_id_fkey(gst_total, tcs_total)").neq("status", "cancelled");
    bq = basis === "start" ? bq.gte("start_date", from).lte("start_date", to) : bq.gte("created_at", from).lte("created_at", to + "T23:59:59");
    const [b, inv, ex] = await Promise.all([
      bq.order("start_date"),
      supa.from("invoices").select("booking_id, cgst, sgst, igst, tcs, status").not("status", "in", "(cancelled,draft)").not("booking_id", "is", null),
      supa.from("expenses").select("category, amount").gte("expense_date", from).lte("expense_date", to),
    ]);
    if (b.error) throw b.error;
    const taxByBooking: Record<string, number> = {};
    (inv.data ?? []).forEach((i: any) => { taxByBooking[i.booking_id] = (taxByBooking[i.booking_id] ?? 0) + Number(i.cgst) + Number(i.sgst) + Number(i.igst) + Number(i.tcs); });
    const rows = (b.data ?? []).map((x: any) => {
      const it = Array.isArray(x.itineraries) ? x.itineraries[0] : x.itineraries;
      const tax = taxByBooking[x.id] ?? (Number(x.tax_amount) || (it ? Number(it.gst_total) + Number(it.tcs_total) : 0));
      const net = Number(x.sell_amount) - tax;
      return { ...x, tax, net, profit: net - Number(x.cost_amount) };
    });
    const expByCat: Record<string, number> = {};
    (ex.data ?? []).forEach((e: any) => { expByCat[e.category] = (expByCat[e.category] ?? 0) + Number(e.amount); });
    return { rows, expByCat };
  }, [from, to, basis]);

  if (loading || !data) return <Spinner />;
  const sales = data.rows.reduce((a, r) => a + r.net, 0);
  const cost = data.rows.reduce((a, r) => a + Number(r.cost_amount), 0);
  const gross = sales - cost;
  const expenses = Object.values(data.expByCat).reduce((a, b) => a + b, 0);
  const net = gross - expenses;

  return (
    <>
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat label="Net sales (excl. GST/TCS)" value={inr(sales)} sub={`${data.rows.length} trips`} />
        <Stat label="Supplier cost" value={inr(cost)} tone="amber" />
        <Stat label="Gross profit" value={inr(gross)} tone="emerald" sub={sales ? `${((gross / sales) * 100).toFixed(1)}% margin` : undefined} />
        <Stat label="Office expenses" value={inr(expenses)} tone="rose" />
        <Stat label="Net profit" value={inr(net)} tone={net >= 0 ? "emerald" : "rose"} />
      </div>
      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2" bodyClass="p-0" title="Trip-wise profit" action={
          <div className="flex gap-2">
            <Select value={basis} onChange={(e) => setBasis(e.target.value as any)} className="h-8 w-44 text-xs"><option value="start">By travel start date</option><option value="created">By booking date</option></Select>
            <Button size="sm" variant="secondary" onClick={() => downloadCsv(`pnl-${from}-${to}.csv`, [["Booking", "Trip", "Customer", "Start", "Sell (incl tax)", "Tax", "Net sale", "Cost", "Profit"], ...data.rows.map((r) => [r.booking_no, r.title, r.contacts?.name, r.start_date, r.sell_amount, r.tax, r.net, r.cost_amount, r.profit]), [], ["", "", "", "", "", "", sales, cost, gross], ["Office expenses", "", "", "", "", "", "", "", -expenses], ["Net profit", "", "", "", "", "", "", "", net]])}><Download className="h-3.5 w-3.5" /> CSV</Button>
          </div>
        }>
          <Table>
            <thead><tr><Th>Booking</Th><Th>Start</Th><Th className="text-right">Net sale</Th><Th className="text-right">Cost</Th><Th className="text-right">Profit</Th><Th className="text-right">Margin</Th></tr></thead>
            <tbody>
              {data.rows.map((r) => (
                <tr key={r.id}>
                  <Td><Link href={`/bookings/${r.id}`} className="font-medium hover:text-brand-700">{r.title}</Link><div className="text-xs text-slate-500">{r.booking_no} · {r.contacts?.name}</div></Td>
                  <Td className="text-xs">{fmtDate(r.start_date)}</Td>
                  <Td className="text-right">{inr(r.net)}</Td>
                  <Td className="text-right">{inr(r.cost_amount)}</Td>
                  <Td className={cn("text-right font-medium", r.profit < 0 ? "text-rose-600" : "text-emerald-700")}>{inr(r.profit)}</Td>
                  <Td className="text-right text-xs">{r.net ? `${((r.profit / r.net) * 100).toFixed(1)}%` : "—"}</Td>
                </tr>
              ))}
              {!data.rows.length && <tr><Td colSpan={6} className="text-slate-400">No trips in this period.</Td></tr>}
            </tbody>
          </Table>
        </Card>
        <Card title="Expenses by category">
          <div className="space-y-3">
            {Object.entries(data.expByCat).sort((a, b) => b[1] - a[1]).map(([k, v]) => <Bar key={k} label={k} value={v} max={expenses} right={inr(v)} color="bg-rose-400" />)}
            {!expenses && <p className="text-sm text-slate-400">No expenses recorded. Add them in Payments → Office expenses.</p>}
          </div>
        </Card>
      </div>
    </>
  );
}

function Tax({ from, to }: { from: string; to: string }) {
  const { data, loading } = useLoad(async () => {
    const { data, error } = await sb().from("invoices").select("*").not("status", "in", "(cancelled,draft)").gte("invoice_date", from).lte("invoice_date", to).order("invoice_date");
    if (error) throw error;
    return data ?? [];
  }, [from, to]);
  const months = useMemo(() => {
    const m: Record<string, { taxable: number; cgst: number; sgst: number; igst: number; tcs: number; total: number; n: number }> = {};
    (data ?? []).forEach((i: any) => {
      const k = i.invoice_date.slice(0, 7);
      m[k] ??= { taxable: 0, cgst: 0, sgst: 0, igst: 0, tcs: 0, total: 0, n: 0 };
      m[k].taxable += Number(i.taxable_value); m[k].cgst += Number(i.cgst); m[k].sgst += Number(i.sgst); m[k].igst += Number(i.igst);
      m[k].tcs += Number(i.tcs); m[k].total += Number(i.total); m[k].n++;
    });
    return m;
  }, [data]);
  if (loading || !data) return <Spinner />;
  const s = (k: string) => data.reduce((a: number, i: any) => a + Number(i[k]), 0);
  const b2b = data.filter((i: any) => i.bill_to_gstin);

  return (
    <>
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-6">
        <Stat label="Invoices" value={data.length} sub={`${b2b.length} B2B · ${data.length - b2b.length} B2C`} />
        <Stat label="Taxable value" value={inr(s("taxable_value"))} />
        <Stat label="CGST" value={inr(s("cgst"))} tone="violet" />
        <Stat label="SGST" value={inr(s("sgst"))} tone="violet" />
        <Stat label="IGST" value={inr(s("igst"))} tone="violet" />
        <Stat label="TCS collected" value={inr(s("tcs"))} tone="amber" />
      </div>
      <Card title="Month-wise GST summary" bodyClass="p-0" className="mb-5">
        <Table>
          <thead><tr><Th>Month</Th><Th className="text-right">Invoices</Th><Th className="text-right">Taxable</Th><Th className="text-right">CGST</Th><Th className="text-right">SGST</Th><Th className="text-right">IGST</Th><Th className="text-right">Total GST</Th><Th className="text-right">TCS</Th></tr></thead>
          <tbody>
            {Object.entries(months).map(([k, m]) => (
              <tr key={k}><Td>{k}</Td><Td className="text-right">{m.n}</Td><Td className="text-right">{inr(m.taxable, 2)}</Td><Td className="text-right">{inr(m.cgst, 2)}</Td><Td className="text-right">{inr(m.sgst, 2)}</Td><Td className="text-right">{inr(m.igst, 2)}</Td><Td className="text-right font-medium">{inr(m.cgst + m.sgst + m.igst, 2)}</Td><Td className="text-right">{inr(m.tcs, 2)}</Td></tr>
            ))}
            {!Object.keys(months).length && <tr><Td colSpan={8} className="text-slate-400">No issued invoices in this period.</Td></tr>}
          </tbody>
        </Table>
      </Card>
      <Card title="Invoice register (for GSTR-1)" bodyClass="p-0" action={
        <Button size="sm" variant="secondary" onClick={() => downloadCsv(`gst-register-${from}-${to}.csv`, [["Invoice No", "Date", "Customer", "GSTIN", "Place of supply", "Type", "Taxable", "GST %", "CGST", "SGST", "IGST", "TCS", "Invoice value"], ...data.map((i: any) => [i.invoice_no, i.invoice_date, i.bill_to_name, i.bill_to_gstin, i.place_of_supply, i.bill_to_gstin ? "B2B" : "B2C", i.taxable_value, i.gst_percent, i.cgst, i.sgst, i.igst, i.tcs, i.total])])}><Download className="h-3.5 w-3.5" /> CSV</Button>
      }>
        <Table>
          <thead><tr><Th>Invoice</Th><Th>Date</Th><Th>Customer</Th><Th>GSTIN</Th><Th className="text-right">Taxable</Th><Th className="text-right">GST</Th><Th className="text-right">Total</Th></tr></thead>
          <tbody>
            {data.map((i: any) => (
              <tr key={i.id}>
                <Td><Link href={`/invoices/${i.id}`} className="font-medium hover:text-brand-700">{i.invoice_no}</Link></Td>
                <Td className="text-xs">{fmtDate(i.invoice_date)}</Td><Td>{i.bill_to_name}</Td><Td className="text-xs">{i.bill_to_gstin ?? "—"}</Td>
                <Td className="text-right">{inr(i.taxable_value, 2)}</Td><Td className="text-right">{inr(Number(i.cgst) + Number(i.sgst) + Number(i.igst), 2)}</Td><Td className="text-right">{inr(i.total, 2)}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </>
  );
}

function Sales({ from, to }: { from: string; to: string }) {
  const { team } = useAuth();
  const { data, loading } = useLoad(async () => {
    const supa = sb();
    const [l, b] = await Promise.all([
      supa.from("leads").select("id, source, status, assigned_to, lost_reason, converted_at").gte("created_at", from).lte("created_at", to + "T23:59:59").limit(20000),
      supa.from("bookings").select("id, lead_id, handled_by, sell_amount, tax_amount, cost_amount, status, created_at").neq("status", "cancelled").gte("created_at", from).lte("created_at", to + "T23:59:59"),
    ]);
    if (l.error) throw l.error;
    return { leads: l.data ?? [], bookings: b.data ?? [] };
  }, [from, to]);
  if (loading || !data) return <Spinner />;
  const { leads, bookings } = data;
  const won = leads.filter((l: any) => l.status === "won").length;
  const revenue = bookings.reduce((a: number, b: any) => a + Number(b.sell_amount), 0);

  const bySource: Record<string, { n: number; won: number; lost: number }> = {};
  leads.forEach((l: any) => { bySource[l.source] ??= { n: 0, won: 0, lost: 0 }; bySource[l.source].n++; if (l.status === "won") bySource[l.source].won++; if (l.status === "lost") bySource[l.source].lost++; });
  const maxSrc = Math.max(1, ...Object.values(bySource).map((x) => x.n));

  const byStaff = team.map((t) => {
    const mine = leads.filter((l: any) => l.assigned_to === t.id);
    const bk = bookings.filter((b: any) => b.handled_by === t.id);
    const rev = bk.reduce((a: number, b: any) => a + Number(b.sell_amount), 0);
    const profit = bk.reduce((a: number, b: any) => a + Number(b.sell_amount) - Number(b.tax_amount) - Number(b.cost_amount), 0);
    return { t, leads: mine.length, won: mine.filter((l: any) => l.status === "won").length, open: mine.filter((l: any) => !["won", "lost"].includes(l.status)).length, rev, profit, trips: bk.length };
  }).filter((x) => x.leads || x.trips);

  const lostReasons: Record<string, number> = {};
  leads.filter((l: any) => l.status === "lost").forEach((l: any) => { const k = l.lost_reason || "Not given"; lostReasons[k] = (lostReasons[k] ?? 0) + 1; });

  return (
    <>
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="New leads" value={leads.length} />
        <Stat label="Won" value={won} tone="emerald" sub={leads.length ? `${((won / leads.length) * 100).toFixed(1)}% conversion` : undefined} />
        <Stat label="Bookings" value={bookings.length} tone="sky" />
        <Stat label="Booking value" value={inr(revenue)} tone="violet" />
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Lead source performance">
          <div className="space-y-3">
            {Object.entries(bySource).sort((a, b) => b[1].n - a[1].n).map(([k, v]) => (
              <Bar key={k} label={k} value={v.n} max={maxSrc} right={<span>{v.n} leads · <span className="text-emerald-600">{v.won} won</span> · {v.n ? ((v.won / v.n) * 100).toFixed(0) : 0}%</span>} />
            ))}
            {!leads.length && <p className="text-sm text-slate-400">No leads in this period.</p>}
          </div>
        </Card>
        <Card title="Pipeline (leads created in period)">
          <div className="space-y-3">
            {LEAD_STATUSES.map((s) => { const n = leads.filter((l: any) => l.status === s.value).length; return <Bar key={s.value} label={s.label} value={n} max={Math.max(1, leads.length)} color={s.dot} />; })}
          </div>
        </Card>
        <Card title="Team performance" bodyClass="p-0" className="lg:col-span-2">
          <Table>
            <thead><tr><Th>Staff</Th><Th className="text-right">Leads</Th><Th className="text-right">Open</Th><Th className="text-right">Won</Th><Th className="text-right">Conv.</Th><Th className="text-right">Trips</Th><Th className="text-right">Sales</Th><Th className="text-right">Profit</Th><Th>Monthly target</Th></tr></thead>
            <tbody>
              {byStaff.map((x) => (
                <tr key={x.t.id}>
                  <Td className="font-medium">{x.t.full_name}</Td>
                  <Td className="text-right">{x.leads}</Td><Td className="text-right">{x.open}</Td><Td className="text-right text-emerald-700">{x.won}</Td>
                  <Td className="text-right">{x.leads ? `${((x.won / x.leads) * 100).toFixed(0)}%` : "—"}</Td>
                  <Td className="text-right">{x.trips}</Td><Td className="text-right">{inr(x.rev)}</Td><Td className="text-right">{inr(x.profit)}</Td>
                  <Td className="w-48">{Number(x.t.monthly_target) > 0 ? <Bar label="" value={x.rev} max={Number(x.t.monthly_target)} right={`${Math.round((x.rev / Number(x.t.monthly_target)) * 100)}%`} color={x.rev >= Number(x.t.monthly_target) ? "bg-emerald-500" : "bg-amber-400"} /> : <span className="text-xs text-slate-400">not set</span>}</Td>
                </tr>
              ))}
              {!byStaff.length && <tr><Td colSpan={9} className="text-slate-400">No activity.</Td></tr>}
            </tbody>
          </Table>
        </Card>
        <Card title="Why leads were lost">
          <div className="space-y-3">
            {Object.entries(lostReasons).sort((a, b) => b[1] - a[1]).map(([k, v]) => <Bar key={k} label={k} value={v} max={Math.max(...Object.values(lostReasons))} color="bg-rose-400" />)}
            {!Object.keys(lostReasons).length && <p className="text-sm text-slate-400">No lost leads 🎉</p>}
          </div>
        </Card>
      </div>
    </>
  );
}

function Receivables() {
  const { data, loading } = useLoad(async () => {
    const { data, error } = await sb().from("booking_summary").select("*").gt("balance_due", 0).neq("status", "cancelled").order("start_date");
    if (error) throw error;
    return data ?? [];
  }, []);
  if (loading || !data) return <Spinner />;
  const today = isoDate();
  const total = data.reduce((a: number, b: any) => a + Number(b.balance_due), 0);
  const travelled = data.filter((b: any) => b.start_date && b.start_date <= today).reduce((a: number, b: any) => a + Number(b.balance_due), 0);
  return (
    <>
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-3">
        <Stat label="Total receivable" value={inr(total)} tone="rose" sub={`${data.length} bookings`} />
        <Stat label="Trip started / done (collect now!)" value={inr(travelled)} tone="rose" />
        <Stat label="Upcoming trips" value={inr(total - travelled)} tone="amber" />
      </div>
      <Card bodyClass="p-0" title="Outstanding by booking" action={<Button size="sm" variant="secondary" onClick={() => downloadCsv(`receivables-${today}.csv`, [["Booking", "Customer", "Phone", "Start", "Package", "Received", "Due"], ...data.map((b: any) => [b.booking_no, b.contact_name, b.contact_phone, b.start_date, b.sell_amount, b.received, b.balance_due])])}><Download className="h-3.5 w-3.5" /> CSV</Button>}>
        <Table>
          <thead><tr><Th>Booking</Th><Th>Customer</Th><Th>Trip start</Th><Th className="text-right">Package</Th><Th className="text-right">Received</Th><Th className="text-right">Due</Th></tr></thead>
          <tbody>
            {data.map((b: any) => (
              <tr key={b.id}>
                <Td><Link href={`/bookings/${b.id}`} className="font-medium hover:text-brand-700">{b.booking_no}</Link><div className="text-xs text-slate-500">{b.title}</div></Td>
                <Td>{b.contact_name}<div className="text-xs text-slate-500">{b.contact_phone}</div></Td>
                <Td className={cn("text-xs", b.start_date && b.start_date <= today && "font-medium text-rose-600")}>{fmtDate(b.start_date)}</Td>
                <Td className="text-right">{inr(b.sell_amount)}</Td><Td className="text-right">{inr(b.received)}</Td><Td className="text-right font-medium text-rose-600">{inr(b.balance_due)}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </>
  );
}

function Payables() {
  const { data, loading } = useLoad(async () => {
    const supa = sb();
    const [s, p, sup] = await Promise.all([
      supa.from("booking_services").select("supplier_id, cost, status, bookings!inner(status)").neq("status", "cancelled").not("supplier_id", "is", null),
      supa.from("payments").select("supplier_id, amount").eq("direction", "out").not("supplier_id", "is", null),
      supa.from("suppliers").select("id, name, supplier_type, phone"),
    ]);
    const m: Record<string, { cost: number; paid: number }> = {};
    (s.data ?? []).filter((x: any) => x.bookings?.status !== "cancelled").forEach((x: any) => { m[x.supplier_id] ??= { cost: 0, paid: 0 }; m[x.supplier_id].cost += Number(x.cost); });
    (p.data ?? []).forEach((x: any) => { m[x.supplier_id] ??= { cost: 0, paid: 0 }; m[x.supplier_id].paid += Number(x.amount); });
    return (sup.data ?? []).map((x: any) => ({ ...x, ...(m[x.id] ?? { cost: 0, paid: 0 }) })).filter((x: any) => x.cost || x.paid).sort((a: any, b: any) => (b.cost - b.paid) - (a.cost - a.paid));
  }, []);
  if (loading || !data) return <Spinner />;
  const due = data.reduce((a: number, x: any) => a + Math.max(0, x.cost - x.paid), 0);
  return (
    <>
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-3"><Stat label="Total payable to suppliers" value={inr(due)} tone="rose" /></div>
      <Card bodyClass="p-0" title="Supplier ledger" action={<Button size="sm" variant="secondary" onClick={() => downloadCsv(`payables-${isoDate()}.csv`, [["Supplier", "Type", "Phone", "Booked cost", "Paid", "Balance"], ...data.map((x: any) => [x.name, x.supplier_type, x.phone, x.cost, x.paid, x.cost - x.paid])])}><Download className="h-3.5 w-3.5" /> CSV</Button>}>
        <Table>
          <thead><tr><Th>Supplier</Th><Th>Type</Th><Th className="text-right">Booked cost</Th><Th className="text-right">Paid</Th><Th className="text-right">Balance</Th></tr></thead>
          <tbody>
            {data.map((x: any) => (
              <tr key={x.id}>
                <Td className="font-medium">{x.name}<div className="text-xs text-slate-500">{x.phone}</div></Td><Td className="text-xs capitalize">{x.supplier_type}</Td>
                <Td className="text-right">{inr(x.cost)}</Td><Td className="text-right">{inr(x.paid)}</Td>
                <Td className={cn("text-right font-medium", x.cost - x.paid > 0 ? "text-rose-600" : "text-emerald-600")}>{inr(x.cost - x.paid)}</Td>
              </tr>
            ))}
            {!data.length && <tr><Td colSpan={5} className="text-slate-400">No supplier transactions yet.</Td></tr>}
          </tbody>
        </Table>
      </Card>
    </>
  );
}

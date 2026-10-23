"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Download, Plus } from "lucide-react";
import { sb } from "@/lib/supabase/client";
import { BOOKING_STATUSES, statusMeta } from "@/lib/constants";
import type { Booking } from "@/lib/types";
import { cn, downloadCsv, fmtDate, inr, isoDate } from "@/lib/utils";
import { useDebounced } from "@/lib/hooks";
import { Guard, useAuth } from "@/components/auth";
import { BookingForm } from "@/components/booking-form";
import { Badge, Button, Card, Empty, Input, PageHeader, Select, Spinner, Stat, Table, Td, Th } from "@/components/ui";

export default function BookingsPage() {
  return <Guard module="bookings"><Bookings /></Guard>;
}

function Bookings() {
  const { can } = useAuth();
  const [rows, setRows] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const dq = useDebounced(q);
  const [status, setStatus] = useState("");
  const [when, setWhen] = useState("upcoming");
  const [open, setOpen] = useState(false);

  async function load() {
    setLoading(true);
    let qb = sb().from("booking_summary").select("*").limit(500);
    const t = dq.trim().replace(/[%,()]/g, "");
    if (t) qb = qb.or(`title.ilike.%${t}%,booking_no.ilike.%${t}%,destination.ilike.%${t}%,contact_name.ilike.%${t}%`);
    if (status) qb = qb.eq("status", status);
    const today = isoDate();
    if (when === "upcoming") qb = qb.gte("start_date", today).order("start_date");
    else if (when === "ongoing") qb = qb.lte("start_date", today).gte("end_date", today).order("start_date");
    else if (when === "past") qb = qb.lt("end_date", today).order("start_date", { ascending: false });
    else if (when === "due") qb = qb.gt("balance_due", 0).neq("status", "cancelled").order("start_date");
    else qb = qb.order("created_at", { ascending: false });
    const { data, error } = await qb;
    setLoading(false);
    if (error) return toast.error(error.message);
    setRows((data ?? []) as Booking[]);
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [dq, status, when]);

  const live = rows.filter((r) => r.status !== "cancelled");
  const sum = (k: keyof Booking) => live.reduce((a, r) => a + Number(r[k] ?? 0), 0);

  return (
    <>
      <PageHeader title="Bookings / Trips" subtitle="Confirmed trips, services, supplier costs and collections" actions={
        <>
          <Button variant="secondary" onClick={() => downloadCsv(`bookings-${isoDate()}.csv`, [["Booking", "Title", "Customer", "Start", "End", "Status", "Sell", "Cost", "Profit", "Received", "Due"], ...rows.map((r) => [r.booking_no, r.title, r.contact_name, r.start_date, r.end_date, r.status, r.sell_amount, r.cost_amount, r.profit, r.received, r.balance_due])])}><Download className="h-4 w-4" /> Export</Button>
          {can("bookings", "create") && <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> New booking</Button>}
        </>
      } />
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Trips in view" value={live.length} />
        <Stat label="Sales value" value={inr(sum("sell_amount"))} tone="sky" />
        <Stat label="Gross profit" value={inr(sum("profit"))} tone="emerald" />
        <Stat label="To collect" value={inr(live.reduce((a, r) => a + Math.max(0, Number(r.balance_due ?? 0)), 0))} tone="rose" />
      </div>
      <Card bodyClass="p-3" className="mb-4">
        <div className="flex flex-wrap gap-2">
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search booking, customer, destination" className="w-72" />
          <Select value={when} onChange={(e) => setWhen(e.target.value)} className="w-44">
            <option value="upcoming">Upcoming trips</option><option value="ongoing">On trip now</option><option value="past">Past trips</option>
            <option value="due">Payment pending</option><option value="all">All (latest first)</option>
          </Select>
          <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-40"><option value="">All statuses</option>{BOOKING_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}</Select>
        </div>
      </Card>
      {loading ? <Spinner /> : (
        <Card bodyClass="p-0">
          {rows.length === 0 ? <Empty title="No bookings" text="Bookings are created when a customer accepts a quotation, or add one manually." /> : (
            <Table>
              <thead><tr><Th>Booking</Th><Th>Customer</Th><Th>Travel</Th><Th>Status</Th><Th className="text-right">Sell</Th><Th className="text-right">Profit</Th><Th className="text-right">Received</Th><Th className="text-right">Due</Th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50">
                    <Td><Link href={`/bookings/${r.id}`} className="font-medium hover:text-brand-700">{r.title}</Link><div className="text-xs text-slate-500">{r.booking_no} · {r.destination}</div></Td>
                    <Td>{r.contact_name ?? "—"}<div className="text-xs text-slate-500">{r.contact_phone}</div></Td>
                    <Td className="text-xs">{fmtDate(r.start_date)} → {fmtDate(r.end_date)}<div className="text-slate-500">{r.adults}A{r.children ? ` ${r.children}C` : ""}</div></Td>
                    <Td><Badge className={statusMeta(BOOKING_STATUSES, r.status)?.color}>{statusMeta(BOOKING_STATUSES, r.status)?.label}</Badge></Td>
                    <Td className="text-right">{inr(r.sell_amount)}</Td>
                    <Td className={cn("text-right", Number(r.profit) < 0 ? "text-rose-600" : "text-emerald-700")}>{inr(r.profit)}</Td>
                    <Td className="text-right">{inr(r.received)}</Td>
                    <Td className={cn("text-right", Number(r.balance_due) > 0 && "font-medium text-rose-600")}>{Number(r.balance_due) > 0 ? inr(r.balance_due) : "—"}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      )}
      <BookingForm open={open} onClose={() => setOpen(false)} onSaved={(id) => (window.location.href = `/bookings/${id}`)} />
    </>
  );
}

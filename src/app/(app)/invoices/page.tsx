"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Download, Plus } from "lucide-react";
import { sb } from "@/lib/supabase/client";
import { INVOICE_STATUSES, statusMeta } from "@/lib/constants";
import type { Invoice } from "@/lib/types";
import { cn, downloadCsv, fmtDate, inr, isoDate } from "@/lib/utils";
import { useDebounced } from "@/lib/hooks";
import { Guard, useAuth } from "@/components/auth";
import { Badge, Button, Card, Empty, Input, PageHeader, Select, Spinner, Stat, Table, Td, Th } from "@/components/ui";

export default function InvoicesPage() {
  return <Guard module="invoices"><Invoices /></Guard>;
}

function Invoices() {
  const { can, settings } = useAuth();
  const router = useRouter();
  const [rows, setRows] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const dq = useDebounced(q);
  const [status, setStatus] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  useEffect(() => {
    (async () => {
      setLoading(true);
      let qb = sb().from("invoices").select("*").order("invoice_date", { ascending: false }).order("created_at", { ascending: false }).limit(500);
      const t = dq.trim().replace(/[%,()]/g, "");
      if (t) qb = qb.or(`invoice_no.ilike.%${t}%,bill_to_name.ilike.%${t}%,bill_to_phone.ilike.%${t}%`);
      if (status === "outstanding") qb = qb.in("status", ["unpaid", "partial"]);
      else if (status) qb = qb.eq("status", status);
      if (from) qb = qb.gte("invoice_date", from);
      if (to) qb = qb.lte("invoice_date", to);
      const { data, error } = await qb;
      setLoading(false);
      if (error) return toast.error(error.message);
      setRows((data ?? []) as Invoice[]);
    })();
  }, [dq, status, from, to]);

  const live = rows.filter((r) => r.status !== "cancelled" && r.status !== "draft");
  const total = live.reduce((a, r) => a + Number(r.total), 0);
  const paid = live.reduce((a, r) => a + Number(r.amount_paid), 0);
  const tax = live.reduce((a, r) => a + Number(r.cgst) + Number(r.sgst) + Number(r.igst), 0);

  async function blank() {
    const { data, error } = await sb().from("invoices").insert({
      bill_to_name: "Customer", status: "draft", gst_percent: settings.default_gst_percent, tcs_percent: settings.default_tcs_percent,
      terms: settings.invoice_terms, place_of_supply: settings.state,
    }).select("id").single();
    if (error) return toast.error(error.message);
    router.push(`/invoices/${data.id}`);
  }

  return (
    <>
      <PageHeader title="Invoices" subtitle="GST invoices with auto tax calculation" actions={
        <>
          <Button variant="secondary" onClick={() => downloadCsv(`invoices-${isoDate()}.csv`, [["Invoice", "Date", "Customer", "GSTIN", "Taxable", "CGST", "SGST", "IGST", "TCS", "Total", "Paid", "Status"], ...rows.map((r) => [r.invoice_no, r.invoice_date, r.bill_to_name, r.bill_to_gstin, r.taxable_value, r.cgst, r.sgst, r.igst, r.tcs, r.total, r.amount_paid, r.status])])}><Download className="h-4 w-4" /> Export</Button>
          {can("invoices", "create") && <Button onClick={blank}><Plus className="h-4 w-4" /> Blank invoice</Button>}
        </>
      } />
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Invoiced" value={inr(total)} />
        <Stat label="Collected" value={inr(paid)} tone="emerald" />
        <Stat label="Outstanding" value={inr(total - paid)} tone="rose" />
        <Stat label="GST" value={inr(tax)} tone="violet" />
      </div>
      <Card bodyClass="p-3" className="mb-4">
        <div className="flex flex-wrap gap-2">
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Invoice no, customer, phone" className="w-64" />
          <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-40">
            <option value="">All</option><option value="outstanding">Outstanding</option>
            {INVOICE_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </Select>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-36" />
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-36" />
        </div>
      </Card>
      {loading ? <Spinner /> : (
        <Card bodyClass="p-0">
          {rows.length === 0 ? <Empty title="No invoices" text="Open a booking and click 'Create invoice'." /> : (
            <Table>
              <thead><tr><Th>Invoice</Th><Th>Customer</Th><Th>Date</Th><Th>Status</Th><Th className="text-right">GST</Th><Th className="text-right">Total</Th><Th className="text-right">Balance</Th></tr></thead>
              <tbody>
                {rows.map((r) => {
                  const bal = Number(r.total) - Number(r.amount_paid);
                  const overdue = r.due_date && r.due_date < isoDate() && bal > 0 && r.status !== "cancelled";
                  return (
                    <tr key={r.id} className="hover:bg-slate-50">
                      <Td><Link href={`/invoices/${r.id}`} className="font-medium hover:text-brand-700">{r.invoice_no}</Link></Td>
                      <Td>{r.bill_to_name}<div className="text-xs text-slate-500">{r.bill_to_phone}</div></Td>
                      <Td className="text-xs">{fmtDate(r.invoice_date)}{r.due_date && <div className={cn(overdue ? "text-rose-600" : "text-slate-500")}>due {fmtDate(r.due_date)}</div>}</Td>
                      <Td><Badge className={statusMeta(INVOICE_STATUSES, r.status)?.color}>{statusMeta(INVOICE_STATUSES, r.status)?.label}</Badge></Td>
                      <Td className="text-right text-xs">{inr(Number(r.cgst) + Number(r.sgst) + Number(r.igst))}</Td>
                      <Td className="text-right font-medium">{inr(r.total)}</Td>
                      <Td className={cn("text-right", bal > 0 && r.status !== "cancelled" ? "text-rose-600" : "text-slate-400")}>{r.status === "cancelled" ? "—" : inr(bal)}</Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          )}
        </Card>
      )}
    </>
  );
}

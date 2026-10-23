"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowDownLeft, ArrowUpRight, Download, Plus, Trash2, Pencil } from "lucide-react";
import { sb } from "@/lib/supabase/client";
import { EXPENSE_CATEGORIES, PAYMENT_MODES } from "@/lib/constants";
import { downloadCsv, fmtDate, inr, isoDate } from "@/lib/utils";
import { Guard, useAuth } from "@/components/auth";
import { PaymentForm } from "@/components/payment-form";
import { Button, Card, ConfirmButton, Empty, Field, Input, Modal, PageHeader, Select, Spinner, Stat, Table, Tabs, Td, Th } from "@/components/ui";

export default function PaymentsPage() {
  return <Guard module="payments"><Payments /></Guard>;
}

function monthStart() { const d = new Date(); return isoDate(new Date(d.getFullYear(), d.getMonth(), 1)); }

function Payments() {
  const { can } = useAuth();
  const [tab, setTab] = useState("in");
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(isoDate());
  const [mode, setMode] = useState("");
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<{ dir: "in" | "out"; p?: any } | null>(null);
  const [exp, setExp] = useState<any | null>(null);

  async function load() {
    setLoading(true);
    let q;
    if (tab === "exp") {
      q = sb().from("expenses").select("*").gte("expense_date", from).lte("expense_date", to).order("expense_date", { ascending: false });
      if (mode) q = q.eq("mode", mode);
    } else {
      q = sb().from("payments").select("*, contacts(name), suppliers(name), bookings(booking_no, title), invoices(invoice_no)")
        .eq("direction", tab).gte("payment_date", from).lte("payment_date", to).order("payment_date", { ascending: false });
      if (mode) q = q.eq("mode", mode);
    }
    const { data, error } = await q;
    setLoading(false);
    if (error) return toast.error(error.message);
    setRows(data ?? []);
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [tab, from, to, mode]);

  const total = rows.reduce((a, r) => a + Number(r.amount), 0);
  const byMode: Record<string, number> = {};
  rows.forEach((r) => { byMode[r.mode ?? "Other"] = (byMode[r.mode ?? "Other"] ?? 0) + Number(r.amount); });

  return (
    <>
      <PageHeader title="Payments & expenses" subtitle="Customer receipts, supplier payments and office expenses" actions={
        <>
          <Button variant="secondary" onClick={() => downloadCsv(`${tab === "in" ? "receipts" : tab === "out" ? "supplier-payments" : "expenses"}-${from}-to-${to}.csv`,
            tab === "exp"
              ? [["Date", "Category", "Paid to", "Mode", "Amount", "Notes"], ...rows.map((r) => [r.expense_date, r.category, r.paid_to, r.mode, r.amount, r.notes])]
              : [["No.", "Date", tab === "in" ? "Customer" : "Supplier", "Booking", "Invoice", "Mode", "Reference", "Amount"], ...rows.map((r) => [r.payment_no, r.payment_date, tab === "in" ? r.contacts?.name : r.suppliers?.name, r.bookings?.booking_no, r.invoices?.invoice_no, r.mode, r.reference, r.amount])])}>
            <Download className="h-4 w-4" /> Export
          </Button>
          {can("payments", "create") && tab === "in" && <Button onClick={() => setForm({ dir: "in" })}><ArrowDownLeft className="h-4 w-4" /> Receive payment</Button>}
          {can("payments", "create") && tab === "out" && <Button onClick={() => setForm({ dir: "out" })}><ArrowUpRight className="h-4 w-4" /> Pay supplier</Button>}
          {can("payments", "create") && tab === "exp" && <Button onClick={() => setExp({ expense_date: isoDate(), category: EXPENSE_CATEGORIES[0], amount: "", mode: "UPI", paid_to: "", notes: "" })}><Plus className="h-4 w-4" /> Add expense</Button>}
        </>
      } />
      <Tabs value={tab} onChange={setTab} tabs={[{ value: "in", label: "Customer receipts" }, { value: "out", label: "Supplier payments" }, { value: "exp", label: "Office expenses" }]} />
      <Card bodyClass="p-3" className="mb-4">
        <div className="flex flex-wrap items-center gap-2">
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" />
          <span className="text-slate-400">to</span>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" />
          <Select value={mode} onChange={(e) => setMode(e.target.value)} className="w-40"><option value="">All modes</option>{PAYMENT_MODES.map((m) => <option key={m}>{m}</option>)}</Select>
        </div>
      </Card>
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label={tab === "in" ? "Received" : tab === "out" ? "Paid to suppliers" : "Expenses"} value={inr(total)} tone={tab === "in" ? "emerald" : "rose"} sub={`${rows.length} entries`} />
        {Object.entries(byMode).slice(0, 3).map(([m, v]) => <Stat key={m} label={m} value={inr(v)} />)}
      </div>
      {loading ? <Spinner /> : (
        <Card bodyClass="p-0">
          {rows.length === 0 ? <Empty title="Nothing in this period" /> : tab === "exp" ? (
            <Table>
              <thead><tr><Th>Date</Th><Th>Category</Th><Th>Paid to</Th><Th>Mode</Th><Th>Notes</Th><Th className="text-right">Amount</Th><Th /></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <Td className="text-xs">{fmtDate(r.expense_date)}</Td><Td>{r.category}</Td><Td>{r.paid_to}</Td><Td className="text-xs">{r.mode}</Td>
                    <Td className="max-w-xs truncate text-xs">{r.notes}</Td><Td className="text-right font-medium">{inr(r.amount)}</Td>
                    <Td>
                      <div className="flex gap-1">
                        {can("payments", "edit") && <button onClick={() => setExp(r)} className="p-1 text-slate-400 hover:text-slate-700"><Pencil className="h-3.5 w-3.5" /></button>}
                        {can("payments", "delete") && <ConfirmButton size="icon" label="?" onConfirm={async () => { const { error } = await sb().from("expenses").delete().eq("id", r.id); if (error) toast.error(error.message); else load(); }}><Trash2 className="h-3.5 w-3.5" /></ConfirmButton>}
                      </div>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          ) : (
            <Table>
              <thead><tr><Th>No.</Th><Th>Date</Th><Th>{tab === "in" ? "Customer" : "Supplier"}</Th><Th>Booking / invoice</Th><Th>Mode / ref</Th><Th className="text-right">Amount</Th><Th /></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <Td className="text-xs">{r.payment_no}</Td>
                    <Td className="text-xs">{fmtDate(r.payment_date)}</Td>
                    <Td>{tab === "in" ? r.contacts?.name ?? "—" : r.suppliers?.name ?? "—"}</Td>
                    <Td className="text-xs">
                      {r.booking_id ? <Link href={`/bookings/${r.booking_id}`} className="text-brand-700 hover:underline">{r.bookings?.booking_no}</Link> : "—"}
                      {r.invoice_id && <> · <Link href={`/invoices/${r.invoice_id}`} className="text-brand-700 hover:underline">{r.invoices?.invoice_no}</Link></>}
                    </Td>
                    <Td className="text-xs">{r.mode}{r.reference ? ` · ${r.reference}` : ""}</Td>
                    <Td className="text-right font-medium">{inr(r.amount)}</Td>
                    <Td>
                      <div className="flex gap-1">
                        {tab === "in" && <a href={`/share/receipt/${r.id}`} target="_blank" rel="noreferrer" className="p-1 text-xs text-brand-700 hover:underline">Receipt</a>}
                        {can("payments", "edit") && <button onClick={() => setForm({ dir: r.direction, p: r })} className="p-1 text-slate-400 hover:text-slate-700"><Pencil className="h-3.5 w-3.5" /></button>}
                        {can("payments", "delete") && <ConfirmButton size="icon" label="?" onConfirm={async () => { const { error } = await sb().from("payments").delete().eq("id", r.id); if (error) toast.error(error.message); else load(); }}><Trash2 className="h-3.5 w-3.5" /></ConfirmButton>}
                      </div>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      )}
      <PaymentForm open={!!form} onClose={() => setForm(null)} onSaved={load} direction={form?.dir ?? "in"} payment={form?.p} />
      <ExpenseModal e={exp} onClose={() => setExp(null)} onSaved={load} />
    </>
  );
}

function ExpenseModal({ e, onClose, onSaved }: { e: any | null; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState<any>({});
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (e) setF(e); }, [e]);
  if (!e) return null;
  const set = (k: string) => (ev: { target: { value: string } }) => setF({ ...f, [k]: ev.target.value });
  async function save() {
    if (!(Number(f.amount) > 0)) return toast.error("Amount required");
    setBusy(true);
    const payload = { expense_date: f.expense_date, category: f.category, amount: Number(f.amount), paid_to: f.paid_to || null, mode: f.mode, notes: f.notes || null };
    const { error } = f.id ? await sb().from("expenses").update(payload).eq("id", f.id) : await sb().from("expenses").insert(payload);
    setBusy(false);
    if (error) return toast.error(error.message);
    onSaved(); onClose();
  }
  return (
    <Modal open onClose={onClose} title={f.id ? "Edit expense" : "Add expense"} size="sm" footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={busy} onClick={save}>Save</Button></>}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Date"><Input type="date" value={f.expense_date ?? ""} onChange={set("expense_date")} /></Field>
        <Field label="Amount ₹"><Input type="number" value={f.amount ?? ""} onChange={set("amount")} /></Field>
        <Field label="Category"><Select value={f.category} onChange={set("category")}>{EXPENSE_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</Select></Field>
        <Field label="Mode"><Select value={f.mode} onChange={set("mode")}>{PAYMENT_MODES.map((m) => <option key={m}>{m}</option>)}</Select></Field>
        <Field label="Paid to" className="col-span-2"><Input value={f.paid_to ?? ""} onChange={set("paid_to")} /></Field>
        <Field label="Notes" className="col-span-2"><Input value={f.notes ?? ""} onChange={set("notes")} /></Field>
      </div>
    </Modal>
  );
}

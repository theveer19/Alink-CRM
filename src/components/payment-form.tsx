"use client";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { sb } from "@/lib/supabase/client";
import { PAYMENT_MODES } from "@/lib/constants";
import { inr, isoDate } from "@/lib/utils";
import { Button, Field, Input, Modal, Select, Textarea } from "./ui";

type Opt = { id: string; label: string };

export function PaymentForm({ open, onClose, onSaved, direction, bookingId, contactId, invoiceId, supplierId, amount, payment }: {
  open: boolean; onClose: () => void; onSaved: () => void; direction: "in" | "out";
  bookingId?: string | null; contactId?: string | null; invoiceId?: string | null; supplierId?: string | null; amount?: number; payment?: any;
}) {
  const [f, setF] = useState<any>({});
  const [busy, setBusy] = useState(false);
  const [bookings, setBookings] = useState<Opt[]>([]);
  const [invoices, setInvoices] = useState<(Opt & { due: number })[]>([]);
  const [suppliers, setSuppliers] = useState<Opt[]>([]);

  useEffect(() => {
    if (!open) return;
    setF(payment ? { ...payment } : {
      direction, payment_date: isoDate(), amount: amount ? Math.round(amount * 100) / 100 : "", mode: "UPI", reference: "",
      booking_id: bookingId ?? "", contact_id: contactId ?? "", invoice_id: invoiceId ?? "", supplier_id: supplierId ?? "", notes: "",
    });
    const supa = sb();
    supa.from("bookings").select("id, booking_no, title, contact_id").order("created_at", { ascending: false }).limit(300)
      .then(({ data }) => setBookings((data ?? []).map((b) => ({ id: b.id, label: `${b.booking_no} · ${b.title}`, contact_id: b.contact_id } as any))));
    if (direction === "out") supa.from("suppliers").select("id, name").eq("is_active", true).order("name").then(({ data }) => setSuppliers((data ?? []).map((s) => ({ id: s.id, label: s.name }))));
  }, [open, payment, direction, bookingId, contactId, invoiceId, supplierId, amount]);

  useEffect(() => {
    if (!open || direction !== "in") return;
    let q = sb().from("invoices").select("id, invoice_no, total, amount_paid, bill_to_name").neq("status", "cancelled").order("invoice_date", { ascending: false }).limit(200);
    if (f.booking_id) q = q.eq("booking_id", f.booking_id);
    q.then(({ data }) => setInvoices((data ?? []).map((i) => ({ id: i.id, label: `${i.invoice_no} · ${i.bill_to_name}`, due: Number(i.total) - Number(i.amount_paid) }))));
  }, [open, direction, f.booking_id]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!(Number(f.amount) > 0)) return toast.error("Enter an amount");
    setBusy(true);
    let contact = f.contact_id || null;
    if (!contact && f.booking_id) contact = (bookings.find((b) => b.id === f.booking_id) as any)?.contact_id ?? null;
    const payload = {
      direction: f.direction, payment_date: f.payment_date, amount: Number(f.amount), mode: f.mode, reference: f.reference || null,
      booking_id: f.booking_id || null, contact_id: f.direction === "in" ? contact : null, invoice_id: f.direction === "in" ? f.invoice_id || null : null,
      supplier_id: f.direction === "out" ? f.supplier_id || null : null, notes: f.notes || null,
    };
    const { error } = payment ? await sb().from("payments").update(payload).eq("id", payment.id) : await sb().from("payments").insert(payload);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(f.direction === "in" ? "Receipt saved" : "Supplier payment saved");
    onSaved();
    onClose();
  }

  const set = (k: string) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  return (
    <Modal open={open} onClose={onClose} title={f.direction === "out" ? "Pay supplier" : "Receive payment"} size="md"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button form="pay-form" loading={busy}>Save</Button></>}>
      <form id="pay-form" onSubmit={save} className="grid grid-cols-2 gap-3">
        <Field label="Date"><Input type="date" value={f.payment_date ?? ""} onChange={set("payment_date")} required /></Field>
        <Field label="Amount ₹" required><Input type="number" step="0.01" value={f.amount ?? ""} onChange={set("amount")} autoFocus /></Field>
        <Field label="Mode"><Select value={f.mode} onChange={set("mode")}>{PAYMENT_MODES.map((m) => <option key={m}>{m}</option>)}</Select></Field>
        <Field label="Reference / UTR"><Input value={f.reference ?? ""} onChange={set("reference")} /></Field>
        <Field label="Booking" className="col-span-2">
          <Select value={f.booking_id ?? ""} onChange={set("booking_id")}><option value="">—</option>{bookings.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}</Select>
        </Field>
        {f.direction === "in" ? (
          <Field label="Against invoice" className="col-span-2">
            <Select value={f.invoice_id ?? ""} onChange={(e) => { const inv = invoices.find((i) => i.id === e.target.value); setF({ ...f, invoice_id: e.target.value, amount: f.amount || (inv ? inv.due : "") }); }}>
              <option value="">— (advance / not invoiced)</option>
              {invoices.map((i) => <option key={i.id} value={i.id}>{i.label} · due {inr(i.due)}</option>)}
            </Select>
          </Field>
        ) : (
          <Field label="Supplier" className="col-span-2">
            <Select value={f.supplier_id ?? ""} onChange={set("supplier_id")}><option value="">—</option>{suppliers.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</Select>
          </Field>
        )}
        <Field label="Notes" className="col-span-2"><Textarea rows={2} value={f.notes ?? ""} onChange={set("notes")} /></Field>
      </form>
    </Modal>
  );
}

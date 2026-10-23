"use client";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { sb } from "@/lib/supabase/client";
import { BOOKING_STATUSES } from "@/lib/constants";
import type { Booking } from "@/lib/types";
import { useDebounced } from "@/lib/hooks";
import { useAuth } from "./auth";
import { Button, Field, Input, Modal, Select, Textarea } from "./ui";

export function BookingForm({ open, onClose, booking, onSaved }: { open: boolean; onClose: () => void; booking?: Booking | null; onSaved: (id: string) => void }) {
  const { team } = useAuth();
  const [f, setF] = useState<any>({});
  const [busy, setBusy] = useState(false);
  const [cq, setCq] = useState("");
  const dcq = useDebounced(cq);
  const [contacts, setContacts] = useState<{ id: string; name: string; phone: string | null }[]>([]);

  useEffect(() => {
    if (!open) return;
    setF(booking ? { ...booking } : { title: "", destination: "", start_date: "", end_date: "", adults: 2, children: 0, infants: 0, status: "confirmed", sell_amount: 0, notes: "", contact_id: "" });
    setCq("");
  }, [open, booking]);

  useEffect(() => {
    if (!open) return;
    const t = dcq.trim().replace(/[%,()]/g, "");
    let q = sb().from("contacts").select("id, name, phone").order("created_at", { ascending: false }).limit(30);
    if (t) q = q.or(`name.ilike.%${t}%,phone.ilike.%${t}%`);
    if (f.contact_id && !t) q = sb().from("contacts").select("id, name, phone").eq("id", f.contact_id);
    q.then(({ data }) => setContacts(data ?? []));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dcq, open]);

  const set = (k: string) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const payload = {
      title: f.title, destination: f.destination || null, start_date: f.start_date || null, end_date: f.end_date || null,
      adults: Number(f.adults || 0), children: Number(f.children || 0), infants: Number(f.infants || 0), status: f.status,
      sell_amount: Number(f.sell_amount || 0), tax_amount: Number(f.tax_amount || 0), notes: f.notes || null, contact_id: f.contact_id || null, handled_by: f.handled_by || null,
    };
    const res = booking ? await sb().from("bookings").update(payload).eq("id", booking.id).select("id").single() : await sb().from("bookings").insert(payload).select("id").single();
    setBusy(false);
    if (res.error) return toast.error(res.error.message);
    toast.success("Booking saved");
    onSaved(res.data.id);
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title={booking ? `Edit ${booking.booking_no}` : "New booking"} size="lg"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button form="bk-form" loading={busy}>Save</Button></>}>
      <form id="bk-form" onSubmit={save} className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Field label="Trip title" className="col-span-2" required><Input required value={f.title ?? ""} onChange={set("title")} placeholder="Kashmir 5N/6D – Sharma family" /></Field>
        <Field label="Destination"><Input value={f.destination ?? ""} onChange={set("destination")} /></Field>
        <Field label="Status"><Select value={f.status} onChange={set("status")}>{BOOKING_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}</Select></Field>
        <Field label="Customer search"><Input value={cq} onChange={(e) => setCq(e.target.value)} placeholder="name / phone" /></Field>
        <Field label="Customer" className="col-span-2">
          <Select value={f.contact_id ?? ""} onChange={set("contact_id")}><option value="">—</option>{contacts.map((c) => <option key={c.id} value={c.id}>{c.name} {c.phone ? `· ${c.phone}` : ""}</option>)}</Select>
        </Field>
        <Field label="Handled by"><Select value={f.handled_by ?? ""} onChange={set("handled_by")}><option value="">—</option>{team.map((t) => <option key={t.id} value={t.id}>{t.full_name}</option>)}</Select></Field>
        <Field label="Start date"><Input type="date" value={f.start_date ?? ""} onChange={set("start_date")} /></Field>
        <Field label="End date"><Input type="date" value={f.end_date ?? ""} onChange={set("end_date")} /></Field>
        <Field label="Adults"><Input type="number" value={f.adults ?? 0} onChange={set("adults")} /></Field>
        <Field label="Children"><Input type="number" value={f.children ?? 0} onChange={set("children")} /></Field>
        <Field label="Package price to customer ₹" hint="Incl. taxes"><Input type="number" value={f.sell_amount ?? 0} onChange={set("sell_amount")} /></Field>
        <Field label="GST + TCS included ₹" hint="Excluded from profit"><Input type="number" value={f.tax_amount ?? 0} onChange={set("tax_amount")} /></Field>
        <Field label="Notes" className="col-span-2 sm:col-span-4"><Textarea rows={2} value={f.notes ?? ""} onChange={set("notes")} /></Field>
      </form>
    </Modal>
  );
}

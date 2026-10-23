"use client";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { sb } from "@/lib/supabase/client";
import { HOTEL_CATEGORIES, SEGMENTS } from "@/lib/constants";
import type { Contact } from "@/lib/types";
import { Button, Field, Input, Modal, Select, Textarea } from "./ui";

const blank = {
  name: "", phone: "", alt_phone: "", email: "", city: "", state: "", address: "", customer_type: "B2C", segment: "New", tags: "",
  dob: "", anniversary: "", gender: "", passport_no: "", passport_expiry: "", gstin: "", company_name: "",
  pref_hotel_category: "", pref_meal: "", pref_budget: "", pref_notes: "", notes: "",
};

export function ContactForm({ open, onClose, contact, onSaved }: { open: boolean; onClose: () => void; contact?: Contact | null; onSaved: (c: Contact) => void }) {
  const [f, setF] = useState(blank);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (contact) {
      const o: any = { ...blank };
      Object.keys(blank).forEach((k) => { const v = (contact as any)[k]; o[k] = v == null ? "" : Array.isArray(v) ? v.join(", ") : String(v); });
      setF(o);
    } else setF(blank);
  }, [open, contact]);

  const set = (k: keyof typeof blank) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const payload: Record<string, unknown> = {};
    Object.entries(f).forEach(([k, v]) => { payload[k] = v === "" ? null : v; });
    payload.name = f.name.trim();
    payload.customer_type = f.customer_type || "B2C";
    payload.segment = f.segment || "New";
    payload.tags = f.tags.split(",").map((t) => t.trim()).filter(Boolean);
    const q = contact
      ? sb().from("contacts").update(payload).eq("id", contact.id).select().single()
      : sb().from("contacts").insert(payload).select().single();
    const { data, error } = await q;
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Saved");
    onSaved(data as Contact);
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title={contact ? "Edit customer" : "New customer"} size="lg"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button form="contact-form" loading={busy}>Save</Button></>}>
      <form id="contact-form" onSubmit={save} className="space-y-5">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Field label="Name" required><Input required value={f.name} onChange={set("name")} /></Field>
          <Field label="Phone"><Input value={f.phone} onChange={set("phone")} /></Field>
          <Field label="Alternate phone"><Input value={f.alt_phone} onChange={set("alt_phone")} /></Field>
          <Field label="Email"><Input type="email" value={f.email} onChange={set("email")} /></Field>
          <Field label="City"><Input value={f.city} onChange={set("city")} /></Field>
          <Field label="State" hint="Used for CGST/SGST vs IGST"><Input value={f.state} onChange={set("state")} /></Field>
          <Field label="Address" className="col-span-2 sm:col-span-3"><Input value={f.address} onChange={set("address")} /></Field>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Field label="Customer type">
            <Select value={f.customer_type} onChange={set("customer_type")}><option>B2C</option><option>B2B</option><option>Corporate</option></Select>
          </Field>
          <Field label="Segment"><Select value={f.segment} onChange={set("segment")}>{SEGMENTS.map((s) => <option key={s}>{s}</option>)}</Select></Field>
          <Field label="Tags" hint="comma separated" className="col-span-2"><Input value={f.tags} onChange={set("tags")} placeholder="honeymoon, family, adventure" /></Field>
          <Field label="Date of birth"><Input type="date" value={f.dob} onChange={set("dob")} /></Field>
          <Field label="Anniversary"><Input type="date" value={f.anniversary} onChange={set("anniversary")} /></Field>
          <Field label="Gender"><Select value={f.gender} onChange={set("gender")}><option value="">—</option><option>Male</option><option>Female</option><option>Other</option></Select></Field>
          <Field label="Company (B2B)"><Input value={f.company_name} onChange={set("company_name")} /></Field>
          <Field label="GSTIN"><Input value={f.gstin} onChange={set("gstin")} /></Field>
          <Field label="Passport no."><Input value={f.passport_no} onChange={set("passport_no")} /></Field>
          <Field label="Passport expiry"><Input type="date" value={f.passport_expiry} onChange={set("passport_expiry")} /></Field>
        </div>
        <div>
          <p className="mb-2 text-xs font-semibold uppercase text-slate-400">Travel preferences</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Field label="Hotel category"><Select value={f.pref_hotel_category} onChange={set("pref_hotel_category")}><option value="">—</option>{HOTEL_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</Select></Field>
            <Field label="Meal preference"><Select value={f.pref_meal} onChange={set("pref_meal")}><option value="">—</option><option>Veg</option><option>Non-veg</option><option>Jain</option><option>Vegan</option></Select></Field>
            <Field label="Usual budget"><Input value={f.pref_budget} onChange={set("pref_budget")} placeholder="₹50k–1L" /></Field>
            <Field label="Preference notes" className="col-span-2 sm:col-span-3"><Input value={f.pref_notes} onChange={set("pref_notes")} placeholder="Window seat, ground floor room, travels with parents…" /></Field>
          </div>
        </div>
        <Field label="Internal notes"><Textarea value={f.notes} onChange={set("notes")} /></Field>
      </form>
    </Modal>
  );
}

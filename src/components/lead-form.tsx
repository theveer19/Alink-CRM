"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { sb } from "@/lib/supabase/client";
import { LEAD_STATUSES, PRIORITIES } from "@/lib/constants";
import type { Lead } from "@/lib/types";
import { useAuth } from "./auth";
import { Button, Field, Input, Modal, Select, Textarea } from "./ui";
import { useDebounced } from "@/lib/hooks";

const empty = {
  name: "", phone: "", email: "", city: "", source: "Manual", campaign: "", status: "new", priority: "warm",
  destination: "", travel_date: "", return_date: "", nights: "", adults: "2", children: "0", infants: "0",
  budget: "", requirements: "", assigned_to: "",
};

export function LeadForm({ open, onClose, lead, onSaved, contactId }: {
  open: boolean; onClose: () => void; lead?: Lead | null; onSaved: (l: Lead) => void; contactId?: string;
}) {
  const { sources, team, can, userId } = useAuth();
  const [f, setF] = useState<typeof empty>(empty);
  const [busy, setBusy] = useState(false);
  const [dupes, setDupes] = useState<{ id: string; name: string; lead_no: string; status: string }[]>([]);
  const phone = useDebounced(f.phone, 400);

  useEffect(() => {
    if (!open) return;
    if (lead) {
      setF({
        ...empty,
        ...Object.fromEntries(Object.entries(lead).map(([k, v]) => [k, v == null ? "" : String(v)])),
      } as typeof empty);
    } else {
      setF({ ...empty, assigned_to: "" });
      if (contactId) {
        sb().from("contacts").select("name, phone, email, city").eq("id", contactId).single().then(({ data }) => {
          if (data) setF((x) => ({ ...x, name: data.name, phone: data.phone ?? "", email: data.email ?? "", city: data.city ?? "", source: "Repeat Customer" }));
        });
      }
    }
    setDupes([]);
  }, [open, lead, contactId]);

  useEffect(() => {
    const d = phone.replace(/\D/g, "").slice(-10);
    if (!open || d.length < 10) { setDupes([]); return; }
    sb().from("leads").select("id, name, lead_no, status").ilike("phone", `%${d}%`).neq("id", lead?.id ?? "00000000-0000-0000-0000-000000000000").limit(5)
      .then(({ data }) => setDupes(data ?? []));
  }, [phone, open, lead?.id]);

  // auto nights from dates
  useEffect(() => {
    if (f.travel_date && f.return_date) {
      const n = Math.round((new Date(f.return_date).getTime() - new Date(f.travel_date).getTime()) / 86400000);
      if (n >= 0 && String(n) !== f.nights) setF((x) => ({ ...x, nights: String(n) }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [f.travel_date, f.return_date]);

  const set = (k: keyof typeof empty) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!f.name.trim()) return toast.error("Name is required");
    if (!f.phone.trim() && !f.email.trim()) return toast.error("Add a phone number or email");
    setBusy(true);
    const payload: Record<string, unknown> = {
      name: f.name.trim(), phone: f.phone.trim() || null, email: f.email.trim() || null, city: f.city || null,
      source: f.source, campaign: f.campaign || null, status: f.status, priority: f.priority,
      destination: f.destination || null, travel_date: f.travel_date || null, return_date: f.return_date || null,
      nights: f.nights ? Number(f.nights) : null, adults: Number(f.adults || 0), children: Number(f.children || 0),
      infants: Number(f.infants || 0), budget: f.budget ? Number(f.budget) : null, requirements: f.requirements || null,
    };
    if (f.assigned_to) payload.assigned_to = f.assigned_to;
    else if (!lead) payload.assigned_to = null;
    if (contactId && !lead) payload.contact_id = contactId;
    const q = lead
      ? sb().from("leads").update(payload).eq("id", lead.id).select().single()
      : sb().from("leads").insert(payload).select().single();
    const { data, error } = await q;
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(lead ? "Lead updated" : `Lead ${data.lead_no} created`);
    onSaved(data as Lead);
    onClose();
  }

  const canAssign = can("leads", "view_all");

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={lead ? `Edit lead ${lead.lead_no}` : "New lead"}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button form="lead-form" loading={busy}>{lead ? "Save changes" : "Create lead"}</Button>
        </>
      }
    >
      <form id="lead-form" onSubmit={save} className="space-y-5">
        <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field label="Customer name" required><Input value={f.name} onChange={set("name")} autoFocus /></Field>
          <Field label="Phone / WhatsApp"><Input value={f.phone} onChange={set("phone")} placeholder="98xxxxxxxx" /></Field>
          <Field label="Email"><Input type="email" value={f.email} onChange={set("email")} /></Field>
          <Field label="City"><Input value={f.city} onChange={set("city")} /></Field>
          <Field label="Source">
            <Select value={f.source} onChange={set("source")}>
              {[...new Set([f.source, ...sources])].filter(Boolean).map((s) => <option key={s}>{s}</option>)}
            </Select>
          </Field>
          <Field label="Campaign / Ad"><Input value={f.campaign} onChange={set("campaign")} /></Field>
        </section>
        {dupes.length > 0 && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
            <b>Possible duplicate:</b> this number already has{" "}
            {dupes.map((d, i) => (
              <span key={d.id}>
                {i > 0 && ", "}
                <Link href={`/leads/${d.id}`} className="font-semibold underline" target="_blank">{d.lead_no} {d.name}</Link> ({d.status})
              </span>
            ))}
            . You can still save — the new lead will be linked to the same customer.
          </div>
        )}
        <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Field label="Destination" className="col-span-2"><Input value={f.destination} onChange={set("destination")} placeholder="Kashmir, Goa, Dubai…" /></Field>
          <Field label="Travel date"><Input type="date" value={f.travel_date} onChange={set("travel_date")} /></Field>
          <Field label="Return date"><Input type="date" value={f.return_date} onChange={set("return_date")} /></Field>
          <Field label="Nights"><Input type="number" min={0} value={f.nights} onChange={set("nights")} /></Field>
          <Field label="Adults"><Input type="number" min={0} value={f.adults} onChange={set("adults")} /></Field>
          <Field label="Children"><Input type="number" min={0} value={f.children} onChange={set("children")} /></Field>
          <Field label="Infants"><Input type="number" min={0} value={f.infants} onChange={set("infants")} /></Field>
          <Field label="Budget (₹)"><Input type="number" min={0} value={f.budget} onChange={set("budget")} /></Field>
          <Field label="Status">
            <Select value={f.status} onChange={set("status")}>
              {LEAD_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </Select>
          </Field>
          <Field label="Priority">
            <Select value={f.priority} onChange={set("priority")}>
              {PRIORITIES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </Select>
          </Field>
          <Field label="Assigned to">
            <Select value={f.assigned_to} onChange={set("assigned_to")} disabled={!canAssign && !!lead}>
              <option value="">{lead ? "Unassigned" : "Auto (me / round-robin)"}</option>
              {team.filter((t) => t.is_active).map((t) => <option key={t.id} value={t.id}>{t.full_name}{t.id === userId ? " (me)" : ""}</option>)}
            </Select>
          </Field>
        </section>
        <Field label="Requirements / notes">
          <Textarea value={f.requirements} onChange={set("requirements")} placeholder="Hotel category, meal plan, special requests…" />
        </Field>
      </form>
    </Modal>
  );
}

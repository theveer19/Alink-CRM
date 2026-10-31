"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { MessagesSquare, Send } from "lucide-react";
import { sb } from "@/lib/supabase/client";
import { fmtDate } from "@/lib/utils";
import { Guard, useAuth } from "@/components/auth";
import { Button, Card, Field, Input, Textarea } from "@/components/ui";

export default function GroupQueryPage() {
  return <Guard module="leads" action="create"><GroupQuery /></Guard>;
}

const blank = { name: "", phone: "", category: "", destination: "", pickup: "", drop: "", date: "", days: "", persons: "", vehicle: "", note: "", other: "" };

/** Portal "Group Query Request" — saved as a lead (source: Group Query) so it follows the normal follow-up flow. */
function GroupQuery() {
  const { userId } = useAuth();
  const [f, setF] = useState(blank);
  const [busy, setBusy] = useState(false);
  const [recent, setRecent] = useState<any[]>([]);
  const set = (k: keyof typeof blank) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  async function load() {
    const { data } = await sb().from("leads").select("id, lead_no, name, destination, travel_date, adults, status, created_at").eq("source", "Group Query").order("created_at", { ascending: false }).limit(15);
    setRecent(data ?? []);
  }
  useEffect(() => { load(); }, []);

  async function send() {
    if (!f.destination.trim() || !f.date || !(Number(f.days) >= 1) || !(Number(f.persons) >= 1)) return toast.error("Destination, date of travel, no. of days and persons are required");
    setBusy(true);
    const supa = sb();
    await supa.from("lead_sources").upsert({ name: "Group Query", is_active: true }, { onConflict: "name", ignoreDuplicates: true });
    const req = [
      f.category && `Package category: ${f.category}`, f.pickup && `Pickup: ${f.pickup}`, f.drop && `Drop: ${f.drop}`,
      f.vehicle && `Vehicle: ${f.vehicle}`, f.note && `Note: ${f.note}`, f.other && `Other: ${f.other}`,
    ].filter(Boolean).join("\n");
    const { error } = await supa.from("leads").insert({
      name: f.name.trim() || `Group – ${f.destination.trim()}`, phone: f.phone.trim() || null, source: "Group Query", destination: f.destination.trim(),
      travel_date: f.date, nights: Math.max(0, Number(f.days) - 1), adults: Number(f.persons), requirements: req || null, priority: "hot", assigned_to: userId,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Group query saved as a lead");
    setF(blank);
    load();
  }

  return (
    <div className="grid gap-5 xl:grid-cols-3">
      <Card className="xl:col-span-2" title={<span className="flex items-center gap-2 uppercase"><MessagesSquare className="h-4 w-4" /> Group Query Request</span>}>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Contact name"><Input value={f.name} onChange={set("name")} placeholder="Group leader / company" /></Field>
          <Field label="Phone / WhatsApp"><Input value={f.phone} onChange={set("phone")} /></Field>
          <Field label="Package Category"><Input value={f.category} onChange={set("category")} placeholder="Enter Package Category" /></Field>
          <Field label="Destination" required><Input value={f.destination} onChange={set("destination")} placeholder="Enter Destination" /></Field>
          <Field label="Pickup"><Input value={f.pickup} onChange={set("pickup")} placeholder="Pickup Location" /></Field>
          <Field label="Drop"><Input value={f.drop} onChange={set("drop")} placeholder="Drop Location" /></Field>
          <Field label="Date of Travel" required><Input type="date" value={f.date} onChange={set("date")} /></Field>
          <Field label="No. of Days" required><Input type="number" min={1} value={f.days} onChange={set("days")} placeholder="Min 1" /></Field>
          <Field label="No. of Persons" required><Input type="number" min={1} value={f.persons} onChange={set("persons")} placeholder="Min 1" /></Field>
          <Field label="Vehicle"><Input value={f.vehicle} onChange={set("vehicle")} placeholder="e.g. Sedan, Innova, Tempo Traveller" /></Field>
          <Field label="Note" className="sm:col-span-2"><Textarea rows={2} value={f.note} onChange={set("note")} placeholder="Special requests or notes (optional)" /></Field>
          <Field label="Other Information" className="sm:col-span-2"><Textarea rows={2} value={f.other} onChange={set("other")} placeholder="Any additional information (optional)" /></Field>
        </div>
        <Button className="mt-4" loading={busy} onClick={send}><Send className="h-4 w-4" /> Send Query</Button>
      </Card>
      <Card title="Recent group queries" bodyClass="p-0">
        <ul className="divide-y divide-slate-100">
          {recent.map((l) => (
            <li key={l.id} className="px-4 py-2.5 text-sm">
              <Link href={`/leads/${l.id}`} className="font-medium hover:text-brand-700">{l.name}</Link>
              <p className="text-xs text-slate-500">{l.lead_no} · {l.destination} · {l.travel_date ? fmtDate(l.travel_date) : ""} · {l.adults} pax · {l.status}</p>
            </li>
          ))}
          {!recent.length && <li className="px-4 py-6 text-center text-sm text-slate-400">No group queries yet</li>}
        </ul>
      </Card>
    </div>
  );
}

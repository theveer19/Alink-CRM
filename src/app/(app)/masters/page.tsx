"use client";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { BedDouble, Pencil, Plus, Trash2 } from "lucide-react";
import { sb } from "@/lib/supabase/client";
import { HOTEL_CATEGORIES, MEAL_PLANS, TRANSFER_TYPES } from "@/lib/constants";
import { fmtDate, inr } from "@/lib/utils";
import { Guard, useAuth } from "@/components/auth";
import { CrudTable } from "@/components/crud-table";
import { Button, ConfirmButton, Field, Input, Modal, PageHeader, Select, Spinner, Table, Tabs, Td, Th } from "@/components/ui";

export default function MastersPage() {
  return <Guard module="masters"><Suspense fallback={<Spinner />}><Masters /></Suspense></Guard>;
}

const SUPPLIER_TYPES = ["hotel", "transport", "airline", "activity", "dmc", "visa", "insurance", "other"].map((v) => ({ value: v, label: v.toUpperCase() === "DMC" ? "DMC" : v[0].toUpperCase() + v.slice(1) }));

function Masters() {
  const params = useSearchParams();
  const [tab, setTab] = useState(params.get("tab") ?? "destinations");
  const [dests, setDests] = useState<{ value: string; label: string }[]>([]);
  const [sups, setSups] = useState<{ value: string; label: string; type: string }[]>([]);
  const supOf = (...types: string[]) => sups.filter((x) => types.includes(x.type)).map(({ value, label }) => ({ value, label }));
  const [rateHotel, setRateHotel] = useState<any | null>(null);

  useEffect(() => {
    sb().from("destinations").select("id, name").order("name").then(({ data }) => setDests((data ?? []).map((d) => ({ value: d.id, label: d.name }))));
    sb().from("suppliers").select("id, name, supplier_type").order("name").then(({ data }) => setSups((data ?? []).map((d) => ({ value: d.id, label: d.name, type: d.supplier_type }))));
  }, [tab]);

  return (
    <>
      <PageHeader title="Masters" subtitle="Your rate sheets and reusable data — the itinerary builder calculates costs from these" />
      <Tabs value={tab} onChange={setTab} tabs={[
        { value: "destinations", label: "Destinations" }, { value: "hotels", label: "Hotels & rates" }, { value: "suppliers", label: "Suppliers" },
        { value: "transfers", label: "Transfers & sightseeing (day plans)" }, { value: "activities", label: "Activities / tickets" },
        { value: "inclusions", label: "Inclusions / exclusions" },
        { value: "templates", label: "Text & message templates" }, { value: "sources", label: "Lead sources" },
      ]} />

      {tab === "destinations" && (
        <CrudTable table="destinations" title="Destinations" searchKeys={["name", "state", "country"]} fields={[
          { key: "name", label: "Name", required: true, list: true },
          { key: "state", label: "State / region", list: true },
          { key: "country", label: "Country", list: true, default: "India" },
          { key: "image_url", label: "Image URL", wide: true },
          { key: "description", label: "Default day description", type: "textarea", list: true },
          { key: "is_active", label: "Active", type: "bool", list: true },
        ]} />
      )}

      {tab === "hotels" && (
        <CrudTable table="hotels" title="Hotels" searchKeys={["name", "address"]} fields={[
          { key: "name", label: "Hotel name", required: true, list: true },
          { key: "destination_id", label: "Destination", type: "select", options: dests, list: true },
          { key: "category", label: "Category", type: "select", options: HOTEL_CATEGORIES.map((c) => ({ value: c, label: c })), list: true },
          { key: "supplier_id", label: "Supplier / contracting party", type: "select", options: supOf("hotel", "dmc") },
          { key: "phone", label: "Phone", list: true },
          { key: "email", label: "Email" },
          { key: "address", label: "Address", wide: true },
          { key: "check_in_time", label: "Check-in time", default: "12:00 PM" },
          { key: "check_out_time", label: "Check-out time", default: "11:00 AM" },
          { key: "notes", label: "Notes", type: "textarea" },
          { key: "is_active", label: "Active", type: "bool", list: true },
        ]} rowAction={(r) => (
          <Button size="sm" variant="secondary" onClick={() => setRateHotel(r)}><BedDouble className="h-3.5 w-3.5" /> Rates</Button>
        )} />
      )}

      {tab === "suppliers" && (
        <CrudTable table="suppliers" title="Suppliers" searchKeys={["name", "contact_person", "phone", "city"]} fields={[
          { key: "name", label: "Name", required: true, list: true },
          { key: "supplier_type", label: "Type", type: "select", options: SUPPLIER_TYPES, required: true, list: true, default: "hotel" },
          { key: "contact_person", label: "Contact person", list: true },
          { key: "phone", label: "Phone", list: true },
          { key: "email", label: "Email" },
          { key: "city", label: "City", list: true },
          { key: "gstin", label: "GSTIN" },
          { key: "address", label: "Address", wide: true },
          { key: "bank_details", label: "Bank / UPI details", type: "textarea" },
          { key: "notes", label: "Notes", type: "textarea" },
          { key: "is_active", label: "Active", type: "bool", list: true },
        ]} />
      )}

      {tab === "activities" && (
        <CrudTable table="activities" title="Activities" searchKeys={["name", "description"]} fields={[
          { key: "name", label: "Name", required: true, list: true },
          { key: "destination_id", label: "Destination", type: "select", options: dests, list: true },
          { key: "supplier_id", label: "Supplier", type: "select", options: supOf("activity", "dmc", "other") },
          { key: "duration", label: "Duration", list: true },
          { key: "cost_adult", label: "Cost / adult", type: "money", list: true },
          { key: "cost_child", label: "Cost / child", type: "money", list: true },
          { key: "description", label: "Description", type: "textarea" },
          { key: "is_active", label: "Active", type: "bool", list: true },
        ]} />
      )}

      {tab === "transfers" && (
        <>
          <p className="mb-3 rounded-lg bg-slate-100 p-3 text-xs text-slate-600">
            Each row is one <b>day plan</b>: where the day starts, where the guest sleeps that night, what they see (description shown on the itinerary)
            and the cab cost for each vehicle type. In the itinerary you just pick the plan for each day — title, details, night stay and cab cost fill in automatically.
          </p>
          <CrudTable table="transfers" title="Day plans" order="sort" searchKeys={["name", "description"]} fields={[
            { key: "name", label: "Day plan / route name", required: true, list: true, wide: true },
            { key: "transfer_type", label: "Type", type: "select", options: TRANSFER_TYPES.map((t) => ({ value: t.value, label: t.label })), required: true, list: true, default: "sightseeing" },
            { key: "destination_id", label: "Starts from (city)", type: "select", options: dests, list: true },
            { key: "to_destination_id", label: "Night stay at (city)", type: "select", options: dests, list: true },
            { key: "rate_sedan", label: "Sedan ₹", type: "money", list: true },
            { key: "rate_suv", label: "SUV ₹", type: "money", list: true },
            { key: "rate_crysta", label: "Innova Crysta ₹", type: "money", list: true },
            { key: "supplier_id", label: "Vehicle supplier", type: "select", options: supOf("transport") },
            { key: "description", label: "Day details shown on the itinerary", type: "textarea" },
            { key: "sort", label: "Sort order", type: "number" },
            { key: "is_active", label: "Active", type: "bool", list: true },
          ]} />
          {supOf("transport").length === 0 && <p className="mt-2 text-xs text-amber-700">Tip: add your cab operators in Suppliers with type &quot;Transport&quot; — only they appear as vehicle suppliers here.</p>}
        </>
      )}

      {tab === "inclusions" && (
        <CrudTable table="inclusion_items" title="Inclusions & exclusions" order="sort" searchKeys={["title"]} fields={[
          { key: "kind", label: "Type", type: "select", required: true, list: true, default: "inclusion", options: [{ value: "inclusion", label: "✓ Inclusion" }, { value: "exclusion", label: "✗ Exclusion" }] },
          { key: "title", label: "Text", required: true, list: true, wide: true },
          { key: "destination_id", label: "Only for destination (blank = all trips)", type: "select", options: dests, list: true },
          { key: "is_default", label: "Ticked by default", type: "bool", list: true },
          { key: "cost_adult", label: "Paid add-on: cost / adult ₹", type: "money", list: true },
          { key: "cost_child", label: "Cost / child ₹", type: "money" },
          { key: "sort", label: "Sort order", type: "number" },
          { key: "is_active", label: "Active", type: "bool", list: true },
        ]} />
      )}

      {tab === "templates" && (
        <CrudTable table="text_templates" title="Templates" order="category" searchKeys={["title", "body"]} fields={[
          { key: "category", label: "Type", type: "select", required: true, list: true, default: "whatsapp", options: [
            { value: "inclusion", label: "Inclusions" }, { value: "exclusion", label: "Exclusions" }, { value: "terms", label: "Terms" },
            { value: "cancellation", label: "Cancellation policy" }, { value: "notes", label: "Notes" }, { value: "whatsapp", label: "WhatsApp message" }, { value: "email", label: "Email message" },
          ] },
          { key: "title", label: "Title", required: true, list: true },
          { key: "body", label: "Text — variables: {name} {company} {user} {destination} {link} {amount} {booking}", type: "textarea", required: true, list: true },
        ]} />
      )}

      {tab === "sources" && (
        <CrudTable table="lead_sources" title="Lead sources" fields={[
          { key: "name", label: "Source", required: true, list: true },
          { key: "is_active", label: "Active", type: "bool", list: true },
        ]} />
      )}

      <HotelRates hotel={rateHotel} onClose={() => setRateHotel(null)} />
    </>
  );
}

function HotelRates({ hotel, onClose }: { hotel: any | null; onClose: () => void }) {
  const { can } = useAuth();
  const [rows, setRows] = useState<any[]>([]);
  const [edit, setEdit] = useState<any | null>(null);
  async function load() {
    if (!hotel) return;
    const { data } = await sb().from("hotel_rates").select("*").eq("hotel_id", hotel.id).order("room_type").order("meal_plan").order("valid_from", { nullsFirst: true });
    setRows(data ?? []);
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [hotel]);
  if (!hotel) return null;

  async function save() {
    const p = {
      hotel_id: hotel.id, room_type: edit.room_type || "Deluxe", meal_plan: edit.meal_plan || "CP", season: edit.season || null,
      valid_from: edit.valid_from || null, valid_to: edit.valid_to || null, cost_per_night: Number(edit.cost_per_night || 0),
      extra_adult: Number(edit.extra_adult || 0), child_with_bed: Number(edit.child_with_bed || 0), child_without_bed: Number(edit.child_without_bed || 0),
    };
    if ((p.valid_from && !p.valid_to) || (!p.valid_from && p.valid_to)) return toast.error("Give both season dates, or leave both empty for an all-year rate");
    const { error } = edit.id ? await sb().from("hotel_rates").update(p).eq("id", edit.id) : await sb().from("hotel_rates").insert(p);
    if (error) return toast.error(error.message);
    setEdit(null);
    load();
  }
  const set = (k: string) => (e: { target: { value: string } }) => setEdit({ ...edit, [k]: e.target.value });

  return (
    <Modal open onClose={onClose} title={`Rates — ${hotel.name}`} size="xl"
      footer={can("masters", "create") && !edit ? <Button onClick={() => setEdit({ room_type: "Deluxe", meal_plan: "CP" })}><Plus className="h-4 w-4" /> Add rate</Button> : undefined}>
      <p className="mb-3 text-xs text-slate-500">Rate per room per night (double occupancy). Add season rates with dates; a rate without dates is used when no season matches.</p>
      {edit && (
        <div className="mb-4 grid grid-cols-2 gap-3 rounded-xl border border-brand-200 bg-brand-50/40 p-3 sm:grid-cols-5">
          <Field label="Room type"><Input value={edit.room_type ?? ""} onChange={set("room_type")} /></Field>
          <Field label="Meal plan"><Select value={edit.meal_plan} onChange={set("meal_plan")}>{MEAL_PLANS.map((m) => <option key={m.value} value={m.value}>{m.value}</option>)}</Select></Field>
          <Field label="Season name"><Input value={edit.season ?? ""} onChange={set("season")} placeholder="Peak / Xmas" /></Field>
          <Field label="Valid from"><Input type="date" value={edit.valid_from ?? ""} onChange={set("valid_from")} /></Field>
          <Field label="Valid to"><Input type="date" value={edit.valid_to ?? ""} onChange={set("valid_to")} /></Field>
          <Field label="Room / night ₹"><Input type="number" value={edit.cost_per_night ?? ""} onChange={set("cost_per_night")} /></Field>
          <Field label="Extra adult ₹"><Input type="number" value={edit.extra_adult ?? ""} onChange={set("extra_adult")} /></Field>
          <Field label="Child w/ bed ₹"><Input type="number" value={edit.child_with_bed ?? ""} onChange={set("child_with_bed")} /></Field>
          <Field label="Child w/o bed ₹"><Input type="number" value={edit.child_without_bed ?? ""} onChange={set("child_without_bed")} /></Field>
          <div className="flex items-end gap-2"><Button onClick={save}>Save</Button><Button variant="ghost" onClick={() => setEdit(null)}>Cancel</Button></div>
        </div>
      )}
      <Table>
        <thead><tr><Th>Room</Th><Th>Meal</Th><Th>Season</Th><Th className="text-right">Room/night</Th><Th className="text-right">Extra adult</Th><Th className="text-right">CWB</Th><Th className="text-right">CNB</Th><Th /></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <Td className="font-medium">{r.room_type}</Td><Td>{r.meal_plan}</Td>
              <Td className="text-xs">{r.valid_from ? `${r.season ?? ""} ${fmtDate(r.valid_from)} → ${fmtDate(r.valid_to)}` : "All year"}</Td>
              <Td className="text-right">{inr(r.cost_per_night)}</Td><Td className="text-right">{inr(r.extra_adult)}</Td><Td className="text-right">{inr(r.child_with_bed)}</Td><Td className="text-right">{inr(r.child_without_bed)}</Td>
              <Td>
                <div className="flex gap-1">
                  {can("masters", "edit") && <button onClick={() => setEdit({ ...r })} className="p-1 text-slate-400 hover:text-slate-700"><Pencil className="h-3.5 w-3.5" /></button>}
                  {can("masters", "delete") && <ConfirmButton size="icon" label="?" onConfirm={async () => { await sb().from("hotel_rates").delete().eq("id", r.id); load(); }}><Trash2 className="h-3.5 w-3.5" /></ConfirmButton>}
                </div>
              </Td>
            </tr>
          ))}
          {!rows.length && <tr><Td colSpan={8} className="text-slate-400">No rates yet.</Td></tr>}
        </tbody>
      </Table>
    </Modal>
  );
}

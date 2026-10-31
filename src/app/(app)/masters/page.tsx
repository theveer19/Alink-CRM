"use client";
import { Suspense, useEffect, useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { BedDouble, Car, MapPin, Pencil, Plus, Trash2 } from "lucide-react";
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
  const [tab, setTab] = useState(params.get("tab") ?? "regions");
  const [groups, setGroups] = useState<{ value: string; label: string }[]>([]);
  const [regions, setRegions] = useState<{ value: string; label: string }[]>([]);
  const [dests, setDests] = useState<{ value: string; label: string }[]>([]);
  const [sups, setSups] = useState<{ value: string; label: string; type: string }[]>([]);
  const supOf = (...types: string[]) => sups.filter((x) => types.includes(x.type)).map(({ value, label }) => ({ value, label }));
  const [rateHotel, setRateHotel] = useState<any | null>(null);
  const [pointsFor, setPointsFor] = useState<any | null>(null);
  const [ratesFor, setRatesFor] = useState<any | null>(null);
  const [cats, setCats] = useState<string[]>([]);

  useEffect(() => {
    sb().from("region_groups").select("id, name").order("sort").order("name").then(({ data }) => setGroups((data ?? []).map((d) => ({ value: d.id, label: d.name }))));
    sb().from("regions").select("id, name").order("sort").order("name").then(({ data }) => setRegions((data ?? []).map((d) => ({ value: d.id, label: d.name }))));
    sb().from("destinations").select("id, name, regions(name)").order("name").then(({ data }) =>
      setDests((data ?? []).map((d: any) => ({ value: d.id, label: d.regions?.name ? `${d.name} (${d.regions.name})` : d.name }))));
    sb().from("suppliers").select("id, name, supplier_type").order("name").then(({ data }) => setSups((data ?? []).map((d) => ({ value: d.id, label: d.name, type: d.supplier_type }))));
    sb().from("hotels").select("category").then(({ data }) => setCats([...new Set([...HOTEL_CATEGORIES, ...(data ?? []).map((d) => d.category).filter(Boolean)])]));
  }, [tab]);

  return (
    <>
      <PageHeader title="Masters" subtitle="Everything the package composer uses — states, packages, cities, places, hotels, vehicles and rates" />
      <Tabs value={tab} onChange={setTab} tabs={[
        { value: "states", label: "States" }, { value: "regions", label: "Packages & pickup points" }, { value: "destinations", label: "Cities" },
        { value: "transfers", label: "Places (day plans) & cab rates" }, { value: "hotels", label: "Hotels & rates" }, { value: "vehicles", label: "Vehicles" },
        { value: "inclusions", label: "Inclusions / exclusions" }, { value: "notices", label: "Offers / discount / promo" },
        { value: "suppliers", label: "Suppliers" }, { value: "activities", label: "Activities / tickets" },
        { value: "templates", label: "Text & message templates" }, { value: "sources", label: "Lead sources" },
      ]} />

      {tab === "states" && (
        <>
          <Help>First screen of <b>Compose Package</b>: a card per state / destination, e.g. <b>Jammu Kashmir and Ladakh</b>. Packages (Kashmir, Ladakh, Vaishno Devi…) are added in the next tab.</Help>
          <CrudTable table="region_groups" title="States" order="sort" fields={[
            { key: "image_url", label: "Card photo", type: "image", list: true },
            { key: "name", label: "State / destination name", required: true, list: true },
            { key: "sort", label: "Sort order", type: "number", list: true },
            { key: "is_active", label: "Active", type: "bool", list: true },
          ]} />
        </>
      )}

      {tab === "regions" && (
        <>
          <Help>A package card inside a state — <b>Kashmir Tour Packages, Ladakh (Leh), Mata Vaishno Devi…</b> Its cities, places, hotels and inclusions are shown in the composer.
            The description is printed as <b>“Where you will go”</b> on the package. Click <b>Points</b> to add pick up / drop points (e.g. Srinagar Airport / Railway Station → city Srinagar).</Help>
          <CrudTable table="regions" title="Packages" order="sort" searchKeys={["name", "country"]} fields={[
            { key: "image_url", label: "Card photo", type: "image", list: true },
            { key: "name", label: "Package name", required: true, list: true },
            { key: "group_id", label: "State", type: "select", options: groups, list: true },
            { key: "country", label: "Country", default: "India" },
            { key: "description", label: "Destination description (shown on the package)", type: "textarea" },
            { key: "terms", label: "Extra terms for this package", type: "textarea" },
            { key: "min_nights", label: "Min nights", type: "number", default: 1 },
            { key: "max_nights", label: "Max nights", type: "number", default: 15 },
            { key: "sort", label: "Sort order", type: "number" },
            { key: "is_active", label: "Active", type: "bool", list: true },
          ]} rowAction={(r) => <Button size="sm" variant="secondary" onClick={() => setPointsFor(r)}><MapPin className="h-3.5 w-3.5" /> Points</Button>} />
        </>
      )}

      {tab === "destinations" && (
        <>
          <Help>Cities / night-stay locations (Srinagar, Gulmarg, Tangmarg, Pahalgam…). Link each to its package.</Help>
          <CrudTable table="destinations" title="Cities" searchKeys={["name", "state", "country"]} fields={[
            { key: "name", label: "City name", required: true, list: true },
            { key: "region_id", label: "Package", type: "select", options: regions, list: true },
            { key: "state", label: "State", list: true },
            { key: "country", label: "Country", list: true, default: "India" },
            { key: "image_url", label: "Photo", type: "image", list: true },
            { key: "description", label: "About the city", type: "textarea" },
            { key: "is_active", label: "Active", type: "bool", list: true },
          ]} />
        </>
      )}

      {tab === "hotels" && (
        <>
          <Help>Hotels per city with category, photos (first = main) and description — shown by the <b>Images</b> / <b>Details</b> buttons and on the package. Click <b>Rates</b> for room-wise season rates (MAP / CP).</Help>
          <CrudTable table="hotels" title="Hotels" searchKeys={["name", "address"]} fields={[
            { key: "images", label: "Photos", type: "images", max: 8, list: true },
            { key: "name", label: "Hotel name", required: true, list: true },
            { key: "destination_id", label: "City (night stay)", type: "select", options: dests, list: true },
            { key: "category", label: "Category", type: "select", options: cats.map((c) => ({ value: c, label: c })), list: true },
            { key: "supplier_id", label: "Supplier / contracting party", type: "select", options: supOf("hotel", "dmc") },
            { key: "phone", label: "Phone", list: true },
            { key: "email", label: "Email" },
            { key: "address", label: "Address", wide: true },
            { key: "check_in_time", label: "Check-in time", default: "2:00 PM" },
            { key: "check_out_time", label: "Check-out time", default: "12:00 PM" },
            { key: "description", label: "Description (distance, facilities, website…)", type: "textarea" },
            { key: "notes", label: "Internal notes", type: "textarea" },
            { key: "is_active", label: "Active", type: "bool", list: true },
          ]} rowAction={(r) => (
            <Button size="sm" variant="secondary" onClick={() => setRateHotel(r)}><BedDouble className="h-3.5 w-3.5" /> Rates</Button>
          )} />
        </>
      )}

      {tab === "vehicles" && (
        <>
          <Help>Vehicles offered in the composer’s <b>Vehicle Selection</b>. Rates are set per place (Places tab → <b>Cab rates</b>).</Help>
          <CrudTable table="vehicles" title="Vehicles" order="sort" fields={[
            { key: "name", label: "Vehicle", required: true, list: true },
            { key: "seats", label: "Seats", type: "number", list: true, default: 4 },
            { key: "sort", label: "Sort order", type: "number", list: true },
            { key: "is_active", label: "Active", type: "bool", list: true },
          ]} />
        </>
      )}

      {tab === "notices" && (
        <>
          <Help><b>Offer</b> = poster photo shown in Offer Packages. <b>Discount</b> / <b>Promotional</b> = text lists (use “- ” for bullets, “## ” for headings, **bold**).</Help>
          <CrudTable table="notices" title="Offers & notices" order="sort" searchKeys={["title", "body"]} fields={[
            { key: "kind", label: "Type", type: "select", required: true, list: true, default: "offer", options: [{ value: "offer", label: "Offer package (poster)" }, { value: "discount", label: "Discount list" }, { value: "promotion", label: "Promotional list" }] },
            { key: "image_url", label: "Poster / photo", type: "image", list: true },
            { key: "title", label: "Title", required: true, list: true },
            { key: "region_group_id", label: "State", type: "select", options: groups, list: true },
            { key: "valid_till", label: "Valid till", type: "date", list: true },
            { key: "body", label: "Text", type: "textarea" },
            { key: "sort", label: "Sort order", type: "number" },
            { key: "is_active", label: "Active", type: "bool", list: true },
          ]} />
        </>
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
          <Help>Each row is a <b>Place to Visit</b> for one day, like <i>“Arrival Srinagar to Gulmarg (Night Stay)”</i>. <b>Starts from</b> decides on which day it is offered (day 1 = Arrival places from the pick up city;
            next days = places from last night’s city; last day = Departure / Drop places). <b>Night stay options</b> = where the guest can sleep (Gulmarg / Tangmarg).
            Photos + description print on the package. Click <b>Cab rates</b> to set the price per vehicle (AC / without AC).</Help>
          <CrudTable table="transfers" title="Places" order="sort" searchKeys={["name", "description"]} fields={[
            { key: "images", label: "Photos", type: "images", max: 4, list: true },
            { key: "name", label: "Place / day plan name", required: true, list: true, wide: true },
            { key: "transfer_type", label: "Type", type: "select", options: TRANSFER_TYPES.map((t) => ({ value: t.value, label: t.label })), required: true, list: true, default: "sightseeing" },
            { key: "destination_id", label: "Starts from (city)", type: "select", options: dests, list: true },
            { key: "to_destination_id", label: "Ends at (city)", type: "select", options: dests, list: true },
            { key: "stay_options", label: "Night stay options (blank = the end city)", type: "multiselect", options: dests },
            { key: "supplier_id", label: "Vehicle supplier", type: "select", options: supOf("transport") },
            { key: "description", label: "About this stop (shown on the package)", type: "textarea" },
            { key: "sort", label: "Sort order", type: "number" },
            { key: "is_active", label: "Active", type: "bool", list: true },
          ]} rowAction={(r) => <Button size="sm" variant="secondary" onClick={() => setRatesFor(r)}><Car className="h-3.5 w-3.5" /> Cab rates</Button>} />
          {supOf("transport").length === 0 && <p className="mt-2 text-xs text-amber-700">Tip: add your cab operators in Suppliers with type &quot;Transport&quot; — only they appear as vehicle suppliers here.</p>}
        </>
      )}

      {tab === "inclusions" && (
        <CrudTable table="inclusion_items" title="Inclusions & exclusions" order="sort" searchKeys={["title"]} fields={[
          { key: "kind", label: "Type", type: "select", required: true, list: true, default: "inclusion", options: [{ value: "inclusion", label: "✓ Inclusion" }, { value: "exclusion", label: "✗ Exclusion" }] },
          { key: "title", label: "Text", required: true, list: true, wide: true },
          { key: "region_id", label: "Only for package", type: "select", options: regions, list: true },
          { key: "destination_id", label: "Only for city (blank = whole region / all trips)", type: "select", options: dests, list: true },
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
      <PickupPoints region={pointsFor} onClose={() => setPointsFor(null)} />
      <PlaceRates plan={ratesFor} onClose={() => setRatesFor(null)} />
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
      footer={can("masters", "create") && !edit ? <Button onClick={() => setEdit({ room_type: "Deluxe Room", meal_plan: "MAP" })}><Plus className="h-4 w-4" /> Add rate</Button> : undefined}>
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

function Help({ children }: { children: ReactNode }) {
  return <p className="mb-3 rounded-lg bg-brand-50 p-3 text-xs leading-relaxed text-slate-700">{children}</p>;
}

/** Pick up / drop points of a package, each linked to the city the tour starts from. */
function PickupPoints({ region, onClose }: { region: any | null; onClose: () => void }) {
  const { can } = useAuth();
  const [rows, setRows] = useState<any[]>([]);
  const [cities, setCities] = useState<any[]>([]);
  const [edit, setEdit] = useState<any | null>(null);
  async function load() {
    if (!region) return;
    const [p, c] = await Promise.all([
      sb().from("pickup_points").select("*").eq("region_id", region.id).order("sort").order("name"),
      sb().from("destinations").select("id, name, region_id").order("name"),
    ]);
    setRows(p.data ?? []);
    setCities((c.data ?? []).sort((a: any, b: any) => Number(b.region_id === region.id) - Number(a.region_id === region.id)));
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); setEdit(null); }, [region]);
  if (!region) return null;
  async function save() {
    if (!edit.name?.trim()) return toast.error("Name is required");
    const p = { region_id: region.id, name: edit.name.trim(), destination_id: edit.destination_id || null, is_pickup: !!edit.is_pickup, is_drop: !!edit.is_drop, sort: Number(edit.sort || 0) };
    const { error } = edit.id ? await sb().from("pickup_points").update(p).eq("id", edit.id) : await sb().from("pickup_points").insert(p);
    if (error) return toast.error(error.message);
    setEdit(null);
    load();
  }
  return (
    <Modal open onClose={onClose} title={`Pick up / drop points — ${region.name}`} size="lg"
      footer={can("masters", "create") && !edit ? <Button onClick={() => setEdit({ is_pickup: true, is_drop: true, sort: rows.length + 1 })}><Plus className="h-4 w-4" /> Add point</Button> : undefined}>
      {edit && (
        <div className="mb-4 grid grid-cols-2 gap-3 rounded-xl border border-brand-200 bg-brand-50/40 p-3 sm:grid-cols-4">
          <Field label="Point name" className="col-span-2"><Input value={edit.name ?? ""} onChange={(e) => setEdit({ ...edit, name: e.target.value })} placeholder="Srinagar Airport / Railway Station" /></Field>
          <Field label="City (tour starts / ends here)" className="col-span-2">
            <Select value={edit.destination_id ?? ""} onChange={(e) => setEdit({ ...edit, destination_id: e.target.value })}>
              <option value="">—</option>
              {cities.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </Field>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!edit.is_pickup} onChange={(e) => setEdit({ ...edit, is_pickup: e.target.checked })} /> Pick up</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!edit.is_drop} onChange={(e) => setEdit({ ...edit, is_drop: e.target.checked })} /> Drop</label>
          <Field label="Sort"><Input type="number" value={edit.sort ?? 0} onChange={(e) => setEdit({ ...edit, sort: e.target.value })} /></Field>
          <div className="flex items-end gap-2"><Button onClick={save}>Save</Button><Button variant="ghost" onClick={() => setEdit(null)}>Cancel</Button></div>
        </div>
      )}
      <Table>
        <thead><tr><Th>Point</Th><Th>City</Th><Th>Pick up</Th><Th>Drop</Th><Th /></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <Td className="font-medium">{r.name}</Td>
              <Td>{cities.find((c) => c.id === r.destination_id)?.name ?? <span className="text-amber-600">set city</span>}</Td>
              <Td>{r.is_pickup ? "✓" : ""}</Td><Td>{r.is_drop ? "✓" : ""}</Td>
              <Td>
                <div className="flex gap-1">
                  {can("masters", "edit") && <button onClick={() => setEdit({ ...r })} className="p-1 text-slate-400 hover:text-slate-700"><Pencil className="h-3.5 w-3.5" /></button>}
                  {can("masters", "delete") && <ConfirmButton size="icon" label="?" onConfirm={async () => { await sb().from("pickup_points").delete().eq("id", r.id); load(); }}><Trash2 className="h-3.5 w-3.5" /></ConfirmButton>}
                </div>
              </Td>
            </tr>
          ))}
          {!rows.length && <tr><Td colSpan={5} className="text-slate-400">No points yet.</Td></tr>}
        </tbody>
      </Table>
    </Modal>
  );
}

/** Cab rate of a place for every vehicle (without AC / with AC). */
function PlaceRates({ plan, onClose }: { plan: any | null; onClose: () => void }) {
  const { can } = useAuth();
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [vals, setVals] = useState<Record<string, { rate: string; ac_rate: string }>>({});
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!plan) return;
    (async () => {
      const [v, r] = await Promise.all([
        sb().from("vehicles").select("*").order("sort").order("name"),
        sb().from("transfer_rates").select("*").eq("transfer_id", plan.id),
      ]);
      setVehicles(v.data ?? []);
      const o: Record<string, { rate: string; ac_rate: string }> = {};
      (v.data ?? []).forEach((x: any) => {
        const found = (r.data ?? []).find((y: any) => y.vehicle_id === x.id);
        o[x.id] = { rate: found ? String(found.rate) : "", ac_rate: found && Number(found.ac_rate) ? String(found.ac_rate) : "" };
      });
      setVals(o);
    })();
  }, [plan]);
  if (!plan) return null;
  async function save() {
    setBusy(true);
    const rows = Object.entries(vals).map(([vehicle_id, v]) => ({ transfer_id: plan.id, vehicle_id, rate: Number(v.rate || 0), ac_rate: Number(v.ac_rate || 0) }));
    const { error } = await sb().from("transfer_rates").upsert(rows, { onConflict: "transfer_id,vehicle_id" });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Cab rates saved");
    onClose();
  }
  return (
    <Modal open onClose={onClose} title={`Cab rates — ${plan.name}`} footer={can("masters", "edit") ? <Button loading={busy} onClick={save}>Save rates</Button> : undefined}>
      <p className="mb-3 text-xs text-slate-500">Price for one vehicle for this day. Leave “With AC” empty if it costs the same.</p>
      <Table>
        <thead><tr><Th>Vehicle</Th><Th>Without AC ₹</Th><Th>With AC ₹</Th></tr></thead>
        <tbody>
          {vehicles.map((v) => (
            <tr key={v.id}>
              <Td className="font-medium">{v.name} <span className="text-xs text-slate-400">({v.seats} seats)</span></Td>
              <Td><Input type="number" value={vals[v.id]?.rate ?? ""} onChange={(e) => setVals({ ...vals, [v.id]: { ...vals[v.id], rate: e.target.value } })} /></Td>
              <Td><Input type="number" value={vals[v.id]?.ac_rate ?? ""} onChange={(e) => setVals({ ...vals, [v.id]: { ...vals[v.id], ac_rate: e.target.value } })} /></Td>
            </tr>
          ))}
          {!vehicles.length && <tr><Td colSpan={3} className="text-slate-400">Add vehicles in the Vehicles tab first.</Td></tr>}
        </tbody>
      </Table>
    </Modal>
  );
}

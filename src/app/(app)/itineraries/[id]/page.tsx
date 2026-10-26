"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowLeft, Copy, Eye, FileDown, Hotel as HotelIcon, Link2, Mail, MessageCircle, Pencil, Plane, Plus, Save, Trash2, Car, Camera,
  CheckCircle2, Files, MapPin, Moon, AlertTriangle, Check, X, CalendarDays, Users,
} from "lucide-react";
import { sb } from "@/lib/supabase/client";
import { MEAL_PLANS, QUOTE_STATUSES, TRANSFER_TYPES, VEHICLE_TYPES, statusMeta } from "@/lib/constants";
import type { Hotel, InclusionItem, Itinerary, ItineraryDay, ItineraryItem, Supplier, Transfer } from "@/lib/types";
import { addDaysIso, hotelStayCost, nightsBetween, quoteTotals, suggestVehicle, type HotelRate } from "@/lib/pricing";
import { autoItems, defaultHotelSel, lines, staySegments, type BuilderMasters, type HotelSel } from "@/lib/itinerary";
import { appUrl, cn, fmtDate, inr } from "@/lib/utils";
import { convertToBooking, duplicateItinerary } from "@/lib/actions";
import { Guard, useAuth } from "@/components/auth";
import { AddItemModal, type Masters } from "@/components/add-item-modal";
import { MessageComposer, type ComposeTarget } from "@/components/message-composer";
import { Badge, Button, Card, ConfirmButton, Field, Input, Select, Spinner, Textarea } from "@/components/ui";

export default function ItineraryPage() {
  return <Guard module="itineraries"><Builder /></Guard>;
}

const ICON: Record<string, any> = { hotel: HotelIcon, transfer: Car, activity: Camera, flight: Plane, train: Plane };

type AllMasters = BuilderMasters & { suppliers: Supplier[]; activities: Masters["activities"] };

function Builder() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { can, settings } = useAuth();
  const [it, setIt] = useState<Itinerary | null>(null);
  const [days, setDays] = useState<ItineraryDay[]>([]);
  const [manual, setManual] = useState<ItineraryItem[]>([]);
  const [hotelSel, setHotelSel] = useState<Record<string, HotelSel>>({});
  const [m, setM] = useState<AllMasters | null>(null);
  const [contact, setContact] = useState<{ name: string; phone: string | null; email: string | null } | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [addFor, setAddFor] = useState<{ day: number | null; idx?: number } | null>(null);
  const [compose, setCompose] = useState<ComposeTarget | null>(null);
  const [converting, setConverting] = useState(false);
  const editable = can("itineraries", "edit") || can("itineraries", "create");

  useEffect(() => {
    (async () => {
      const supa = sb();
      const [i, d, its, de, ho, ra, ac, tr, su, inc] = await Promise.all([
        supa.from("itineraries").select("*").eq("id", id).single(),
        supa.from("itinerary_days").select("*").eq("itinerary_id", id).order("day_no"),
        supa.from("itinerary_items").select("*").eq("itinerary_id", id).order("sort"),
        supa.from("destinations").select("*").eq("is_active", true).order("name"),
        supa.from("hotels").select("*").eq("is_active", true).order("name"),
        supa.from("hotel_rates").select("*"),
        supa.from("activities").select("*").eq("is_active", true).order("name"),
        supa.from("transfers").select("*").eq("is_active", true).order("sort").order("name"),
        supa.from("suppliers").select("*").eq("is_active", true).order("name"),
        supa.from("inclusion_items").select("*").eq("is_active", true).order("sort").order("title"),
      ]);
      if (i.error) return toast.error(i.error.message);
      if (inc.error) toast.error("Run supabase/003_itinerary_v2.sql in Supabase — " + inc.error.message);
      const itin = { vehicle_type: "sedan", vehicles: 1, ...i.data } as Itinerary;
      setIt(itin);
      const dayRows = ((d.data ?? []) as ItineraryDay[]).map((x) => ({ ...x, day_plan_id: x.day_plan_id ?? null, stay_destination_id: x.stay_destination_id ?? null }));
      // make sure there is a row for every day
      const full: ItineraryDay[] = [];
      for (let n = 1; n <= itin.nights + 1; n++) full.push(dayRows.find((x) => x.day_no === n) ?? blankDay(n, itin.nights + 1));
      setDays(full);
      const all = (its.data ?? []) as ItineraryItem[];
      setManual(all.filter((x) => !x.details?.auto));
      const sel: Record<string, HotelSel> = {};
      all.filter((x) => x.details?.auto === "hotel").forEach((x) => {
        const dd = x.details;
        sel[dd.seg_key] = { hotel_id: dd.hotel_id, room_type: dd.room_type ?? "", meal_plan: dd.meal_plan ?? "", rooms: Number(dd.rooms ?? 1),
          extra_adults: Number(dd.extra_adults ?? 0), cwb: Number(dd.cwb ?? 0), cnb: Number(dd.cnb ?? 0), cost_override: dd.cost_override ?? null };
      });
      setHotelSel(sel);
      setM({
        destinations: de.data ?? [], hotels: (ho.data ?? []) as Hotel[], rates: (ra.data ?? []) as HotelRate[], plans: (tr.data ?? []) as Transfer[],
        inclusions: (inc.data ?? []) as InclusionItem[], suppliers: (su.data ?? []) as Supplier[], activities: ac.data ?? [],
      });
      if (i.data.contact_id) {
        const { data: c } = await supa.from("contacts").select("name, phone, email").eq("id", i.data.contact_id).single();
        setContact(c);
      }
    })();
  }, [id]);

  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => { if (dirty) { e.preventDefault(); e.returnValue = ""; } };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  const auto = useMemo(() => (it && m ? autoItems(it, days, hotelSel, m) : []), [it, days, hotelSel, m]);
  const allItems = useMemo(() => [...auto, ...manual], [auto, manual]);
  const totals = useMemo(() => (it ? quoteTotals(allItems.map((x) => ({ cost: x.cost, markup: x.markup })), it) : null), [allItems, it]);
  const segments = useMemo(() => (it ? staySegments(days, it.nights, it.start_date) : []), [days, it]);

  if (!it || !m || !totals) return <Spinner />;

  const touch = () => setDirty(true);
  const set = <K extends keyof Itinerary>(k: K, v: Itinerary[K]) => { setIt({ ...it, [k]: v }); touch(); };
  const destName = (dId: string | null | undefined) => m.destinations.find((d) => d.id === dId)?.name ?? "";
  const endDate = it.start_date ? addDaysIso(it.start_date, it.nights) : "";
  const pax = it.adults + it.children;
  const suggestion = suggestVehicle(pax);

  function resize(nights: number, start = it!.start_date) {
    nights = Math.max(0, Math.min(60, nights));
    const want = nights + 1;
    const next: ItineraryDay[] = [];
    for (let n = 1; n <= want; n++) {
      const old = days[n - 1];
      next.push(old ? { ...old, day_no: n } : blankDay(n, want));
    }
    // last day = departure, no night stay
    next[want - 1] = { ...next[want - 1], stay_destination_id: null };
    setDays(next);
    setIt({ ...it!, nights, start_date: start });
    touch();
  }

  function setDay(i: number, patch: Partial<ItineraryDay>) {
    setDays(days.map((d, idx) => (idx === i ? { ...d, ...patch } : d)));
    touch();
  }

  function pickPlan(i: number, planId: string) {
    const p = m!.plans.find((x) => x.id === planId);
    const isLast = i === days.length - 1;
    if (!p) return setDay(i, { day_plan_id: null });
    const stay = isLast ? null : p.to_destination_id ?? p.destination_id ?? days[i].stay_destination_id;
    setDay(i, {
      day_plan_id: p.id,
      title: p.name,
      description: p.description ?? days[i].description,
      destination_id: p.destination_id,
      stay_destination_id: stay,
    });
  }

  function setStay(i: number, destId: string | null) {
    const dest = m!.destinations.find((x) => x.id === destId);
    const d = days[i];
    // no day plan picked yet → use the city's default description so the PDF is never empty
    setDay(i, {
      stay_destination_id: destId,
      ...(!d.day_plan_id && !d.description && dest?.description ? { description: dest.description } : {}),
      ...(!d.day_plan_id && /^Day \d+$/.test(d.title) && dest ? { title: `${dest.name}` } : {}),
    });
  }

  function setSel(seg: string, patch: Partial<HotelSel>) {
    setHotelSel({ ...hotelSel, [seg]: { ...(hotelSel[seg] ?? defaultHotelSel(undefined, [], it!)), ...patch } });
    touch();
  }

  function toggleLine(field: "inclusions" | "exclusions", title: string, on: boolean) {
    const cur = lines(it![field]);
    const rest = cur.filter((l) => l.toLowerCase() !== title.toLowerCase());
    set(field, (on ? [...rest, title] : rest).join("\n"));
  }

  async function save(silent = false) {
    if (!it) return false;
    setSaving(true);
    const supa = sb();
    const t = quoteTotals(allItems.map((x) => ({ cost: x.cost, markup: x.markup })), it);
    const { error } = await supa.from("itineraries").update({
      title: it.title, destination: it.destination, start_date: it.start_date || null, nights: it.nights, adults: it.adults, children: it.children,
      infants: it.infants, rooms: it.rooms, status: it.status, markup_type: it.markup_type, markup_value: it.markup_value, discount: it.discount,
      gst_percent: it.gst_percent, gst_mode: it.gst_mode, tcs_percent: it.tcs_percent, show_item_prices: it.show_item_prices,
      overview: it.overview, inclusions: it.inclusions, exclusions: it.exclusions, terms: it.terms, cover_image: it.cover_image, valid_till: it.valid_till || null,
      vehicle_type: it.vehicle_type, vehicles: it.vehicles, pickup_point: it.pickup_point, pickup_time: it.pickup_time, arrival_details: it.arrival_details,
      drop_point: it.drop_point, drop_time: it.drop_time, departure_details: it.departure_details,
      cost_total: t.cost_total, markup_total: t.markup_total, gst_total: t.gst_total, tcs_total: t.tcs_total, grand_total: t.grand_total,
    }).eq("id", it.id);
    if (error) { setSaving(false); toast.error(error.message); return false; }
    await supa.from("itinerary_days").delete().eq("itinerary_id", it.id);
    const r1 = await supa.from("itinerary_days").insert(days.map((d) => ({
      itinerary_id: it.id, day_no: d.day_no, title: d.title, description: d.description, destination_id: d.destination_id, meals: d.meals,
      day_plan_id: d.day_plan_id, stay_destination_id: d.stay_destination_id,
    })));
    if (r1.error) { setSaving(false); toast.error(r1.error.message); return false; }
    await supa.from("itinerary_items").delete().eq("itinerary_id", it.id);
    if (allItems.length) {
      const r = await supa.from("itinerary_items").insert(allItems.map((x, i) => ({
        itinerary_id: it.id, day_no: x.day_no, sort: i, item_type: x.item_type, ref_id: x.ref_id, supplier_id: x.supplier_id, title: x.title,
        details: x.details, qty: x.qty, unit_cost: x.unit_cost, cost: x.cost, markup: x.markup,
      })));
      if (r.error) { setSaving(false); toast.error(r.error.message); return false; }
    }
    setSaving(false);
    setDirty(false);
    if (!silent) toast.success("Itinerary saved");
    return true;
  }

  const shareUrl = `${appUrl()}/share/itinerary/${it.share_token}`;
  async function markSent() {
    if (it && it.status === "draft") { setIt({ ...it, status: "sent" }); await sb().from("itineraries").update({ status: "sent" }).eq("id", it.id); }
  }

  async function accept() {
    if (!(await save(true))) return;
    setConverting(true);
    try {
      const bId = await convertToBooking(it!, allItems);
      toast.success("Booking created");
      router.push(`/bookings/${bId}`);
    } catch (e: any) {
      toast.error(e.message);
      setConverting(false);
    }
  }

  // inclusion master items relevant to this trip
  const tripDest = new Set([...days.map((d) => d.stay_destination_id), ...days.map((d) => d.destination_id)].filter(Boolean) as string[]);
  const incFor = (kind: "inclusion" | "exclusion") => m.inclusions.filter((x) => x.kind === kind && (!x.destination_id || tripDest.has(x.destination_id)));
  const incLines = lines(it.inclusions).map((l) => l.toLowerCase());
  const excLines = lines(it.exclusions).map((l) => l.toLowerCase());
  const legacyHotels = manual.some((x) => x.item_type === "hotel");

  return (
    <>
      <Link href={it.lead_id ? `/leads/${it.lead_id}` : "/itineraries"} className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
        <ArrowLeft className="h-4 w-4" /> {it.lead_id ? "Back to lead" : "Itineraries"}
      </Link>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <input value={it.title} onChange={(e) => set("title", e.target.value)} disabled={!editable}
              className="min-w-0 rounded-md border border-transparent bg-transparent px-1 text-xl font-semibold text-slate-900 hover:border-slate-200 focus:border-brand-500 focus:outline-none" />
            <Badge className={statusMeta(QUOTE_STATUSES, it.status)?.color}>{statusMeta(QUOTE_STATUSES, it.status)?.label}</Badge>
          </div>
          <p className="px-1 text-sm text-slate-500">{it.quote_no} · version {it.version}{contact ? ` · ${contact.name}` : ""}{dirty && <span className="ml-2 text-amber-600">● unsaved changes</span>}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {editable && <Button loading={saving} onClick={() => save()} variant={dirty ? "primary" : "secondary"}><Save className="h-4 w-4" /> Save</Button>}
          <Button variant="secondary" onClick={async () => { if (dirty) await save(true); window.open(`/share/itinerary/${it.share_token}`, "_blank"); }}><Eye className="h-4 w-4" /> Preview</Button>
          <Button variant="secondary" onClick={async () => { if (dirty) await save(true); window.open(`/share/itinerary/${it.share_token}?print=1`, "_blank"); }}><FileDown className="h-4 w-4" /> PDF</Button>
          <Button variant="secondary" onClick={async () => { if (dirty) await save(true); await navigator.clipboard.writeText(shareUrl); toast.success("Share link copied"); markSent(); }}><Link2 className="h-4 w-4" /> Copy link</Button>
          <Button variant="secondary" onClick={async () => { if (dirty) await save(true); markSent(); setCompose({ channel: "whatsapp", name: contact?.name ?? "", phone: contact?.phone, leadId: it.lead_id, vars: { destination: it.destination, link: shareUrl, amount: totals.grand_total } }); }}>
            <MessageCircle className="h-4 w-4 text-emerald-600" /> WhatsApp
          </Button>
          <Button variant="secondary" onClick={async () => { if (dirty) await save(true); markSent(); setCompose({ channel: "email", name: contact?.name ?? "", email: contact?.email, leadId: it.lead_id, subject: `Your ${it.title} – ${settings.company_name}`, vars: { destination: it.destination, link: shareUrl } }); }}>
            <Mail className="h-4 w-4" /> Email
          </Button>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-3">
        <div className="space-y-5 xl:col-span-2">
          {/* 1. TRIP */}
          <Card title={<span className="flex items-center gap-2"><CalendarDays className="h-4 w-4 text-brand-600" /> 1 · Trip dates, travellers & vehicle</span>}>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Field label="Destination / package" className="col-span-2"><Input value={it.destination ?? ""} onChange={(e) => set("destination", e.target.value)} disabled={!editable} placeholder="Kashmir" /></Field>
              <Field label="Travel from" required>
                <Input type="date" value={it.start_date ?? ""} disabled={!editable} onChange={(e) => {
                  const s = e.target.value || null;
                  // keep the trip length, move the dates
                  resize(it.nights, s);
                }} />
              </Field>
              <Field label="Travel to" hint={it.start_date ? `${it.nights} Nights / ${it.nights + 1} Days` : "Pick start date first"}>
                <Input type="date" value={endDate} min={it.start_date ?? undefined} disabled={!editable || !it.start_date}
                  onChange={(e) => resize(nightsBetween(it.start_date, e.target.value))} />
              </Field>
              <Field label="Nights"><Input type="number" min={0} value={it.nights} onChange={(e) => resize(Number(e.target.value))} disabled={!editable} /></Field>
              <Field label="Adults"><Input type="number" min={1} value={it.adults} onChange={(e) => set("adults", Number(e.target.value))} disabled={!editable} /></Field>
              <Field label="Children"><Input type="number" min={0} value={it.children} onChange={(e) => set("children", Number(e.target.value))} disabled={!editable} /></Field>
              <Field label="Infants"><Input type="number" min={0} value={it.infants} onChange={(e) => set("infants", Number(e.target.value))} disabled={!editable} /></Field>
              <Field label="Rooms" hint={`Suggested ${Math.max(1, Math.ceil(it.adults / 2))}`}><Input type="number" min={1} value={it.rooms} onChange={(e) => set("rooms", Number(e.target.value))} disabled={!editable} /></Field>
              <Field label="Vehicle" hint={`${pax} pax → suggested ${VEHICLE_TYPES.find((v) => v.value === suggestion.type)?.label}${suggestion.count > 1 ? ` × ${suggestion.count}` : ""}`}>
                <Select value={it.vehicle_type} onChange={(e) => set("vehicle_type", e.target.value as Itinerary["vehicle_type"])} disabled={!editable}>
                  {VEHICLE_TYPES.map((v) => <option key={v.value} value={v.value}>{v.label} ({v.models}) · {v.capacity} seats</option>)}
                  <option value="none">No vehicle</option>
                </Select>
              </Field>
              <Field label="No. of vehicles"><Input type="number" min={1} value={it.vehicles} onChange={(e) => set("vehicles", Number(e.target.value))} disabled={!editable || it.vehicle_type === "none"} /></Field>
              <Field label="Quote valid till"><Input type="date" value={it.valid_till ?? ""} onChange={(e) => set("valid_till", e.target.value || null)} disabled={!editable} /></Field>
              {editable && (suggestion.type !== it.vehicle_type || suggestion.count !== it.vehicles) && it.vehicle_type !== "none" && (
                <div className="flex items-end">
                  <Button size="sm" variant="ghost" onClick={() => { setIt({ ...it, vehicle_type: suggestion.type, vehicles: suggestion.count }); touch(); }}>Use suggested vehicle</Button>
                </div>
              )}
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 rounded-lg bg-slate-50 p-3 sm:grid-cols-3">
              <Field label="Pickup point (arrival)"><Input value={it.pickup_point ?? ""} onChange={(e) => set("pickup_point", e.target.value)} placeholder="Srinagar Airport" disabled={!editable} /></Field>
              <Field label={`Pickup time${it.start_date ? ` · ${fmtDate(it.start_date)}` : ""}`}><Input type="time" value={it.pickup_time ?? ""} onChange={(e) => set("pickup_time", e.target.value)} disabled={!editable} /></Field>
              <Field label="Arrival flight / train"><Input value={it.arrival_details ?? ""} onChange={(e) => set("arrival_details", e.target.value)} placeholder="6E 2153" disabled={!editable} /></Field>
              <Field label="Drop point (departure)"><Input value={it.drop_point ?? ""} onChange={(e) => set("drop_point", e.target.value)} placeholder="Srinagar Airport" disabled={!editable} /></Field>
              <Field label={`Drop time${endDate ? ` · ${fmtDate(endDate)}` : ""}`}><Input type="time" value={it.drop_time ?? ""} onChange={(e) => set("drop_time", e.target.value)} disabled={!editable} /></Field>
              <Field label="Departure flight / train"><Input value={it.departure_details ?? ""} onChange={(e) => set("departure_details", e.target.value)} disabled={!editable} /></Field>
            </div>
            <Field label="Trip overview" className="mt-3"><Textarea rows={2} value={it.overview ?? ""} onChange={(e) => set("overview", e.target.value)} placeholder="Short intro shown at the top of the itinerary" disabled={!editable} /></Field>
          </Card>

          {/* 2. DAYS */}
          <Card title={<span className="flex items-center gap-2"><MapPin className="h-4 w-4 text-brand-600" /> 2 · Day-wise plan (route, sightseeing & night stay)</span>} bodyClass="space-y-4">
            {m.plans.length === 0 && (
              <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
                No day plans yet. Add them in <Link href="/masters?tab=transfers" className="font-semibold underline">Masters → Transfers & sightseeing</Link> (e.g. &quot;Arrival Srinagar&quot;, &quot;Srinagar → Gulmarg excursion&quot;) with Sedan / SUV / Tempo rates and the day description — then just pick them here.
              </p>
            )}
            {days.map((d, i) => {
              const date = it.start_date ? addDaysIso(it.start_date, i) : null;
              const from = i === 0 ? null : days[i - 1].stay_destination_id;
              const isLast = i === days.length - 1;
              const plans = m.plans.filter((p) => (i === 0 ? true : !from || p.destination_id === from || !p.destination_id));
              const preferred = plans.filter((p) => (i === 0 ? p.transfer_type === "arrival" : isLast ? p.transfer_type === "departure" : p.transfer_type !== "arrival" && p.transfer_type !== "departure"));
              const others = plans.filter((p) => !preferred.includes(p));
              const dayAuto = auto.filter((x) => x.day_no === d.day_no);
              const dayManual = manual.map((x, idx) => ({ x, idx })).filter(({ x }) => x.day_no === d.day_no);
              return (
                <div key={i} className="rounded-xl border border-slate-200">
                  <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 bg-slate-50/70 px-3 py-2">
                    <span className="rounded-md bg-brand-700 px-2 py-0.5 text-xs font-semibold text-white">Day {d.day_no}</span>
                    {date && <span className="text-xs font-medium text-slate-600">{fmtDate(date)}</span>}
                    <span className="flex items-center gap-1 text-xs text-slate-500">
                      <MapPin className="h-3 w-3" /> {i === 0 ? (it.pickup_point || "Arrival") : destName(from) || "—"}
                      {!isLast && <> → <Moon className="h-3 w-3" /> {destName(d.stay_destination_id) || "night stay?"}</>}
                      {isLast && <> → {it.drop_point || "Departure"}</>}
                    </span>
                  </div>
                  <div className="space-y-2 p-3">
                    <div className="grid gap-2 sm:grid-cols-3">
                      <Field label="Day plan / sightseeing" className="sm:col-span-2">
                        <Select value={d.day_plan_id ?? ""} onChange={(e) => pickPlan(i, e.target.value)} disabled={!editable}>
                          <option value="">— choose (fills title, details & cab cost) —</option>
                          {preferred.length > 0 && <optgroup label={i === 0 ? "Arrival plans" : isLast ? "Departure plans" : `From ${destName(from) || "anywhere"}`}>
                            {preferred.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                          </optgroup>}
                          {others.length > 0 && <optgroup label="Other plans">{others.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</optgroup>}
                        </Select>
                      </Field>
                      <Field label={isLast ? "Night stay" : "Night stay at"}>
                        <Select value={d.stay_destination_id ?? ""} onChange={(e) => setStay(i, e.target.value || null)} disabled={!editable || isLast}>
                          <option value="">{isLast ? "— departure day —" : "— choose city —"}</option>
                          {m.destinations.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                        </Select>
                      </Field>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-4">
                      <Input value={d.title} onChange={(e) => setDay(i, { title: e.target.value })} disabled={!editable} placeholder="Day title" className="sm:col-span-3" />
                      <Input value={d.meals ?? ""} onChange={(e) => setDay(i, { meals: e.target.value })} placeholder="Meals (B, D)" disabled={!editable} />
                    </div>
                    <Textarea rows={3} value={d.description ?? ""} onChange={(e) => setDay(i, { description: e.target.value })} disabled={!editable}
                      placeholder="Day details shown to the customer (auto-filled from the day plan)" className="text-sm" />
                    {dayAuto.map((x, k) => <AutoRow key={"a" + k} x={x} />)}
                    {dayManual.map(({ x, idx }) => <ItemRow key={idx} x={x} editable={editable} onEdit={() => setAddFor({ day: x.day_no, idx })} onDelete={() => { setManual(manual.filter((_, j) => j !== idx)); touch(); }} />)}
                    {editable && (
                      <button onClick={() => setAddFor({ day: d.day_no })} className="flex items-center gap-1 rounded-lg border border-dashed border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 hover:border-brand-400 hover:text-brand-700">
                        <Plus className="h-3.5 w-3.5" /> Add flight / activity / other service
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </Card>

          {/* 3. HOTELS */}
          <Card title={<span className="flex items-center gap-2"><HotelIcon className="h-4 w-4 text-brand-600" /> 3 · Hotels (from night stays)</span>} bodyClass="space-y-3">
            {segments.length === 0 && <p className="text-sm text-slate-500">Choose &quot;Night stay at&quot; for each day above — hotels for each city will appear here.</p>}
            {legacyHotels && <p className="text-xs text-amber-700">This quote also has hotels added manually (older format) — they are listed under their day.</p>}
            {segments.map((seg) => {
              const sel = hotelSel[seg.key] ?? { ...defaultHotelSel(undefined, m.rates, it), hotel_id: "" };
              const hotels = m.hotels.filter((h) => h.destination_id === seg.destId);
              const hotel = m.hotels.find((h) => h.id === sel.hotel_id);
              const rs = m.rates.filter((r) => r.hotel_id === sel.hotel_id);
              const roomTypes = [...new Set(rs.map((r) => r.room_type))];
              const meals = [...new Set(rs.filter((r) => !sel.room_type || r.room_type === sel.room_type).map((r) => r.meal_plan))];
              const calc = sel.hotel_id ? hotelStayCost({ rates: m.rates, hotelId: sel.hotel_id, roomType: sel.room_type, mealPlan: sel.meal_plan, checkIn: seg.checkIn, nights: seg.nights, rooms: sel.rooms, extraAdults: sel.extra_adults, childWithBed: sel.cwb, childWithoutBed: sel.cnb }) : null;
              return (
                <div key={seg.key} className="rounded-xl border border-slate-200 p-3">
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-slate-800">
                      {destName(seg.destId)} · {seg.nights} Night{seg.nights > 1 ? "s" : ""}
                      <span className="ml-2 font-normal text-slate-500">
                        {seg.checkIn ? `Check-in ${fmtDate(seg.checkIn)}${hotel?.check_in_time ? ` ${hotel.check_in_time}` : ""} → Check-out ${fmtDate(seg.checkOut)}${hotel?.check_out_time ? ` ${hotel.check_out_time}` : ""}` : `Day ${seg.startDay}–${seg.startDay + seg.nights}`}
                      </span>
                    </p>
                    {calc && <p className="text-sm font-semibold">{inr(sel.cost_override ?? calc.total)}</p>}
                  </div>
                  {hotels.length === 0 ? (
                    <p className="text-xs text-amber-700">No hotels saved for {destName(seg.destId)}. Add them in <Link href="/masters?tab=hotels" className="underline">Masters → Hotels & rates</Link>.</p>
                  ) : (
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-6">
                      <Field label="Hotel" className="col-span-2 sm:col-span-6">
                        <Select value={sel.hotel_id} disabled={!editable} onChange={(e) => {
                          const h = m.hotels.find((x) => x.id === e.target.value);
                          setHotelSel({ ...hotelSel, [seg.key]: { ...defaultHotelSel(h, m.rates, it), cost_override: null } });
                          touch();
                        }}>
                          <option value="">— choose hotel in {destName(seg.destId)} —</option>
                          {hotels.map((h) => <option key={h.id} value={h.id}>{h.name}{h.category ? ` · ${h.category}` : ""}</option>)}
                        </Select>
                      </Field>
                      <Field label="Room type" className="sm:col-span-2">
                        {roomTypes.length ? (
                          <Select value={sel.room_type} onChange={(e) => setSel(seg.key, { room_type: e.target.value, cost_override: null })} disabled={!editable}>{roomTypes.map((r) => <option key={r}>{r}</option>)}</Select>
                        ) : <Input value={sel.room_type} onChange={(e) => setSel(seg.key, { room_type: e.target.value })} disabled={!editable} />}
                      </Field>
                      <Field label="Meal">
                        <Select value={sel.meal_plan} onChange={(e) => setSel(seg.key, { meal_plan: e.target.value, cost_override: null })} disabled={!editable}>
                          <option value="">—</option>
                          {(meals.length ? MEAL_PLANS.filter((x) => meals.includes(x.value)) : MEAL_PLANS).map((x) => <option key={x.value} value={x.value}>{x.value}</option>)}
                        </Select>
                      </Field>
                      <Field label="Rooms"><Input type="number" min={1} value={sel.rooms} onChange={(e) => setSel(seg.key, { rooms: Number(e.target.value) })} disabled={!editable} /></Field>
                      <Field label="Extra adult"><Input type="number" min={0} value={sel.extra_adults} onChange={(e) => setSel(seg.key, { extra_adults: Number(e.target.value) })} disabled={!editable} /></Field>
                      <Field label="CWB / CNB">
                        <div className="flex gap-1">
                          <Input type="number" min={0} value={sel.cwb} onChange={(e) => setSel(seg.key, { cwb: Number(e.target.value) })} disabled={!editable} title="Child with bed" />
                          <Input type="number" min={0} value={sel.cnb} onChange={(e) => setSel(seg.key, { cnb: Number(e.target.value) })} disabled={!editable} title="Child without bed" />
                        </div>
                      </Field>
                    </div>
                  )}
                  {calc && (
                    <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500">
                      <span>
                        {calc.breakdown.map((b, k) => <span key={k} className={cn("mr-2", !b.rate && "font-medium text-rose-600")}>{b.date ? fmtDate(b.date).slice(0, 6) : `N${k + 1}`}: {b.rate ? inr(b.cost) : "no rate"}</span>)}
                      </span>
                      <span className="flex items-center gap-1">
                        Override ₹
                        <input type="number" className="h-7 w-24 rounded border border-slate-300 px-1" value={sel.cost_override ?? ""} placeholder="auto" disabled={!editable}
                          onChange={(e) => setSel(seg.key, { cost_override: e.target.value === "" ? null : Number(e.target.value) })} />
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </Card>

          {/* 4. INCLUSIONS */}
          <Card title="4 · Inclusions, exclusions & terms">
            <div className="space-y-5">
              <div>
                <p className="mb-2 flex items-center gap-1 text-sm font-semibold text-emerald-700"><Check className="h-4 w-4" /> Tour inclusions</p>
                <div className="flex flex-wrap gap-2">
                  {incFor("inclusion").map((x) => {
                    const on = incLines.includes(x.title.toLowerCase());
                    const paid = Number(x.cost_adult) > 0 || Number(x.cost_child) > 0;
                    return (
                      <label key={x.id} className={cn("flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm transition-colors", on ? "border-emerald-300 bg-emerald-50 text-emerald-800" : "border-slate-200 text-slate-700 hover:border-slate-300")}>
                        <input type="checkbox" checked={on} disabled={!editable} onChange={(e) => toggleLine("inclusions", x.title, e.target.checked)} className="h-4 w-4 accent-emerald-600" />
                        {x.title}
                        {paid && <span className="rounded bg-amber-100 px-1.5 text-[10px] font-semibold text-amber-800">+{inr(x.cost_adult)}/adult</span>}
                      </label>
                    );
                  })}
                  {incFor("inclusion").length === 0 && <p className="text-xs text-slate-500">Add ready-made inclusions in Masters → Inclusions / exclusions.</p>}
                </div>
                <Textarea rows={3} className="mt-2 text-sm" value={it.inclusions ?? ""} onChange={(e) => set("inclusions", e.target.value)} disabled={!editable} placeholder="Ticked items appear here — add any extra line (one per line)" />
              </div>
              <div>
                <p className="mb-2 flex items-center gap-1 text-sm font-semibold text-rose-600"><X className="h-4 w-4" /> Tour exclusions</p>
                <div className="flex flex-wrap gap-2">
                  {incFor("exclusion").map((x) => {
                    const on = excLines.includes(x.title.toLowerCase());
                    return (
                      <label key={x.id} className={cn("flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm", on ? "border-rose-200 bg-rose-50 text-rose-800" : "border-slate-200 text-slate-700")}>
                        <input type="checkbox" checked={on} disabled={!editable} onChange={(e) => toggleLine("exclusions", x.title, e.target.checked)} className="h-4 w-4 accent-rose-600" />
                        {x.title}
                      </label>
                    );
                  })}
                </div>
                <Textarea rows={3} className="mt-2 text-sm" value={it.exclusions ?? ""} onChange={(e) => set("exclusions", e.target.value)} disabled={!editable} />
              </div>
              <Field label="Terms, payment & cancellation policy">
                <Textarea rows={5} value={it.terms ?? ""} onChange={(e) => set("terms", e.target.value)} disabled={!editable} />
              </Field>
              <Field label="Cover image URL (optional banner)"><Input value={it.cover_image ?? ""} onChange={(e) => set("cover_image", e.target.value || null)} disabled={!editable} /></Field>
            </div>
          </Card>
        </div>

        {/* RIGHT: pricing */}
        <div className="space-y-5">
          <div className="space-y-5 xl:sticky xl:top-20">
            <Card title="Pricing">
              <div className="space-y-3 text-sm">
                <div className="space-y-1 rounded-lg bg-slate-50 p-2 text-xs">
                  <Row label={`Hotels (${auto.filter((x) => x.item_type === "hotel").length})`} value={inr(sum(allItems.filter((x) => x.item_type === "hotel")))} />
                  <Row label={`Vehicle – ${VEHICLE_TYPES.find((v) => v.value === it.vehicle_type)?.label ?? "none"}`} value={inr(sum(allItems.filter((x) => x.item_type === "transfer")))} />
                  <Row label="Activities & add-ons" value={inr(sum(allItems.filter((x) => x.item_type === "activity")))} />
                  <Row label="Flights / other" value={inr(sum(allItems.filter((x) => !["hotel", "transfer", "activity"].includes(x.item_type))))} />
                </div>
                <Row label="Net cost" value={inr(totals.cost_total)} strong />
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Markup type">
                    <Select value={it.markup_type} onChange={(e) => set("markup_type", e.target.value as "percent" | "fixed")} disabled={!editable}>
                      <option value="percent">% of cost</option><option value="fixed">Fixed ₹</option>
                    </Select>
                  </Field>
                  <Field label={it.markup_type === "percent" ? "Markup %" : "Markup ₹"}><Input type="number" value={it.markup_value} onChange={(e) => set("markup_value", Number(e.target.value))} disabled={!editable} /></Field>
                </div>
                <Row label="Markup / service fee" value={inr(totals.markup_total)} />
                <Field label="Discount ₹"><Input type="number" min={0} value={it.discount} onChange={(e) => set("discount", Number(e.target.value))} disabled={!editable} /></Field>
                <Row label="Package price (before tax)" value={inr(totals.subtotal)} strong />
                <div className="grid grid-cols-2 gap-2">
                  <Field label="GST %">
                    <Select value={it.gst_percent} onChange={(e) => set("gst_percent", Number(e.target.value))} disabled={!editable}>{[0, 5, 12, 18].map((g) => <option key={g} value={g}>{g}%</option>)}</Select>
                  </Field>
                  <Field label="GST on">
                    <Select value={it.gst_mode} onChange={(e) => set("gst_mode", e.target.value as "total" | "markup")} disabled={!editable}>
                      <option value="total">Whole package</option><option value="markup">Service fee only</option>
                    </Select>
                  </Field>
                </div>
                <Row label={`GST (${it.gst_percent}%)`} value={inr(totals.gst_total)} />
                <Field label="TCS % (foreign tours)">
                  <Select value={it.tcs_percent} onChange={(e) => set("tcs_percent", Number(e.target.value))} disabled={!editable}>{[0, 2, 5, 20].map((g) => <option key={g} value={g}>{g}%</option>)}</Select>
                </Field>
                {totals.tcs_total > 0 && <Row label="TCS" value={inr(totals.tcs_total)} />}
                <div className="rounded-lg bg-brand-50 p-3">
                  <Row label="Quote total" value={inr(totals.grand_total)} strong big />
                  {pax > 0 && <p className="mt-1 text-right text-xs text-brand-800">≈ {inr(totals.grand_total / Math.max(1, pax))} per person</p>}
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500">Your margin</span>
                  <span className={cn("font-semibold", totals.margin_percent < 5 ? "text-rose-600" : "text-emerald-600")}>{inr(totals.markup_total - totals.discount)} ({totals.margin_percent}%)</span>
                </div>
                {auto.some((x) => x.warn) && (
                  <div className="space-y-1 rounded-lg bg-amber-50 p-2 text-[11px] text-amber-800">
                    {auto.filter((x) => x.warn).map((x, k) => <p key={k} className="flex gap-1"><AlertTriangle className="h-3 w-3 shrink-0" /> {x.title}: {x.warn}</p>)}
                  </div>
                )}
                <label className="flex items-center gap-2 text-xs text-slate-600">
                  <input type="checkbox" checked={it.show_item_prices} onChange={(e) => set("show_item_prices", e.target.checked)} disabled={!editable} />
                  Show price of each service to the customer
                </label>
              </div>
            </Card>

            <Card title="Quote status">
              <div className="space-y-3">
                <Select value={it.status} onChange={(e) => set("status", e.target.value)} disabled={!editable}>
                  {QUOTE_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                </Select>
                {it.booking_id ? (
                  <Link href={`/bookings/${it.booking_id}`} className="flex items-center gap-2 rounded-lg bg-emerald-50 p-3 text-sm font-medium text-emerald-700"><CheckCircle2 className="h-4 w-4" /> Converted to booking — open</Link>
                ) : can("bookings", "create") && (
                  <Button variant="success" className="w-full" loading={converting} onClick={accept} disabled={!allItems.length}><CheckCircle2 className="h-4 w-4" /> Customer accepted → Create booking</Button>
                )}
                {editable && (
                  <Button variant="secondary" className="w-full" onClick={async () => { if (dirty) await save(true); try { router.push(`/itineraries/${await duplicateItinerary(it)}`); toast.success("New version created"); } catch (e: any) { toast.error(e.message); } }}>
                    <Files className="h-4 w-4" /> Revise (new version)
                  </Button>
                )}
                <Button variant="ghost" className="w-full" onClick={async () => { await navigator.clipboard.writeText(shareUrl); toast.success("Copied"); }}><Copy className="h-4 w-4" /> {shareUrl.replace(/^https?:\/\//, "").slice(0, 34)}…</Button>
                {can("itineraries", "delete") && !it.booking_id && (
                  <ConfirmButton className="w-full text-rose-600" label="Delete this itinerary?" onConfirm={async () => {
                    const { error } = await sb().from("itineraries").delete().eq("id", it.id);
                    if (error) { toast.error(error.message); return; }
                    setDirty(false);
                    router.replace(it.lead_id ? `/leads/${it.lead_id}` : "/itineraries");
                  }}><Trash2 className="h-4 w-4" /> Delete</ConfirmButton>
                )}
              </div>
            </Card>
            <p className="flex items-center gap-1 px-1 text-[11px] text-slate-400"><Users className="h-3 w-3" /> {pax} pax · {it.rooms} room(s) · {TRANSFER_TYPES.length} day-plan types in Masters</p>
          </div>
        </div>
      </div>

      <AddItemModal
        open={!!addFor}
        onClose={() => setAddFor(null)}
        masters={{ destinations: m.destinations, hotels: m.hotels, rates: m.rates, activities: m.activities, transfers: m.plans, suppliers: m.suppliers }}
        trip={{ start_date: it.start_date, nights: it.nights, adults: it.adults, children: it.children, rooms: it.rooms }}
        dayNo={addFor?.day ?? 1}
        item={addFor?.idx != null ? manual[addFor.idx] : null}
        onSave={(x) => {
          const clean = { ...x, id: undefined };
          if (addFor?.idx != null) setManual(manual.map((y, j) => (j === addFor.idx ? clean : y)));
          else setManual([...manual, clean]);
          touch();
        }}
      />
      <MessageComposer target={compose} onClose={() => setCompose(null)} />
    </>
  );
}

function blankDay(n: number, total: number): ItineraryDay {
  return { day_no: n, title: n === 1 ? "Arrival" : n === total ? "Departure" : `Day ${n}`, description: null, destination_id: null, meals: null, day_plan_id: null, stay_destination_id: null };
}

const sum = (xs: { cost: number }[]) => xs.reduce((a, x) => a + Number(x.cost), 0);

function AutoRow({ x }: { x: ItineraryItem & { warn?: string } }) {
  const Icon = ICON[x.item_type] ?? Files;
  const sub = x.item_type === "hotel"
    ? `${x.details?.room_type ?? ""} · ${x.details?.meal_plan ?? ""} · ${x.details?.nights}N · ${x.details?.rooms} room(s)`
    : x.item_type === "transfer" ? `${x.details?.vehicles ?? 1} vehicle(s)` : "add-on";
  return (
    <div className={cn("flex items-center gap-3 rounded-lg border px-3 py-2", x.warn ? "border-amber-200 bg-amber-50/50" : "border-slate-100 bg-slate-50/60")}>
      <Icon className="h-4 w-4 shrink-0 text-brand-600" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-slate-800">{x.title}</p>
        <p className="truncate text-xs text-slate-500">{sub}{x.warn ? ` · ${x.warn}` : ""}</p>
      </div>
      <p className="text-sm font-medium">{inr(x.cost)}</p>
      <span className="text-[10px] uppercase text-slate-400">auto</span>
    </div>
  );
}

function ItemRow({ x, editable, onEdit, onDelete }: { x: ItineraryItem; editable: boolean; onEdit: () => void; onDelete: () => void }) {
  const Icon = ICON[x.item_type] ?? Files;
  const sub =
    x.item_type === "hotel" ? `${x.details?.room_type ?? ""} · ${x.details?.meal_plan ?? ""} · ${x.details?.nights ?? 1}N · ${x.details?.rooms ?? 1} room(s)`
      : x.item_type === "transfer" ? `${x.details?.vehicles ?? 1} × ${x.details?.vehicle_type ?? "vehicle"}`
      : x.item_type === "activity" ? `${x.details?.adults ?? ""} adults${x.details?.children ? `, ${x.details.children} children` : ""}`
      : x.item_type === "flight" || x.item_type === "train" ? [x.details?.carrier, x.details?.number, x.details?.from && `${x.details.from} → ${x.details.to}`].filter(Boolean).join(" · ")
      : x.item_type;
  return (
    <div className="flex items-center gap-3 rounded-lg border border-slate-100 bg-white px-3 py-2">
      <Icon className="h-4 w-4 shrink-0 text-brand-600" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-slate-800">{x.title}</p>
        <p className="truncate text-xs text-slate-500">{sub}</p>
      </div>
      <div className="text-right">
        <p className="text-sm font-medium">{inr(x.cost)}</p>
        {x.markup != null && <p className="text-[11px] text-slate-500">+{inr(x.markup)} markup</p>}
      </div>
      {editable && (
        <div className="flex gap-0.5">
          <button onClick={onEdit} className="rounded p-1 text-slate-400 hover:bg-slate-100"><Pencil className="h-3.5 w-3.5" /></button>
          <button onClick={onDelete} className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600"><Trash2 className="h-3.5 w-3.5" /></button>
        </div>
      )}
    </div>
  );
}

function Row({ label, value, strong, big }: { label: string; value: string; strong?: boolean; big?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className={cn("text-slate-600", strong && "font-medium text-slate-800")}>{label}</span>
      <span className={cn(strong ? "font-semibold text-slate-900" : "text-slate-800", big && "text-lg")}>{value}</span>
    </div>
  );
}

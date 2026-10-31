"use client";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  AlertTriangle, ArrowLeft, ArrowRight, Bus, CalendarCheck, Car, CheckCircle2, CheckSquare, Copy, Eye, FileDown, Files, Gift, Image as ImageIcon,
  Info, Link2, Mail, MessageCircle, MinusCircle, PlusCircle, Save, Trash2, User, Users, XCircle, FileText, Calculator,
} from "lucide-react";
import { sb } from "@/lib/supabase/client";
import type { Destination, Hotel, InclusionItem, Itinerary, ItineraryDay, PickupPoint, Region, Transfer, TransferRate, Vehicle } from "@/lib/types";
import type { HotelRate } from "@/lib/pricing";
import { addDaysIso, nightsBetween } from "@/lib/pricing";
import {
  categoriesFor, computePackage, hotelsFor, lines, missingSteps, nightsLabel, normVehicles, occupancy, placeOptions, regionCityIds, regionInclusions,
  resizeDays, roomTypesFor, setDay as cascadeDay, shortDate, stayOptions, type Masters,
} from "@/lib/package";
import { appUrl, cn, inr, isoDate } from "@/lib/utils";
import { convertToBooking, duplicateItinerary } from "@/lib/actions";
import { Guard, useAuth } from "@/components/auth";
import { GalleryModal, RichText } from "@/components/gallery";
import { MessageComposer, type ComposeTarget } from "@/components/message-composer";
import { Badge, Button, ConfirmButton, Modal, Spinner } from "@/components/ui";

export default function PackageComposerPage() {
  return <Guard module="itineraries"><Composer /></Guard>;
}

type All = Masters & { regions: Region[] };
const STATUS: Record<string, { label: string; cls: string }> = {
  draft: { label: "Underprocess", cls: "bg-sky-100 text-sky-700" },
  sent: { label: "Underprocess", cls: "bg-sky-100 text-sky-700" },
  accepted: { label: "Confirmed", cls: "bg-emerald-100 text-emerald-700" },
  rejected: { label: "Rejected", cls: "bg-rose-100 text-rose-700" },
};

function Composer() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { can, settings } = useAuth();
  const [it, setIt] = useState<Itinerary | null>(null);
  const [days, setDays] = useState<ItineraryDay[]>([]);
  const [m, setM] = useState<All | null>(null);
  const [contact, setContact] = useState<{ name: string; phone: string | null; email: string | null } | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [converting, setConverting] = useState(false);
  const [compose, setCompose] = useState<ComposeTarget | null>(null);
  const [gallery, setGallery] = useState<{ title: string; images: string[] } | null>(null);
  const [details, setDetails] = useState<{ title: string; body: ReactNode } | null>(null);
  const editable = (can("itineraries", "edit") || can("itineraries", "create")) && !it?.booking_id;

  useEffect(() => {
    (async () => {
      const supa = sb();
      const [i, d, de, ho, ra, tr, trr, ve, inc, pp, rg] = await Promise.all([
        supa.from("itineraries").select("*").eq("id", id).single(),
        supa.from("itinerary_days").select("*").eq("itinerary_id", id).order("day_no"),
        supa.from("destinations").select("*").order("name"),
        supa.from("hotels").select("*").order("name"),
        supa.from("hotel_rates").select("*"),
        supa.from("transfers").select("*").order("sort").order("name"),
        supa.from("transfer_rates").select("*"),
        supa.from("vehicles").select("*").eq("is_active", true).order("sort").order("name"),
        supa.from("inclusion_items").select("*").eq("is_active", true).order("sort").order("title"),
        supa.from("pickup_points").select("*").order("sort").order("name"),
        supa.from("regions").select("*").order("sort").order("name"),
      ]);
      if (i.error) return toast.error(i.error.message);
      const missing = [trr, ve, pp].find((x) => x.error);
      if (missing?.error) toast.error("Run supabase/005_portal.sql in Supabase — " + missing.error.message);
      const raw = {
        meal_plan: "MAP", extra_beds: 0, child_no_bed: 0, vehicle_list: [], adults_above10: 0, kids: 0, include_gst: false, margin_amount: 0, ...i.data,
      } as Itinerary;
      const masters: All = {
        destinations: (de.data ?? []) as Destination[], hotels: (ho.data ?? []) as Hotel[], rates: (ra.data ?? []) as HotelRate[],
        plans: ((tr.data ?? []) as Transfer[]).map((p) => ({ ...p, images: p.images ?? [], stay_options: p.stay_options ?? [] })),
        planRates: (trr.data ?? []) as TransferRate[], vehicles: (ve.data ?? []) as Vehicle[], inclusions: (inc.data ?? []) as InclusionItem[],
        points: (pp.data ?? []) as PickupPoint[], regions: (rg.data ?? []) as Region[],
      };
      raw.vehicle_list = normVehicles(raw.vehicle_list, masters.vehicles);
      if (!raw.vehicle_list.length && masters.vehicles[0]) raw.vehicle_list = [{ vehicle_id: masters.vehicles[0].id, ac: false }];
      setIt(raw);
      const rows = ((d.data ?? []) as ItineraryDay[]).map((x) => ({
        ...x, day_plan_id: x.day_plan_id ?? null, stay_destination_id: x.stay_destination_id ?? null, hotel_category: x.hotel_category ?? null,
        hotel_id: x.hotel_id ?? null, room_type: x.room_type ?? null,
      }));
      setDays(resizeDays(rows, raw.nights));
      setM(masters);
      if (raw.contact_id) setContact((await supa.from("contacts").select("name, phone, email").eq("id", raw.contact_id).single()).data);
    })();
  }, [id]);

  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => { if (dirty) { e.preventDefault(); e.returnValue = ""; } };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  const pkg = useMemo(() => (it && m ? computePackage(it, days, m) : null), [it, days, m]);
  if (!it || !m || !pkg) return <Spinner />;

  const region = m.regions.find((r) => r.id === it.region_id) ?? null;
  const cities = regionCityIds(it.region_id, m.destinations);
  const points = m.points.filter((p) => !it.region_id || p.region_id === it.region_id);
  const destName = (dId: string | null | undefined) => m.destinations.find((d) => d.id === dId)?.name ?? "";
  const minN = Math.max(1, region?.min_nights ?? 1);
  const maxN = Math.max(minN, region?.max_nights ?? 15);
  const ctx = { nights: it.nights, it, m };
  const touch = () => setDirty(true);
  const patch = (p: Partial<Itinerary>) => { setIt({ ...it, ...p }); touch(); };

  function persons(p: Partial<Pick<Itinerary, "adults" | "adults_above10" | "kids">>) {
    const next = { adults: it!.adults, adults_above10: it!.adults_above10, kids: it!.kids, ...p };
    const o = occupancy(next.adults, next.adults_above10, next.kids);
    patch({ ...next, children: next.adults_above10 + next.kids, rooms: o.rooms, extra_beds: o.extra, child_no_bed: o.cnb });
  }

  function dates(start: string | null, end: string | null) {
    let s = start, e = end;
    if (s && (!e || nightsBetween(s, e) < minN)) e = addDaysIso(s, Math.max(minN, 2));
    if (s && e && nightsBetween(s, e) > maxN) e = addDaysIso(s, maxN);
    const nights = s && e ? nightsBetween(s, e) : it!.nights;
    setIt({ ...it!, start_date: s, end_date: e, nights });
    setDays(resizeDays(days, nights));
    touch();
  }

  function changeDay(i: number, p: Partial<ItineraryDay>) {
    setDays(cascadeDay(days, i, p, ctx));
    touch();
  }

  function setPoint(kind: "pickup" | "drop", pid: string) {
    const p = m!.points.find((x) => x.id === pid);
    if (kind === "pickup") {
      setIt({ ...it!, pickup_point_id: pid || null, pickup_point: p?.name ?? null });
      // day 1 starts from the pickup city — clear it if it no longer fits
      setDays(days.map((d, i) => (i === 0 ? { ...d, day_plan_id: null } : d)));
    } else setIt({ ...it!, drop_point_id: pid || null, drop_point: p?.name ?? null });
    touch();
  }

  function setVehicles(rows: { vehicle_id: string; ac: boolean }[]) { patch({ vehicle_list: rows }); }

  function toggleInclusion(title: string, on: boolean) {
    const cur = lines(it!.inclusions).filter((l) => l.toLowerCase() !== title.toLowerCase());
    patch({ inclusions: (on ? [...cur, title] : cur).join("\n") });
  }

  async function save(silent = false) {
    if (!it || !pkg) return false;
    setSaving(true);
    const supa = sb();
    const gstPct = it.include_gst ? (Number(it.gst_percent) || settings.default_gst_percent) : 0;
    const { error } = await supa.from("itineraries").update({
      client_name: it.client_name, title: it.title, destination: region?.name ?? it.destination, region_id: it.region_id,
      start_date: it.start_date || null, end_date: it.start_date ? addDaysIso(it.start_date, it.nights) : null, nights: it.nights,
      adults: it.adults, adults_above10: it.adults_above10, kids: it.kids, children: it.adults_above10 + it.kids, infants: it.infants,
      rooms: it.rooms, extra_beds: it.extra_beds, child_no_bed: it.child_no_bed, meal_plan: it.meal_plan,
      pickup_point_id: it.pickup_point_id, pickup_point: it.pickup_point, drop_point_id: it.drop_point_id, drop_point: it.drop_point,
      vehicle_list: it.vehicle_list, inclusions: it.inclusions, exclusions: it.exclusions, terms: it.terms, overview: it.overview,
      include_gst: it.include_gst, margin_amount: Number(it.margin_amount) || 0, markup_type: "fixed", markup_value: Number(it.margin_amount) || 0,
      discount: 0, gst_percent: gstPct, gst_mode: "total", tcs_percent: 0,
      cost_total: pkg.cost, markup_total: pkg.margin, gst_total: it.include_gst ? pkg.gst : 0, tcs_total: 0, grand_total: pkg.total,
      agent_note: it.agent_note, status: it.status === "rejected" ? "draft" : it.status,
    }).eq("id", it.id);
    if (error) { setSaving(false); toast.error(error.message); return false; }
    await supa.from("itinerary_days").delete().eq("itinerary_id", it.id);
    const r1 = await supa.from("itinerary_days").insert(days.map((d, i) => {
      const plan = m!.plans.find((p) => p.id === d.day_plan_id);
      return {
        itinerary_id: it.id, day_no: i + 1, title: plan?.name ?? d.title ?? `Day ${i + 1}`, description: plan?.description ?? d.description,
        destination_id: plan?.destination_id ?? d.destination_id, meals: d.meals, day_plan_id: d.day_plan_id, stay_destination_id: d.stay_destination_id,
        hotel_category: d.hotel_category, hotel_id: d.hotel_id, room_type: d.room_type,
      };
    }));
    if (r1.error) { setSaving(false); toast.error(r1.error.message); return false; }
    await supa.from("itinerary_items").delete().eq("itinerary_id", it.id);
    if (pkg.lines.length) {
      const r2 = await supa.from("itinerary_items").insert(pkg.lines.map((x, k) => ({
        itinerary_id: it.id, day_no: x.day_no, sort: k, item_type: x.kind === "addon" ? "activity" : x.kind, ref_id: x.ref_id, supplier_id: x.supplier_id,
        title: x.title, details: x.details, qty: 1, unit_cost: x.cost, cost: x.cost, markup: null,
      })));
      if (r2.error) { setSaving(false); toast.error(r2.error.message); return false; }
    }
    setIt({ ...it, gst_percent: gstPct || it.gst_percent, status: it.status === "rejected" ? "draft" : it.status });
    setSaving(false);
    setDirty(false);
    if (!silent) {
      const miss = missingSteps(it, days);
      if (miss.length) toast.warning(`Saved. Still to fill: ${miss.slice(0, 3).join(", ")}${miss.length > 3 ? ` +${miss.length - 3} more` : ""}`);
      else toast.success(`Package saved — amount ${inr(pkg.total)}`);
    }
    return true;
  }

  const shareUrl = `${appUrl()}/share/itinerary/${it.share_token}`;
  const openView = async (print = false) => { if (dirty && editable) await save(true); window.open(`/share/itinerary/${it.share_token}${print ? "?print=1" : ""}`, "_blank"); };
  const markSent = async () => { if (it.status === "draft") { setIt({ ...it, status: "sent" }); await sb().from("itineraries").update({ status: "sent" }).eq("id", it.id); } };

  async function confirmBooking() {
    if (editable && !(await save(true))) return;
    const miss = missingSteps(it!, days);
    if (miss.length) { toast.error(`Complete the package first: ${miss.slice(0, 3).join(", ")}`); return; }
    setConverting(true);
    try {
      const items = (await sb().from("itinerary_items").select("*").eq("itinerary_id", it!.id).order("sort")).data ?? [];
      const bId = await convertToBooking({ ...it!, markup_type: "fixed", markup_value: it!.margin_amount, gst_percent: it!.include_gst ? it!.gst_percent : 0, tcs_percent: 0, discount: 0 }, items);
      toast.success("Package confirmed — booking created");
      router.push(`/bookings/${bId}`);
    } catch (e: any) {
      toast.error(e.message);
      setConverting(false);
    }
  }

  const incChips = regionInclusions(it, m, "inclusion");
  const ticked = new Set(lines(it.inclusions).map((l) => l.toLowerCase()));
  const vrows = normVehicles(it.vehicle_list, m.vehicles);
  const today = isoDate();
  const st = STATUS[it.status] ?? STATUS.draft;

  return (
    <div className="pb-24">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <Link href={it.lead_id ? `/leads/${it.lead_id}` : "/itineraries"} className="rounded-lg border border-slate-200 bg-white p-2 text-slate-500 hover:text-slate-800"><ArrowLeft className="h-4 w-4" /></Link>
          <div className="min-w-0">
            <h1 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-slate-700"><Gift className="h-4 w-4" /> {it.client_name ? "Package" : "Create new package"} <Badge className={st.cls}>{st.label}</Badge></h1>
            <p className="truncate text-xs text-slate-500">
              Query <b>{it.quote_no}</b>{it.version > 1 ? ` · v${it.version}` : ""} · {region?.name ?? "No destination"}{contact ? ` · ${contact.name}` : ""}
              {dirty && <span className="ml-2 font-medium text-amber-600">● unsaved changes</span>}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" onClick={() => openView()}><Eye className="h-4 w-4" /> Package</Button>
          <Button size="sm" variant="secondary" onClick={() => openView(true)}><FileDown className="h-4 w-4" /> PDF</Button>
          <Button size="sm" variant="secondary" onClick={async () => { if (dirty && editable) await save(true); await navigator.clipboard.writeText(shareUrl); toast.success("Package link copied"); markSent(); }}><Link2 className="h-4 w-4" /> Link</Button>
          <Button size="sm" variant="secondary" onClick={async () => { if (dirty && editable) await save(true); markSent(); setCompose({ channel: "whatsapp", name: it.client_name ?? contact?.name ?? "", phone: contact?.phone, leadId: it.lead_id, vars: { destination: region?.name ?? it.destination, link: shareUrl, amount: pkg.total } }); }}><MessageCircle className="h-4 w-4 text-emerald-600" /> WhatsApp</Button>
          <Button size="sm" variant="secondary" onClick={async () => { if (dirty && editable) await save(true); markSent(); setCompose({ channel: "email", name: it.client_name ?? contact?.name ?? "", email: contact?.email, leadId: it.lead_id, subject: `${it.title} – ${settings.company_name}`, vars: { destination: region?.name ?? it.destination, link: shareUrl } }); }}><Mail className="h-4 w-4" /> Email</Button>
          {can("itineraries", "create") && <Button size="sm" variant="secondary" onClick={async () => { if (dirty && editable) await save(true); try { router.push(`/itineraries/${await duplicateItinerary(it)}`); toast.success("Copy created"); } catch (e: any) { toast.error(e.message); } }}><Files className="h-4 w-4" /> Copy</Button>}
          {can("itineraries", "delete") && !it.booking_id && (
            <ConfirmButton size="sm" variant="secondary" className="text-rose-600" label="Delete package?" onConfirm={async () => {
              const { error } = await sb().from("itineraries").delete().eq("id", it.id);
              if (error) { toast.error(error.message); return; }
              setDirty(false); router.replace("/itineraries");
            }}><Trash2 className="h-4 w-4" /></ConfirmButton>
          )}
        </div>
      </div>

      {it.booking_id && (
        <Link href={`/bookings/${it.booking_id}`} className="mb-4 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-medium text-emerald-700"><CheckCircle2 className="h-4 w-4" /> Package confirmed — open booking</Link>
      )}

      <fieldset disabled={!editable} className="space-y-3">
        {/* CLIENT DETAILS */}
        <Section icon={User} title="Client Details">
          <div className="grid gap-3 md:grid-cols-3">
            <F label="Client Name" tip="Name of the guest this package is for." ok={!!it.client_name?.trim()}>
              <input aria-label="Client Name" className={inp(!!it.client_name?.trim())} value={it.client_name ?? ""} placeholder="Client Name" onChange={(e) => patch({ client_name: e.target.value })} />
            </F>
            <F label="Pick Up Point" tip="Where the tour starts (day 1 places start from this city)." ok={!!it.pickup_point_id}>
              <select aria-label="Pick Up Point" className={inp(!!it.pickup_point_id)} value={it.pickup_point_id ?? ""} onChange={(e) => setPoint("pickup", e.target.value)}>
                <option value="">Select pick up point</option>
                {points.filter((p) => p.is_pickup).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </F>
            <F label="Drop Down Point" tip="Package ends on the last day here." ok={!!it.drop_point_id}>
              <select aria-label="Drop Down Point" className={inp(!!it.drop_point_id)} value={it.drop_point_id ?? ""} onChange={(e) => setPoint("drop", e.target.value)}>
                <option value="">Select drop point</option>
                {points.filter((p) => p.is_drop).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </F>
          </div>
          {points.length === 0 && <p className="mt-2 text-xs text-amber-700">No pickup / drop points for {region?.name ?? "this destination"} yet — add them in Masters → Regions / packages.</p>}
        </Section>

        {/* TOUR DATES */}
        <Section icon={CalendarCheck} title="Tour Dates & Persons">
          <div className="grid gap-3 md:grid-cols-3">
            <F label="Arrival Date:" ok={!!it.start_date}>
              <input aria-label="Arrival Date" type="date" className={inp(!!it.start_date)} min={it.status === "draft" ? today : undefined} value={it.start_date ?? ""}
                onChange={(e) => dates(e.target.value || null, it.end_date ?? (it.start_date ? addDaysIso(it.start_date, it.nights) : null))} />
            </F>
            <F label="Departure Date:" ok={!!it.start_date}>
              <input aria-label="Departure Date" type="date" className={inp(!!it.start_date)} disabled={!it.start_date}
                min={it.start_date ? addDaysIso(it.start_date, minN) : undefined} max={it.start_date ? addDaysIso(it.start_date, maxN) : undefined}
                value={it.start_date ? addDaysIso(it.start_date, it.nights) : ""} onChange={(e) => dates(it.start_date, e.target.value || null)} />
            </F>
            <F label="Total Days:" tip="Total number of nights & days.">
              <div className="flex h-10 items-center rounded-lg bg-sky-500 px-3 text-sm font-semibold text-white">{nightsLabel(it.nights)}</div>
            </F>
          </div>
          {!it.start_date && (
            <div className="mt-2 flex items-center gap-2 text-xs text-slate-500">
              No dates yet? Nights:
              <select className="h-7 rounded border border-slate-300 px-1" value={it.nights} onChange={(e) => { const n = Number(e.target.value); setIt({ ...it, nights: n }); setDays(resizeDays(days, n)); touch(); }}>
                {Array.from({ length: maxN - minN + 1 }, (_, k) => minN + k).map((n) => <option key={n} value={n}>{nightsLabel(n)}</option>)}
              </select>
            </div>
          )}
        </Section>

        {/* PERSONS & ROOMS */}
        <Section icon={Users} title="Persons & Rooms">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <F label="Adult Persons:" tip="Adults considered in rooms (2 per room)." ok={it.adults > 0}>
              <input aria-label="Adult Persons" type="number" min={1} className={inp(it.adults > 0)} value={it.adults} onChange={(e) => persons({ adults: Math.max(0, Number(e.target.value)) })} />
            </F>
            <F label="Adults ( Above 10 Years)" tip="Extra persons above 10 years — they get an extra bed.">
              <input type="number" min={0} className={inp(true)} aria-label="Adults above 10" value={it.adults_above10} onChange={(e) => persons({ adults_above10: Math.max(0, Number(e.target.value)) })} />
            </F>
            <F label="Kid (05 to 10 Years)" tip="Kids sharing bed with the family (child no bed).">
              <input type="number" min={0} className={inp(true)} aria-label="Kids 5-10" value={it.kids} onChange={(e) => persons({ kids: Math.max(0, Number(e.target.value)) })} />
            </F>
            <F label="Total Persons:"><div className="flex h-10 items-center rounded-lg bg-sky-500 px-3 text-sm font-semibold text-white">{it.adults + it.adults_above10 + it.kids}</div></F>
            <F label="Rooms Required:" tip="Auto: adults ÷ 2. Change if needed.">
              <select className={cn(inp(true), "bg-sky-500 font-semibold text-white")} aria-label="Rooms Required" value={it.rooms} onChange={(e) => patch({ rooms: Number(e.target.value) })}>
                {Array.from({ length: 60 }, (_, k) => k + 1).map((n) => <option key={n} value={n} className="text-slate-900">{n}</option>)}
              </select>
            </F>
            <F label="Extra Beds:">
              <select className={cn(inp(true), "bg-sky-500 font-semibold text-white")} aria-label="Extra Beds" value={it.extra_beds} onChange={(e) => patch({ extra_beds: Number(e.target.value) })}>
                {Array.from({ length: 61 }, (_, k) => k).map((n) => <option key={n} value={n} className="text-slate-900">{n}</option>)}
              </select>
            </F>
            <F label="Child (No Bed):">
              <select className={cn(inp(true), "bg-sky-500 font-semibold text-white")} aria-label="Child No Bed" value={it.child_no_bed} onChange={(e) => patch({ child_no_bed: Number(e.target.value) })}>
                {Array.from({ length: 61 }, (_, k) => k).map((n) => <option key={n} value={n} className="text-slate-900">{n}</option>)}
              </select>
            </F>
            <F label="Meal Plan:">
              <div className="flex h-10 items-center justify-center gap-4 rounded-lg bg-sky-500 px-3 text-sm font-semibold text-white">
                {["MAP", "CP"].map((mp) => (
                  <label key={mp} className="flex cursor-pointer items-center gap-1"><input type="radio" name="meal" checked={it.meal_plan === mp} onChange={() => patch({ meal_plan: mp })} /> {mp}</label>
                ))}
              </div>
            </F>
          </div>
        </Section>

        {/* VEHICLES */}
        <Section icon={Car} title="Vehicle Selection" tip="Add one row per vehicle. Cost per day comes from Masters → Places.">
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold text-slate-600"><tr><th className="w-14 px-3 py-2">Sno</th><th className="px-3 py-2">Vehicle</th><th className="px-3 py-2">AC/Type</th><th className="w-20" /></tr></thead>
              <tbody>
                {vrows.map((v, k) => (
                  <tr key={k} className="border-t border-slate-100">
                    <td className="px-3 py-2">{k + 1}</td>
                    <td className="px-3 py-2">
                      <select aria-label={`Vehicle ${k + 1}`} className={inp(true)} value={v.vehicle_id} onChange={(e) => setVehicles(vrows.map((x, j) => (j === k ? { ...x, vehicle_id: e.target.value } : x)))}>
                        {m.vehicles.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                      </select>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex gap-3 text-xs">
                        <label className="flex items-center gap-1"><input type="radio" checked={!v.ac} onChange={() => setVehicles(vrows.map((x, j) => (j === k ? { ...x, ac: false } : x)))} /> Without AC</label>
                        <label className="flex items-center gap-1"><input type="radio" checked={v.ac} onChange={() => setVehicles(vrows.map((x, j) => (j === k ? { ...x, ac: true } : x)))} /> AC</label>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right">
                      {k === 0 ? (
                        <button type="button" title="Add vehicle" className="rounded-lg bg-brand-600 p-1.5 text-white hover:bg-brand-700" onClick={() => m.vehicles[0] && setVehicles([...vrows, { vehicle_id: v.vehicle_id || m.vehicles[0].id, ac: false }])}><PlusCircle className="h-4 w-4" /></button>
                      ) : (
                        <button type="button" title="Remove" className="rounded-lg bg-rose-500 p-1.5 text-white hover:bg-rose-600" onClick={() => setVehicles(vrows.filter((_, j) => j !== k))}><MinusCircle className="h-4 w-4" /></button>
                      )}
                    </td>
                  </tr>
                ))}
                {vrows.length === 0 && (
                  <tr><td colSpan={4} className="px-3 py-3 text-xs text-slate-500">No vehicle. {m.vehicles[0] ? <button type="button" className="font-medium text-brand-700" onClick={() => setVehicles([{ vehicle_id: m.vehicles[0].id, ac: false }])}>Add vehicle</button> : "Add vehicles in Masters → Vehicles."}</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Section>

        {/* TOUR DAYS */}
        <Section icon={Bus} title="Tour Days" green>
          <div className="divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200">
            {days.map((d, i) => {
              const last = i >= it.nights;
              const opts = placeOptions(i, it.nights, days, it, m);
              const plan = m.plans.find((p) => p.id === d.day_plan_id);
              const stays = stayOptions(plan);
              const cats = categoriesFor(d.stay_destination_id, m.hotels);
              const hs = hotelsFor(d.stay_destination_id, d.hotel_category, m.hotels);
              const rooms = roomTypesFor(d.hotel_id, m.rates, it.meal_plan);
              const hotel = m.hotels.find((h) => h.id === d.hotel_id);
              const date = it.start_date ? addDaysIso(it.start_date, i) : null;
              return (
                <div key={i} className={cn("p-3", i % 2 === 0 ? "bg-slate-100/70" : "bg-white")}>
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="flex items-center gap-2">
                      <span className="flex h-10 w-10 flex-col items-center justify-center rounded-full bg-[#1e3a5f] text-white"><span className="text-[8px] leading-none">Day</span><b className="text-sm leading-none">{i + 1}</b></span>
                      <span className="w-20 text-sm font-semibold text-slate-700">{date ? shortDate(date) : `Day ${i + 1}`}</span>
                    </div>
                    <div className="flex min-w-[260px] flex-1 items-center gap-2">
                      <span className="hidden items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-2 text-xs text-slate-600 sm:flex">{last ? "Drop" : "Place to Visit"} <ArrowRight className="h-3 w-3" /></span>
                      <select aria-label={`Day ${i + 1} place`} className={inp(!!d.day_plan_id)} value={d.day_plan_id ?? ""} onChange={(e) => changeDay(i, { day_plan_id: e.target.value || null })}>
                        <option value="">Select Place</option>
                        {opts.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                        {plan && !opts.some((p) => p.id === plan.id) && <option value={plan.id}>{plan.name}</option>}
                      </select>
                    </div>
                    <div className="flex gap-1">
                      <button type="button" disabled={false} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700 hover:bg-slate-50"
                        onClick={() => setGallery({ title: hotel?.name ?? plan?.name ?? `Day ${i + 1}`, images: [...(hotel?.images ?? []), ...(plan?.images ?? [])] })}><ImageIcon className="h-3.5 w-3.5" /> Images</button>
                      <button type="button" disabled={false} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700 hover:bg-slate-50"
                        onClick={() => setDetails({
                          title: hotel?.name ?? plan?.name ?? `Day ${i + 1}`,
                          body: (
                            <div className="space-y-4 text-sm text-slate-700">
                              {hotel && <div><p className="mb-1 font-semibold text-slate-900">{hotel.name} {hotel.category ? <Badge>{hotel.category}</Badge> : null}</p><RichText text={hotel.description || hotel.notes || "No description added yet (Masters → Hotels)."} /></div>}
                              {plan && <div><p className="mb-1 font-semibold text-slate-900">{plan.name}</p><RichText text={plan.description || "No description added yet."} /></div>}
                              {!hotel && !plan && <p>Select a place and hotel first.</p>}
                            </div>
                          ),
                        })}><FileText className="h-3.5 w-3.5" /> Details</button>
                    </div>
                  </div>
                  {last ? (
                    <div className="mt-2 flex flex-wrap items-center gap-2 pl-[52px] text-xs">
                      <span className="rounded-lg bg-white px-3 py-2 font-medium text-slate-700 shadow-sm">{it.drop_point ?? "Drop point"}</span>
                      {opts.length === 0 && <span className="text-amber-700">Add a “Drop” place (type: Departure) for {destName(days[i - 1]?.stay_destination_id) || "this city"} in Masters → Places.</span>}
                    </div>
                  ) : (
                    <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                      <F label="Night Stay" small>
                        <select aria-label={`Day ${i + 1} night stay`} className={inp(!!d.stay_destination_id)} value={d.stay_destination_id ?? ""} disabled={!plan} onChange={(e) => changeDay(i, { stay_destination_id: e.target.value || null })}>
                          <option value="">Select Night Stay</option>
                          {stays.map((s) => <option key={s} value={s}>{destName(s)}</option>)}
                        </select>
                      </F>
                      <F label="Hotel Category" small>
                        <select aria-label={`Day ${i + 1} hotel category`} className={inp(!!d.hotel_category)} value={d.hotel_category ?? ""} disabled={!d.stay_destination_id} onChange={(e) => changeDay(i, { hotel_category: e.target.value || null })}>
                          <option value="">Select HotelCategory</option>
                          {cats.map((c) => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </F>
                      <F label="Hotel" small>
                        <select aria-label={`Day ${i + 1} hotel`} className={inp(!!d.hotel_id)} value={d.hotel_id ?? ""} disabled={!d.stay_destination_id} onChange={(e) => changeDay(i, { hotel_id: e.target.value || null })}>
                          <option value="">Select Hotel</option>
                          {hs.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
                          {hotel && !hs.some((h) => h.id === hotel.id) && <option value={hotel.id}>{hotel.name}</option>}
                        </select>
                      </F>
                      <F label="Room Type" small>
                        <select aria-label={`Day ${i + 1} room type`} className={inp(!!d.room_type)} value={d.room_type ?? ""} disabled={!d.hotel_id} onChange={(e) => changeDay(i, { room_type: e.target.value || null })}>
                          <option value="">Select RoomType</option>
                          {rooms.map((r) => <option key={r} value={r}>{r}</option>)}
                          {d.room_type && !rooms.includes(d.room_type) && <option value={d.room_type}>{d.room_type}</option>}
                        </select>
                      </F>
                      {d.stay_destination_id && cats.length === 0 && <p className="text-xs text-amber-700 sm:col-span-2 lg:col-span-4">No hotels in {destName(d.stay_destination_id)} yet — add them in Masters → Hotels.</p>}
                      {hotel && rooms.length === 0 && (
                        <p className="text-xs text-amber-700 sm:col-span-2 lg:col-span-4">
                          {hotel.name} has no room rates yet, so Room Type is empty —{" "}
                          <a href="/masters?tab=hotels" target="_blank" rel="noreferrer" className="font-semibold underline">add rates in Masters → Hotels → Rates</a> (room type + MAP/CP price), then reload this page.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          {cities && cities.size === 0 && <p className="mt-2 text-xs text-amber-700">No cities are linked to {region?.name} yet — Masters → Destinations.</p>}
        </Section>

        {/* INCLUSIONS / EXCLUSIONS */}
        <Section icon={CheckSquare} title="Tour Inclusions" tip="Unticked inclusions are shown in the package as exclusions.">
          <div className="flex flex-wrap gap-2">
            {incChips.map((x) => {
              const on = ticked.has(x.title.toLowerCase());
              return (
                <label key={x.id} className={cn("flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-xs font-medium", on ? "border-emerald-300 bg-emerald-50 text-emerald-800" : "border-slate-200 bg-white text-slate-600")}>
                  <input type="checkbox" className="h-4 w-4 accent-emerald-600" checked={on} onChange={(e) => toggleInclusion(x.title, e.target.checked)} />
                  {x.title}{Number(x.cost_adult) > 0 && <span className="text-[10px] text-slate-400">+{inr(x.cost_adult)}/person</span>}
                </label>
              );
            })}
            {incChips.length === 0 && <p className="text-xs text-slate-500">Add inclusions for {region?.name ?? "this destination"} in Masters → Inclusions / exclusions.</p>}
          </div>
          <div className="mt-4">
            <p className="mb-2 flex items-center gap-1 text-xs font-bold uppercase text-rose-600"><XCircle className="h-4 w-4" /> Tour Exclusions</p>
            <ul className="space-y-1 text-sm text-slate-700">
              {lines(it.exclusions).map((l, k) => <li key={k} className="flex gap-2"><span className="font-bold text-rose-600">✖</span>{l}</li>)}
              {lines(it.exclusions).length === 0 && <li className="text-xs text-slate-400">No exclusions</li>}
            </ul>
          </div>
        </Section>

        {/* CALCULATE */}
        <Section icon={Calculator} title="Calculate & Save">
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="space-y-3">
              <label className="flex items-center gap-2 text-sm font-semibold text-brand-700"><input type="checkbox" className="h-4 w-4" checked={it.include_gst} onChange={(e) => patch({ include_gst: e.target.checked, gst_percent: Number(it.gst_percent) || settings.default_gst_percent })} /> Include GST ({Number(it.gst_percent) || settings.default_gst_percent}%)</label>
              <F label="Margin Amount (₹)">
                <input aria-label="Margin Amount" type="number" min={0} className={inp(true)} value={it.margin_amount} onChange={(e) => patch({ margin_amount: Math.max(0, Number(e.target.value)) })} />
              </F>
              <F label="Note (internal)">
                <textarea rows={2} className={cn(inp(true), "h-auto py-2")} value={it.agent_note ?? ""} placeholder="write a note…" onChange={(e) => patch({ agent_note: e.target.value })} />
              </F>
            </div>
            <div className="rounded-xl bg-slate-50 p-3 text-sm">
              <Row label={`Hotels (${pkg.lines.filter((l) => l.kind === "hotel").length} stays)`} value={inr(pkg.hotel)} />
              <Row label="Transport" value={inr(pkg.transport)} />
              <Row label="Add-ons (tickets)" value={inr(pkg.addons)} />
              <div className="my-1 border-t border-slate-200" />
              <Row label="Net cost" value={inr(pkg.cost)} bold />
              <Row label="Margin" value={inr(pkg.margin)} />
              {it.include_gst && <Row label={`GST ${it.gst_percent || settings.default_gst_percent}%`} value={inr(pkg.gst)} />}
            </div>
            <div className="flex flex-col justify-between gap-3 rounded-xl bg-gradient-to-br from-[#0f2a4a] to-brand-700 p-4 text-white">
              <div>
                <p className="text-xs uppercase tracking-widest text-white/70">Package Amount</p>
                <p className="text-3xl font-black text-gold-400">{inr(pkg.total)}</p>
                <p className="text-xs text-white/70">{nightsLabel(it.nights)} · {it.adults + it.adults_above10 + it.kids} persons{it.adults + it.adults_above10 > 0 ? ` · ≈ ${inr(pkg.total / (it.adults + it.adults_above10))}/adult` : ""}</p>
              </div>
              {editable && <Button onClick={() => save()} loading={saving} className="bg-gold-500 text-slate-900 hover:bg-gold-400"><Save className="h-4 w-4" /> Calculate &amp; Save</Button>}
            </div>
          </div>
          {pkg.warnings.length > 0 && (
            <div className="mt-3 space-y-1 rounded-lg bg-amber-50 p-3 text-xs text-amber-800">
              {pkg.warnings.map((w, k) => <p key={k} className="flex gap-1"><AlertTriangle className="h-3.5 w-3.5 shrink-0" /> {w}</p>)}
            </div>
          )}
        </Section>
      </fieldset>

      {!it.booking_id && can("bookings", "create") && it.status !== "rejected" && (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-emerald-200 bg-white p-3">
          <p className="flex-1 text-sm text-slate-600">Client agreed? Confirm the package — a booking with hotel &amp; cab services is created for operations, invoices and vouchers.</p>
          <ConfirmButton variant="success" loading={converting} label="Confirm package & create booking?" onConfirm={confirmBooking}><CheckCircle2 className="h-4 w-4" /> Confirm package</ConfirmButton>
        </div>
      )}

      {/* sticky amount bar */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 px-4 py-2 shadow-[0_-4px_12px_rgba(0,0,0,.06)] backdrop-blur lg:pl-[17rem] print:hidden">
        <div className="mx-auto flex max-w-[1440px] items-center gap-3">
          <p className="text-sm text-slate-500">Amount: <b className="text-lg text-slate-900">{inr(pkg.total)}</b></p>
          {missingSteps(it, days).length > 0 && <p className="hidden truncate text-xs text-amber-700 md:block">To fill: {missingSteps(it, days).slice(0, 3).join(", ")}</p>}
          <div className="ml-auto flex gap-2">
            <Button size="sm" variant="secondary" onClick={async () => { await navigator.clipboard.writeText(shareUrl); toast.success("Copied"); }}><Copy className="h-4 w-4" /> Copy link</Button>
            {editable && <Button size="sm" loading={saving} variant={dirty ? "primary" : "secondary"} onClick={() => save()}><Save className="h-4 w-4" /> Save</Button>}
          </div>
        </div>
      </div>

      <GalleryModal open={!!gallery} onClose={() => setGallery(null)} title={gallery?.title ?? ""} images={gallery?.images ?? []} />
      <Modal open={!!details} onClose={() => setDetails(null)} title={details?.title ?? ""} footer={<Button onClick={() => setDetails(null)}>OK</Button>}>{details?.body}</Modal>
      <MessageComposer target={compose} onClose={() => setCompose(null)} />
    </div>
  );
}

const inp = (ok: boolean) =>
  cn("h-10 w-full rounded-lg border-2 bg-white px-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-500/30 disabled:bg-slate-50 disabled:text-slate-500",
    ok ? "border-emerald-600/70" : "border-rose-500/70");

function Section({ icon: Icon, title, children, tip, green }: { icon: any; title: string; children: ReactNode; tip?: string; green?: boolean }) {
  return (
    <section className="rounded-2xl border border-slate-200/70 bg-white/80 p-3 shadow-card">
      <div className="mb-2 flex items-center gap-2">
        <span className={cn("inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-bold uppercase tracking-wide text-white", green ? "bg-emerald-600" : "bg-brand-600")}><Icon className="h-3.5 w-3.5" /> {title}</span>
        {tip && <Tip text={tip} />}
      </div>
      {children}
    </section>
  );
}

function Tip({ text }: { text: string }) {
  return (
    <span className="group relative inline-flex">
      <Info className="h-3.5 w-3.5 cursor-help text-slate-400" />
      <span className="pointer-events-none absolute left-5 top-0 z-20 hidden w-56 rounded-lg bg-slate-900 px-2 py-1.5 text-[11px] font-normal normal-case text-white shadow-lg group-hover:block">{text}</span>
    </span>
  );
}

function F({ label, children, tip, small }: { label: string; children: ReactNode; tip?: string; ok?: boolean; small?: boolean }) {
  return (
    <div className="space-y-1">
      <span className={cn("flex items-center gap-1 font-medium text-slate-600", small ? "text-[11px]" : "text-xs")}>{label}{tip && <Tip text={tip} />}</span>
      {children}
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return <div className={cn("flex justify-between py-0.5", bold && "font-semibold text-slate-900")}><span className="text-slate-600">{label}</span><span>{value}</span></div>;
}

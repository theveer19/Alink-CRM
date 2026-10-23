"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowLeft, Copy, Eye, FileDown, Hotel as HotelIcon, Link2, Mail, MessageCircle, Pencil, Plane, Plus, Save, Trash2, Car, Camera, CheckCircle2, Files,
} from "lucide-react";
import { sb } from "@/lib/supabase/client";
import { QUOTE_STATUSES, statusMeta } from "@/lib/constants";
import type { Itinerary, ItineraryDay, ItineraryItem, TextTemplate } from "@/lib/types";
import { quoteTotals, type HotelRate } from "@/lib/pricing";
import { addDays, appUrl, cn, fmtDate, inr } from "@/lib/utils";
import { convertToBooking, duplicateItinerary } from "@/lib/actions";
import { Guard, useAuth } from "@/components/auth";
import { AddItemModal, type Masters } from "@/components/add-item-modal";
import { MessageComposer, type ComposeTarget } from "@/components/message-composer";
import { Badge, Button, Card, ConfirmButton, Field, Input, Select, Spinner, Textarea } from "@/components/ui";

export default function ItineraryPage() {
  return <Guard module="itineraries"><Builder /></Guard>;
}

const ICON: Record<string, any> = { hotel: HotelIcon, transfer: Car, activity: Camera, flight: Plane, train: Plane };

function Builder() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { can, settings } = useAuth();
  const [it, setIt] = useState<Itinerary | null>(null);
  const [days, setDays] = useState<ItineraryDay[]>([]);
  const [items, setItems] = useState<ItineraryItem[]>([]);
  const [masters, setMasters] = useState<Masters | null>(null);
  const [tpls, setTpls] = useState<TextTemplate[]>([]);
  const [contact, setContact] = useState<{ name: string; phone: string | null; email: string | null } | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [addFor, setAddFor] = useState<{ day: number | null; item?: ItineraryItem | null } | null>(null);
  const [compose, setCompose] = useState<ComposeTarget | null>(null);
  const [converting, setConverting] = useState(false);
  const editable = can("itineraries", "edit") || can("itineraries", "create");

  useEffect(() => {
    (async () => {
      const supa = sb();
      const [i, d, its, de, ho, ra, ac, tr, su, tp] = await Promise.all([
        supa.from("itineraries").select("*").eq("id", id).single(),
        supa.from("itinerary_days").select("*").eq("itinerary_id", id).order("day_no"),
        supa.from("itinerary_items").select("*").eq("itinerary_id", id).order("day_no").order("sort"),
        supa.from("destinations").select("*").eq("is_active", true).order("name"),
        supa.from("hotels").select("*").order("name"),
        supa.from("hotel_rates").select("*"),
        supa.from("activities").select("*").order("name"),
        supa.from("transfers").select("*").order("name"),
        supa.from("suppliers").select("*").order("name"),
        supa.from("text_templates").select("*").in("category", ["inclusion", "exclusion", "terms", "cancellation", "notes"]),
      ]);
      if (i.error) return toast.error(i.error.message);
      setIt(i.data as Itinerary);
      setDays((d.data ?? []) as ItineraryDay[]);
      setItems((its.data ?? []) as ItineraryItem[]);
      setMasters({ destinations: de.data ?? [], hotels: ho.data ?? [], rates: (ra.data ?? []) as HotelRate[], activities: ac.data ?? [], transfers: tr.data ?? [], suppliers: su.data ?? [] } as Masters);
      setTpls((tp.data ?? []) as TextTemplate[]);
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

  const totals = useMemo(() => (it ? quoteTotals(items.map((x) => ({ cost: x.cost, markup: x.markup })), it) : null), [items, it]);

  if (!it || !masters || !totals) return <Spinner />;

  const set = <K extends keyof Itinerary>(k: K, v: Itinerary[K]) => { setIt({ ...it, [k]: v }); setDirty(true); };

  function setNights(n: number) {
    n = Math.max(0, Math.min(60, n));
    const want = n + 1;
    let next = [...days];
    if (next.length < want) for (let i = next.length + 1; i <= want; i++) next.push({ day_no: i, title: i === want ? "Departure" : `Day ${i}`, description: null, destination_id: null, meals: null });
    else next = next.slice(0, want);
    setDays(next);
    setIt({ ...it!, nights: n });
    setDirty(true);
  }

  function setDay(i: number, patch: Partial<ItineraryDay>) {
    setDays(days.map((d, idx) => (idx === i ? { ...d, ...patch } : d)));
    setDirty(true);
  }

  async function save(silent = false) {
    if (!it) return false;
    setSaving(true);
    const supa = sb();
    const t = quoteTotals(items.map((x) => ({ cost: x.cost, markup: x.markup })), it);
    const { error } = await supa.from("itineraries").update({
      title: it.title, destination: it.destination, start_date: it.start_date || null, nights: it.nights, adults: it.adults, children: it.children,
      infants: it.infants, rooms: it.rooms, status: it.status, markup_type: it.markup_type, markup_value: it.markup_value, discount: it.discount,
      gst_percent: it.gst_percent, gst_mode: it.gst_mode, tcs_percent: it.tcs_percent, show_item_prices: it.show_item_prices,
      overview: it.overview, inclusions: it.inclusions, exclusions: it.exclusions, terms: it.terms, cover_image: it.cover_image, valid_till: it.valid_till || null,
      cost_total: t.cost_total, markup_total: t.markup_total, gst_total: t.gst_total, tcs_total: t.tcs_total, grand_total: t.grand_total,
    }).eq("id", it.id);
    if (error) { setSaving(false); toast.error(error.message); return false; }
    await supa.from("itinerary_days").delete().eq("itinerary_id", it.id);
    if (days.length) {
      const r = await supa.from("itinerary_days").insert(days.map((d) => ({ itinerary_id: it.id, day_no: d.day_no, title: d.title, description: d.description, destination_id: d.destination_id, meals: d.meals })));
      if (r.error) { setSaving(false); toast.error(r.error.message); return false; }
    }
    await supa.from("itinerary_items").delete().eq("itinerary_id", it.id);
    if (items.length) {
      const r = await supa.from("itinerary_items").insert(items.map((x, i) => ({
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
    if (it && it.status === "draft") { set("status", "sent"); await sb().from("itineraries").update({ status: "sent" }).eq("id", it.id); }
  }

  async function accept() {
    if (!(await save(true))) return;
    setConverting(true);
    try {
      const bId = await convertToBooking(it!, items);
      toast.success("Booking created");
      router.push(`/bookings/${bId}`);
    } catch (e: any) {
      toast.error(e.message);
      setConverting(false);
    }
  }

  const sortedItems = [...items].map((x, idx) => ({ x, idx }));
  const unscheduled = sortedItems.filter(({ x }) => !x.day_no || x.day_no > days.length);
  const insert = (cat: string) => tpls.filter((t) => t.category === cat);

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
          <Card title="Trip details">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Field label="Destination" className="col-span-2"><Input value={it.destination ?? ""} onChange={(e) => set("destination", e.target.value)} disabled={!editable} /></Field>
              <Field label="Start date"><Input type="date" value={it.start_date ?? ""} onChange={(e) => set("start_date", e.target.value || null)} disabled={!editable} /></Field>
              <Field label="Nights"><Input type="number" min={0} value={it.nights} onChange={(e) => setNights(Number(e.target.value))} disabled={!editable} /></Field>
              <Field label="Adults"><Input type="number" min={0} value={it.adults} onChange={(e) => set("adults", Number(e.target.value))} disabled={!editable} /></Field>
              <Field label="Children"><Input type="number" min={0} value={it.children} onChange={(e) => set("children", Number(e.target.value))} disabled={!editable} /></Field>
              <Field label="Infants"><Input type="number" min={0} value={it.infants} onChange={(e) => set("infants", Number(e.target.value))} disabled={!editable} /></Field>
              <Field label="Rooms"><Input type="number" min={1} value={it.rooms} onChange={(e) => set("rooms", Number(e.target.value))} disabled={!editable} /></Field>
              <Field label="Quote valid till"><Input type="date" value={it.valid_till ?? ""} onChange={(e) => set("valid_till", e.target.value || null)} disabled={!editable} /></Field>
              <Field label="Cover image URL" className="col-span-2 sm:col-span-3"><Input value={it.cover_image ?? ""} onChange={(e) => set("cover_image", e.target.value || null)} placeholder="https://… (optional banner on the shared itinerary)" disabled={!editable} /></Field>
              <Field label="Trip overview" className="col-span-2 sm:col-span-4"><Textarea rows={2} value={it.overview ?? ""} onChange={(e) => set("overview", e.target.value)} placeholder="Short intro shown at the top of the itinerary" disabled={!editable} /></Field>
            </div>
          </Card>

          <Card title="Day-wise plan & services" bodyClass="space-y-4">
            {days.map((d, i) => {
              const date = it.start_date ? addDays(it.start_date, i) : null;
              const dayItems = sortedItems.filter(({ x }) => x.day_no === d.day_no);
              return (
                <div key={i} className="rounded-xl border border-slate-200">
                  <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 bg-slate-50/70 px-3 py-2">
                    <span className="rounded-md bg-brand-700 px-2 py-0.5 text-xs font-semibold text-white">Day {d.day_no}</span>
                    {date && <span className="text-xs text-slate-500">{fmtDate(date)}</span>}
                    <input value={d.title} onChange={(e) => setDay(i, { title: e.target.value })} disabled={!editable} placeholder="Day title e.g. Srinagar local sightseeing"
                      className="min-w-[160px] flex-1 rounded border border-transparent bg-transparent px-1 text-sm font-medium focus:border-brand-500 focus:bg-white focus:outline-none" />
                    <Select value={d.destination_id ?? ""} onChange={(e) => setDay(i, { destination_id: e.target.value || null })} className="h-8 w-40 text-xs" disabled={!editable}>
                      <option value="">Destination…</option>
                      {masters.destinations.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                    </Select>
                    <Input value={d.meals ?? ""} onChange={(e) => setDay(i, { meals: e.target.value })} placeholder="Meals (B, D)" className="h-8 w-28 text-xs" disabled={!editable} />
                  </div>
                  <div className="space-y-2 p-3">
                    <Textarea rows={2} value={d.description ?? ""} onChange={(e) => setDay(i, { description: e.target.value })} disabled={!editable}
                      placeholder={masters.destinations.find((x) => x.id === d.destination_id)?.description ?? "What happens today…"} className="min-h-[56px] text-sm" />
                    {dayItems.map(({ x, idx }) => <ItemRow key={idx} x={x} editable={editable} onEdit={() => setAddFor({ day: x.day_no, item: { ...x, id: String(idx) } })} onDelete={() => { setItems(items.filter((_, j) => j !== idx)); setDirty(true); }} />)}
                    {editable && (
                      <button onClick={() => setAddFor({ day: d.day_no })} className="flex items-center gap-1 rounded-lg border border-dashed border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 hover:border-brand-400 hover:text-brand-700">
                        <Plus className="h-3.5 w-3.5" /> Add hotel / cab / activity / flight
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
            {unscheduled.length > 0 && (
              <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-3">
                <p className="mb-2 text-xs font-semibold text-amber-700">Services outside the trip days (edit to move them)</p>
                {unscheduled.map(({ x, idx }) => <ItemRow key={idx} x={x} editable={editable} onEdit={() => setAddFor({ day: 1, item: { ...x, id: String(idx) } })} onDelete={() => { setItems(items.filter((_, j) => j !== idx)); setDirty(true); }} />)}
              </div>
            )}
          </Card>

          <Card title="Inclusions, exclusions & terms">
            <div className="grid gap-4 md:grid-cols-2">
              {([["inclusions", "Inclusions", "inclusion"], ["exclusions", "Exclusions", "exclusion"]] as const).map(([k, label, cat]) => (
                <div key={k}>
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-xs font-medium text-slate-600">{label} (one per line)</span>
                    {insert(cat).length > 0 && editable && (
                      <select className="rounded border border-slate-200 text-[11px]" value="" onChange={(e) => { const t = tpls.find((x) => x.id === e.target.value); if (t) set(k, t.body); }}>
                        <option value="">Use template…</option>{insert(cat).map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
                      </select>
                    )}
                  </div>
                  <Textarea rows={6} value={it[k] ?? ""} onChange={(e) => set(k, e.target.value)} disabled={!editable} />
                </div>
              ))}
              <div className="md:col-span-2">
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-600">Terms, payment & cancellation policy</span>
                  {editable && (
                    <select className="rounded border border-slate-200 text-[11px]" value="" onChange={(e) => { const t = tpls.find((x) => x.id === e.target.value); if (t) set("terms", [it.terms, t.body].filter(Boolean).join("\n\n")); }}>
                      <option value="">Append template…</option>{[...insert("terms"), ...insert("cancellation"), ...insert("notes")].map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
                    </select>
                  )}
                </div>
                <Textarea rows={5} value={it.terms ?? ""} onChange={(e) => set("terms", e.target.value)} disabled={!editable} />
              </div>
            </div>
          </Card>
        </div>

        <div className="space-y-5">
          <div className="space-y-5 xl:sticky xl:top-20">
            <Card title="Pricing">
              <div className="space-y-3 text-sm">
                <Row label="Net cost (all services)" value={inr(totals.cost_total)} />
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
                    <Select value={it.gst_percent} onChange={(e) => set("gst_percent", Number(e.target.value))} disabled={!editable}>
                      {[0, 5, 12, 18].map((g) => <option key={g} value={g}>{g}%</option>)}
                    </Select>
                  </Field>
                  <Field label="GST on">
                    <Select value={it.gst_mode} onChange={(e) => set("gst_mode", e.target.value as "total" | "markup")} disabled={!editable}>
                      <option value="total">Whole package</option><option value="markup">Service fee only</option>
                    </Select>
                  </Field>
                </div>
                <Row label={`GST (${it.gst_percent}%)`} value={inr(totals.gst_total)} />
                <Field label="TCS % (foreign tours)">
                  <Select value={it.tcs_percent} onChange={(e) => set("tcs_percent", Number(e.target.value))} disabled={!editable}>
                    {[0, 2, 5, 20].map((g) => <option key={g} value={g}>{g}%</option>)}
                  </Select>
                </Field>
                {totals.tcs_total > 0 && <Row label="TCS" value={inr(totals.tcs_total)} />}
                <div className="rounded-lg bg-brand-50 p-3">
                  <Row label="Quote total" value={inr(totals.grand_total)} strong big />
                  {it.adults > 0 && <p className="mt-1 text-right text-xs text-brand-800">≈ {inr(totals.grand_total / Math.max(1, it.adults + it.children))} per person</p>}
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500">Your margin</span>
                  <span className={cn("font-semibold", totals.margin_percent < 5 ? "text-rose-600" : "text-emerald-600")}>{inr(totals.markup_total - totals.discount)} ({totals.margin_percent}%)</span>
                </div>
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
                  <Button variant="success" className="w-full" loading={converting} onClick={accept} disabled={!items.length}><CheckCircle2 className="h-4 w-4" /> Customer accepted → Create booking</Button>
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
          </div>
        </div>
      </div>

      <AddItemModal
        open={!!addFor}
        onClose={() => setAddFor(null)}
        masters={masters}
        trip={{ start_date: it.start_date, nights: it.nights, adults: it.adults, children: it.children, rooms: it.rooms }}
        dayNo={addFor?.day ?? 1}
        item={addFor?.item}
        onSave={(x) => {
          const editIdx = addFor?.item?.id != null ? Number(addFor.item.id) : -1;
          const clean = { ...x, id: undefined };
          if (editIdx >= 0) setItems(items.map((y, j) => (j === editIdx ? clean : y)));
          else setItems([...items, clean]);
          setDirty(true);
        }}
      />
      <MessageComposer target={compose} onClose={() => setCompose(null)} />
    </>
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

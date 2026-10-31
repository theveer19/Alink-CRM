"use client";
import { sb } from "@/lib/supabase/client";
import type { Booking, Contact, Itinerary, ItineraryItem, Lead, Settings } from "@/lib/types";
import { addDays, fmtDate, isoDate } from "@/lib/utils";
import { invoiceTotals, quoteTotals } from "@/lib/pricing";
import { occupancy } from "@/lib/package";
import { must } from "@/lib/hooks";

/** New package for a region (Compose Package → region card), optionally pre-filled from a lead / contact. Returns the new id. */
export async function createPackage(settings: Settings, regionId: string, lead?: Lead | null, contact?: Contact | null) {
  const supa = sb();
  const [reg, pts, veh, incs, dests] = await Promise.all([
    supa.from("regions").select("*").eq("id", regionId).single(),
    supa.from("pickup_points").select("*").eq("region_id", regionId).order("sort"),
    supa.from("vehicles").select("id, seats").eq("is_active", true).order("sort"),
    supa.from("inclusion_items").select("*").eq("is_active", true).order("sort"),
    supa.from("destinations").select("id, region_id").eq("region_id", regionId),
  ]);
  const region = must(reg) as any;
  const cityIds = new Set((dests.data ?? []).map((d) => d.id));
  const inRegion = (x: any) => (!x.region_id && !x.destination_id) || x.region_id === regionId || (x.destination_id && cityIds.has(x.destination_id));
  const incAll = (incs.data ?? []).filter(inRegion);
  const points = pts.data ?? [];
  const pick = points.find((p: any) => p.is_pickup) ?? points[0];
  const drop = points.find((p: any) => p.is_drop) ?? points[0];
  const adults = Math.max(1, lead?.adults ?? 2);
  const occ = occupancy(adults, 0, lead?.children ?? 0);
  const today = isoDate();
  const start = lead?.travel_date && lead.travel_date >= today ? lead.travel_date : null;
  const nights = Math.max(region.min_nights ?? 1, lead?.nights ?? 2);
  const vehicles = veh.data ?? [];
  const firstVeh = vehicles.find((v) => v.seats >= occ.total) ?? vehicles[0];
  const row = must(
    await supa.from("itineraries").insert({
      lead_id: lead?.id ?? null,
      contact_id: lead?.contact_id ?? contact?.id ?? null,
      client_name: lead?.name ?? contact?.name ?? null,
      title: region.name,
      destination: region.name,
      region_id: regionId,
      start_date: start,
      end_date: start ? addDays(start, nights) : null,
      nights,
      adults,
      adults_above10: 0,
      kids: lead?.children ?? 0,
      children: lead?.children ?? 0,
      infants: lead?.infants ?? 0,
      rooms: occ.rooms,
      extra_beds: occ.extra,
      child_no_bed: occ.cnb,
      meal_plan: "MAP",
      pickup_point_id: pick?.id ?? null,
      pickup_point: pick?.name ?? null,
      drop_point_id: drop?.id ?? null,
      drop_point: drop?.name ?? null,
      vehicle_list: firstVeh ? [{ vehicle_id: firstVeh.id, ac: false }] : [],
      vehicle_type: "none",
      markup_type: "fixed",
      markup_value: settings.default_margin_amount ?? 0,
      margin_amount: settings.default_margin_amount ?? 0,
      include_gst: false,
      gst_percent: settings.default_gst_percent,
      gst_mode: "total",
      tcs_percent: 0,
      inclusions: incAll.filter((x: any) => x.kind === "inclusion" && x.is_default).map((x: any) => x.title).join("\n"),
      exclusions: incAll.filter((x: any) => x.kind === "exclusion").map((x: any) => x.title).join("\n"),
      overview: region.description ?? null,
      terms: [settings.itinerary_terms, region.terms].filter(Boolean).join("\n\n"),
      valid_till: addDays(today, settings.package_validity_days || 15),
    }).select("id").single()
  );
  const days = Array.from({ length: nights + 1 }, (_, i) => ({ itinerary_id: row.id, day_no: i + 1, title: `Day ${i + 1}` }));
  must(await supa.from("itinerary_days").insert(days));
  if (lead && ["new", "contacted", "qualified"].includes(lead.status)) await supa.from("leads").update({ status: "quoted" }).eq("id", lead.id);
  return row.id as string;
}

/** Copy an itinerary as a new version (for revised quotes). */
export async function duplicateItinerary(it: Itinerary) {
  const supa = sb();
  const [days, items] = await Promise.all([
    supa.from("itinerary_days").select("*").eq("itinerary_id", it.id),
    supa.from("itinerary_items").select("*").eq("itinerary_id", it.id),
  ]);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { id, quote_no, share_token, created_at, booking_id, created_by, ...rest } = it as any;
  const root = it.parent_id ?? it.id;
  const { count } = await supa.from("itineraries").select("id", { count: "exact", head: true }).or(`id.eq.${root},parent_id.eq.${root}`);
  const copy = must(await supa.from("itineraries").insert({ ...rest, parent_id: root, version: (count ?? 1) + 1, status: "draft" }).select("id").single());
  if (days.data?.length) await supa.from("itinerary_days").insert(days.data.map(({ id: _i, itinerary_id: _x, ...d }: any) => ({ ...d, itinerary_id: copy.id })));
  if (items.data?.length) await supa.from("itinerary_items").insert(items.data.map(({ id: _i, itinerary_id: _x, created_at: _c, ...d }: any) => ({ ...d, itinerary_id: copy.id })));
  return copy.id as string;
}

const ITEM_TO_SERVICE: Record<string, string> = {
  hotel: "hotel", transfer: "cab", activity: "tour", flight: "flight", train: "train", visa: "visa", insurance: "insurance", other: "other",
};

/** Accept a quote → create booking + services, mark lead won. */
export async function convertToBooking(it: Itinerary, items: ItineraryItem[]) {
  const supa = sb();
  if (it.booking_id) return it.booking_id;
  const t = quoteTotals(items.map((i) => ({ cost: i.cost, markup: i.markup })), it);
  const end = it.start_date ? addDays(it.start_date, it.nights) : null;
  const booking = must(
    await supa.from("bookings").insert({
      lead_id: it.lead_id, contact_id: it.contact_id, itinerary_id: it.id, title: it.title, destination: it.destination,
      start_date: it.start_date, end_date: end, adults: it.adults, children: it.children, infants: it.infants,
      sell_amount: t.grand_total, tax_amount: Math.round((t.gst_total + t.tcs_total) * 100) / 100, status: "confirmed",
    }).select("id").single()
  );
  if (items.length) {
    const pax = `${it.adults} Adults${it.children ? `, ${it.children} Children` : ""}`;
    const services: Record<string, unknown>[] = [];
    // all day-wise cab lines become ONE cab service (one driver / one voucher for the trip)
    const cabIdx = items.map((i, idx) => ({ i, idx })).filter(({ i }) => i.details?.auto === "transfer");
    items.forEach((i, idx) => {
      if (i.details?.auto === "transfer") return;
      const start = i.details?.check_in ?? (it.start_date && i.day_no ? addDays(it.start_date, i.day_no - 1) : it.start_date);
      const nights = Number(i.details?.nights ?? 0);
      const end = i.details?.check_out ?? (start && nights ? addDays(start, nights) : start);
      services.push({
        booking_id: booking.id, service_type: ITEM_TO_SERVICE[i.item_type] ?? "other", supplier_id: i.supplier_id, title: i.title,
        details: { ...i.details, pax }, start_date: start, end_date: end,
        cost: i.cost, sell: t.lineSell[idx], sort: idx, status: "pending",
      });
    });
    if (cabIdx.length) {
      const vlabel = String(cabIdx[0].i.details?.vehicle_type ?? "") || "Cab";
      const route = cabIdx.map(({ i }) => `Day ${i.day_no}: ${i.details?.route ?? i.title}`).join("\n");
      services.push({
        booking_id: booking.id, service_type: "cab", supplier_id: cabIdx[0].i.supplier_id,
        title: `${vlabel} for transfers & sightseeing`,
        details: {
          auto: "transfer", vehicle_type: vlabel, pax, pickup: it.pickup_point, pickup_time: it.pickup_time, drop: it.drop_point,
          note: route,
        },
        start_date: it.start_date, end_date: end,
        cost: cabIdx.reduce((a, { i }) => a + Number(i.cost), 0),
        sell: cabIdx.reduce((a, { idx }) => a + Number(t.lineSell[idx]), 0),
        sort: 900, status: "pending",
      });
    }
    must(await supa.from("booking_services").insert(services));
  }
  await supa.from("itineraries").update({ status: "accepted", booking_id: booking.id }).eq("id", it.id);
  if (it.lead_id) await supa.from("leads").update({ status: "won" }).eq("id", it.lead_id);
  return booking.id as string;
}

/** Draft a GST invoice from a booking. */
export async function createInvoiceForBooking(b: Booking, settings: Settings, itemized: boolean) {
  const supa = sb();
  const contact = b.contact_id ? (await supa.from("contacts").select("*").eq("id", b.contact_id).single()).data as Contact | null : null;
  const services = itemized ? ((await supa.from("booking_services").select("*").eq("booking_id", b.id).neq("status", "cancelled").order("sort")).data ?? []) : [];
  const it = b.itinerary_id ? (await supa.from("itineraries").select("gst_percent, gst_mode, tcs_percent, gst_total, tcs_total").eq("id", b.itinerary_id).single()).data : null;
  const gstPct = Number(it?.gst_percent ?? settings.default_gst_percent);
  const tcsPct = Number(it?.tcs_percent ?? settings.default_tcs_percent);
  const interState = !!contact?.state && !!settings.state && contact.state.trim().toLowerCase() !== settings.state.trim().toLowerCase();
  // sell_amount already includes GST/TCS from the quote → back it out to get the taxable package value
  const tax = Number(b.tax_amount ?? 0) || (it ? Number(it.gst_total ?? 0) + Number(it.tcs_total ?? 0) : 0);
  const base = tax > 0 ? Number(b.sell_amount) - tax : Number(b.sell_amount) / (1 + gstPct / 100);
  const lines = itemized && services.length
    ? services.map((s: any, i: number) => ({ description: s.title, sac: settings.sac_code, qty: 1, rate: Number(s.sell), amount: Number(s.sell), sort: i }))
    : [{ description: `Tour package – ${b.title}${b.start_date ? ` (${fmtDate(b.start_date)}${b.end_date ? ` – ${fmtDate(b.end_date)}` : ""})` : ""}`, sac: settings.sac_code, qty: 1, rate: Math.round(base * 100) / 100, amount: Math.round(base * 100) / 100, sort: 0 }];
  const taxType = interState ? "igst" : "cgst_sgst";
  const tot = invoiceTotals(lines, { discount: 0, gst_percent: gstPct, gst_mode: "total", service_charge: 0, tax_type: taxType, tcs_percent: tcsPct });
  const inv = must(
    await supa.from("invoices").insert({
      subtotal: tot.subtotal, taxable_value: tot.taxable_value, cgst: tot.cgst, sgst: tot.sgst, igst: tot.igst, tcs: tot.tcs, total: tot.total,
      booking_id: b.id, contact_id: b.contact_id, bill_to_name: contact?.company_name || contact?.name || b.contact_name || b.title,
      bill_to_address: [contact?.address, contact?.city, contact?.state].filter(Boolean).join(", ") || null,
      bill_to_gstin: contact?.gstin ?? null, bill_to_phone: contact?.phone ?? null, bill_to_email: contact?.email ?? null,
      place_of_supply: contact?.state || settings.state, tax_type: taxType,
      gst_percent: gstPct, gst_mode: "total", tcs_percent: tcsPct, terms: settings.invoice_terms, status: "draft",
      due_date: b.start_date ?? null,
    }).select("id").single()
  );
  must(await supa.from("invoice_items").insert(lines.map((l) => ({ ...l, invoice_id: inv.id }))));
  // advances already received on this booking are adjusted against the new invoice
  await supa.from("payments").update({ invoice_id: inv.id }).eq("booking_id", b.id).eq("direction", "in").is("invoice_id", null);
  return inv.id as string;
}

const SERVICE_TO_VOUCHER: Record<string, string> = { hotel: "hotel", flight: "flight", train: "flight", cab: "cab", tour: "tour" };

/** Issue a voucher for some services of a booking. Stores a snapshot so later edits don't change issued vouchers. */
export async function createVoucher(bookingId: string, serviceIds: string[], forceCombined = false, notes?: string) {
  const supa = sb();
  const b = must(await supa.from("booking_summary").select("*").eq("id", bookingId).single());
  const services = must(await supa.from("booking_services").select("*, suppliers(name, phone, email, address)").in("id", serviceIds).order("sort")) as any[];
  if (!services.length) throw new Error("Select at least one service");
  const hotelIds = services.map((s) => s.details?.hotel_id).filter(Boolean);
  const hotels = hotelIds.length ? (await supa.from("hotels").select("id, name, address, phone, email, check_in_time, check_out_time").in("id", hotelIds)).data ?? [] : [];
  const types = new Set(services.map((s) => SERVICE_TO_VOUCHER[s.service_type] ?? "tour"));
  const voucher_type = forceCombined || types.size > 1 ? "combined" : [...types][0];
  const contact = b.contact_id ? (await supa.from("contacts").select("name, phone, email").eq("id", b.contact_id).single()).data : null;
  const data = {
    guest: { name: contact?.name ?? b.contact_name, phone: contact?.phone ?? b.contact_phone, email: contact?.email },
    pax: { adults: b.adults, children: b.children, infants: b.infants },
    booking: { booking_no: b.booking_no, title: b.title, destination: b.destination, start_date: b.start_date, end_date: b.end_date },
    services: services.map((s) => ({
      id: s.id, type: s.service_type, title: s.title, start_date: s.start_date, end_date: s.end_date, confirmation_no: s.confirmation_no,
      status: s.status, details: s.details, supplier: s.suppliers, hotel: hotels.find((h: any) => h.id === s.details?.hotel_id) ?? null,
    })),
  };
  const v = must(await supa.from("vouchers").insert({ booking_id: bookingId, voucher_type, service_ids: serviceIds, data, notes: notes ?? null }).select("id, share_token").single());
  return v as { id: string; share_token: string };
}

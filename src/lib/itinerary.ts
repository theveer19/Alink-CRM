// Itinerary builder logic: night-stay segments → hotels, day plans → vehicle cost, ticked add-ons → cost lines.
import type { Destination, Hotel, InclusionItem, Itinerary, ItineraryDay, ItineraryItem, Transfer } from "./types";
import { addDaysIso, hotelStayCost, vehicleRate, type HotelRate } from "./pricing";
import { VEHICLE_TYPES } from "./constants";

export type HotelSel = {
  hotel_id: string;
  room_type: string;
  meal_plan: string;
  rooms: number;
  extra_adults: number;
  cwb: number;
  cnb: number;
  cost_override: number | null;
};

export type Segment = { key: string; startDay: number; nights: number; destId: string; checkIn: string | null; checkOut: string | null };

export type BuilderMasters = {
  destinations: Destination[];
  hotels: Hotel[];
  rates: HotelRate[];
  plans: Transfer[];
  inclusions: InclusionItem[];
};

/** Consecutive nights in the same city = one hotel stay. Day N's night is spent at days[N-1].stay_destination_id. */
export function staySegments(days: ItineraryDay[], nights: number, start: string | null): Segment[] {
  const out: Segment[] = [];
  for (let n = 1; n <= nights; n++) {
    const dest = days[n - 1]?.stay_destination_id ?? null;
    if (!dest) continue;
    const last = out[out.length - 1];
    if (last && last.destId === dest && last.startDay + last.nights === n) last.nights++;
    else out.push({ key: `${n}:${dest}`, startDay: n, nights: 1, destId: dest, checkIn: null, checkOut: null });
  }
  for (const s of out) {
    s.checkIn = start ? addDaysIso(start, s.startDay - 1) : null;
    s.checkOut = start ? addDaysIso(start, s.startDay - 1 + s.nights) : null;
  }
  return out;
}

export function defaultHotelSel(hotel: Hotel | undefined, rates: HotelRate[], it: Pick<Itinerary, "rooms" | "adults" | "children">): HotelSel {
  const rs = hotel ? rates.filter((r) => r.hotel_id === hotel.id) : [];
  const extra = Math.max(0, it.adults - it.rooms * 2);
  return {
    hotel_id: hotel?.id ?? "",
    room_type: rs[0]?.room_type ?? "",
    meal_plan: rs.find((r) => r.room_type === rs[0]?.room_type && r.meal_plan === "MAP")?.meal_plan ?? rs[0]?.meal_plan ?? "",
    rooms: it.rooms,
    extra_adults: extra,
    cwb: 0,
    cnb: it.children,
    cost_override: null,
  };
}

export function lines(text: string | null | undefined) {
  return (text ?? "").split("\n").map((x) => x.replace(/^[-•*✓✔✗✘x]\s*/i, "").trim()).filter(Boolean);
}

/** Cost lines generated from the plan (hotels per stay, vehicle per day, paid add-ons). */
export function autoItems(it: Itinerary, days: ItineraryDay[], hotelSel: Record<string, HotelSel>, m: BuilderMasters) {
  const items: (ItineraryItem & { warn?: string })[] = [];
  const destName = (id: string | null) => m.destinations.find((d) => d.id === id)?.name ?? "";

  // hotels
  for (const seg of staySegments(days, it.nights, it.start_date)) {
    const sel = hotelSel[seg.key];
    if (!sel?.hotel_id) continue;
    const hotel = m.hotels.find((h) => h.id === sel.hotel_id);
    if (!hotel) continue;
    const calc = hotelStayCost({
      rates: m.rates, hotelId: hotel.id, roomType: sel.room_type, mealPlan: sel.meal_plan, checkIn: seg.checkIn, nights: seg.nights,
      rooms: sel.rooms, extraAdults: sel.extra_adults, childWithBed: sel.cwb, childWithoutBed: sel.cnb,
    });
    const cost = sel.cost_override != null ? sel.cost_override : calc.total;
    items.push({
      day_no: seg.startDay, sort: seg.startDay, item_type: "hotel", ref_id: hotel.id, supplier_id: hotel.supplier_id,
      title: `${hotel.name}${hotel.category ? ` (${hotel.category})` : ""}`,
      details: {
        auto: "hotel", seg_key: seg.key, destination_id: seg.destId, destination: destName(seg.destId), hotel_id: hotel.id, hotel_name: hotel.name,
        room_type: sel.room_type, meal_plan: sel.meal_plan, rooms: sel.rooms, nights: seg.nights, extra_adults: sel.extra_adults,
        cwb: sel.cwb, cnb: sel.cnb, check_in: seg.checkIn, check_out: seg.checkOut, cost_override: sel.cost_override,
        check_in_time: hotel.check_in_time, check_out_time: hotel.check_out_time,
      },
      qty: 1, unit_cost: cost, cost, markup: null,
      warn: sel.cost_override == null && calc.missing ? "No rate saved for some nights — add rates in Masters or type the cost" : undefined,
    });
  }

  // vehicle per day
  const vt = VEHICLE_TYPES.find((v) => v.value === it.vehicle_type);
  if (it.vehicle_type !== "none") {
    days.forEach((d, i) => {
      const plan = m.plans.find((p) => p.id === d.day_plan_id);
      if (!plan || plan.transfer_type === "leisure") return;
      const unit = vehicleRate(plan, it.vehicle_type);
      const cost = unit * Math.max(1, it.vehicles);
      items.push({
        day_no: i + 1, sort: 100 + i, item_type: "transfer", ref_id: plan.id, supplier_id: plan.supplier_id,
        title: `${plan.name} – ${vt?.label ?? it.vehicle_type}${it.vehicles > 1 ? ` × ${it.vehicles}` : ""}`,
        details: { auto: "transfer", plan_id: plan.id, vehicle_type: it.vehicle_type, vehicles: it.vehicles, route: plan.name, day: i + 1 },
        qty: Math.max(1, it.vehicles), unit_cost: unit, cost, markup: null,
        warn: unit === 0 ? `No ${vt?.label ?? ""} rate for this route in Masters` : undefined,
      });
    });
  }

  // paid add-ons ticked in inclusions
  const ticked = new Set(lines(it.inclusions).map((l) => l.toLowerCase()));
  for (const inc of m.inclusions) {
    if (inc.kind !== "inclusion" || !(Number(inc.cost_adult) > 0 || Number(inc.cost_child) > 0)) continue;
    if (!ticked.has(inc.title.toLowerCase())) continue;
    const cost = Number(inc.cost_adult) * it.adults + Number(inc.cost_child) * it.children;
    // put the add-on on the first day spent in its destination
    const idx = inc.destination_id ? days.findIndex((d, i) => d.stay_destination_id === inc.destination_id || (i > 0 && days[i - 1].stay_destination_id === inc.destination_id && d.destination_id === inc.destination_id)) : -1;
    items.push({
      day_no: idx >= 0 ? idx + 1 : null, sort: 500, item_type: "activity", ref_id: inc.id, supplier_id: null, title: inc.title,
      details: { auto: "addon", inclusion_id: inc.id, adults: it.adults, children: it.children },
      qty: 1, unit_cost: cost, cost, markup: null,
    });
  }
  return items;
}

/** Where the traveller starts day N (= last night's city, or the plan's start city). */
export function startCity(days: ItineraryDay[], i: number) {
  return i > 0 ? days[i - 1]?.stay_destination_id ?? null : null;
}

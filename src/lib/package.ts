// Package composer engine (works like b2btourportal.com "Compose Package").
// Pure functions only — used by the builder page, the package view and unit tests.
import type { Destination, Hotel, InclusionItem, Itinerary, ItineraryDay, PickupPoint, Transfer, TransferRate, Vehicle, VehicleRow } from "./types";
import { addDaysIso, hotelStayCost, r2, type HotelRate } from "./pricing.ts";

export type Masters = {
  destinations: Destination[];
  hotels: Hotel[];
  rates: HotelRate[];
  plans: Transfer[];
  planRates: TransferRate[];
  vehicles: Vehicle[];
  inclusions: InclusionItem[];
  points: PickupPoint[];
};

const n0 = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);

/** Portal rule: rooms = adults ÷ 2 (min 1), extra beds = odd adult + persons above 10, child no bed = kids 5-10. */
export function occupancy(adults: number, above10: number, kids: number) {
  const a = Math.max(0, Math.floor(n0(adults)));
  const rooms = Math.max(1, Math.floor(a / 2));
  const extra = Math.max(0, a - rooms * 2) + Math.max(0, Math.floor(n0(above10)));
  const cnb = Math.max(0, Math.floor(n0(kids)));
  return { rooms, extra, cnb, total: a + Math.max(0, Math.floor(n0(above10))) + cnb };
}

export function nightsLabel(nights: number) {
  const n = Math.max(0, Math.floor(n0(nights)));
  return `${n} Night${n === 1 ? "" : "s"} & ${n + 1} Day${n + 1 === 1 ? "" : "s"}`;
}

/** "20 Nov 26" like the portal day header. */
export function shortDate(iso: string | null | undefined) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  const mon = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][m - 1];
  return `${String(d).padStart(2, "0")} ${mon} ${String(y).slice(2)}`;
}

/** Cities belonging to the package's region (null region = everything). */
export function regionCityIds(regionId: string | null | undefined, destinations: Destination[]) {
  if (!regionId) return null;
  return new Set(destinations.filter((d) => d.region_id === regionId).map((d) => d.id));
}

/** Night-stay locations a place allows (portal: "Gulmarg / Tangmarg"). */
export function stayOptions(plan: Transfer | undefined): string[] {
  if (!plan) return [];
  const opts = (plan.stay_options ?? []).filter(Boolean);
  if (opts.length) return opts;
  const to = plan.to_destination_id ?? (plan.transfer_type === "departure" ? null : plan.destination_id);
  return to ? [to] : [];
}

const isArrival = (p: Transfer) => p.transfer_type === "arrival";
const isDrop = (p: Transfer) => p.transfer_type === "departure";
const byOrder = (a: Transfer, b: Transfer) => (a.sort ?? 0) - (b.sort ?? 0) || a.name.localeCompare(b.name);

/** City the traveller wakes up in on day `i` (0-based). */
export function startCityOf(i: number, days: ItineraryDay[], it: Pick<Itinerary, "pickup_point_id">, m: Pick<Masters, "points" | "plans">) {
  if (i === 0) return m.points.find((p) => p.id === it.pickup_point_id)?.destination_id ?? null;
  return days[i - 1]?.stay_destination_id ?? null;
}

/**
 * "Place to Visit" options for day i (0-based), same as the portal:
 *  - day 1: arrival places that start in the pickup city
 *  - last day: drop places that start in last night's city
 *  - other days: places that start in last night's city
 * Falls back to the whole region when nothing is set up for that city yet.
 */
export function placeOptions(i: number, nights: number, days: ItineraryDay[], it: Pick<Itinerary, "pickup_point_id" | "region_id">, m: Pick<Masters, "plans" | "points" | "destinations">) {
  const cities = regionCityIds(it.region_id, m.destinations);
  const active = m.plans.filter((p) => p.is_active !== false && (!cities || (p.destination_id && cities.has(p.destination_id)) || (p.to_destination_id && cities.has(p.to_destination_id))));
  const last = i >= nights;
  const kindOk = (p: Transfer) => (i === 0 && !last ? isArrival(p) : last ? isDrop(p) : !isArrival(p) && !isDrop(p));
  const from = startCityOf(i, days, it, m);
  // a night spent in a sub-location (Tangmarg) still allows places from the main city of yesterday's place
  const prevPlan = i > 0 ? m.plans.find((p) => p.id === days[i - 1]?.day_plan_id) : undefined;
  const fromSet = new Set([from, prevPlan?.to_destination_id].filter(Boolean) as string[]);
  const exact = active.filter((p) => kindOk(p) && (!fromSet.size || (p.destination_id && fromSet.has(p.destination_id))));
  if (exact.length) return exact.sort(byOrder);
  return active.filter(kindOk).sort(byOrder);
}

const catRank = (c: string) => {
  const s = c.match(/(\d)\s*star/i);
  return (s ? Number(s[1]) * 10 : 100) + (/premi/i.test(c) ? 5 : 0) + (/luxury/i.test(c) ? 3 : 0);
};

/** Hotel categories that have at least one hotel in the night-stay city. */
export function categoriesFor(stayId: string | null, hotels: Hotel[]) {
  if (!stayId) return [];
  const set = new Set(hotels.filter((h) => h.is_active !== false && h.destination_id === stayId).map((h) => h.category || "Other"));
  return [...set].sort((a, b) => catRank(a) - catRank(b) || a.localeCompare(b));
}

export function hotelsFor(stayId: string | null, category: string | null, hotels: Hotel[]) {
  if (!stayId) return [];
  return hotels
    .filter((h) => h.is_active !== false && h.destination_id === stayId && (!category || (h.category || "Other") === category))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Room types the hotel has rates for (meal plan matches first). */
export function roomTypesFor(hotelId: string | null, rates: HotelRate[], mealPlan?: string) {
  if (!hotelId) return [];
  const rs = rates.filter((r) => r.hotel_id === hotelId);
  const withMeal = mealPlan ? rs.filter((r) => r.meal_plan === mealPlan) : rs;
  return [...new Set((withMeal.length ? withMeal : rs).map((r) => r.room_type))];
}

/**
 * Apply a change to day i and cascade like the portal:
 *  - choosing a place picks its first night-stay
 *  - same night-stay as yesterday copies yesterday's category / hotel / room
 *  - changing a place clears the following days that no longer start from the right city
 */
export function setDay(days: ItineraryDay[], i: number, patch: Partial<ItineraryDay>, ctx: { nights: number; it: Pick<Itinerary, "pickup_point_id" | "region_id" | "meal_plan">; m: Masters }) {
  const out = days.map((d) => ({ ...d }));
  let d = { ...out[i], ...patch };
  const { m } = ctx;
  if ("day_plan_id" in patch) {
    const plan = m.plans.find((p) => p.id === patch.day_plan_id);
    const opts = stayOptions(plan);
    if (i >= ctx.nights) d = { ...d, stay_destination_id: null, hotel_category: null, hotel_id: null, room_type: null };
    else if (!opts.includes(d.stay_destination_id ?? "")) d = { ...d, stay_destination_id: opts[0] ?? null, hotel_category: null, hotel_id: null, room_type: null };
    d.title = plan?.name ?? d.title;
    d.description = plan?.description ?? d.description;
    d.destination_id = plan?.destination_id ?? d.destination_id;
  }
  if (("day_plan_id" in patch || "stay_destination_id" in patch) && i < ctx.nights) {
    const prev = out[i - 1];
    if (prev && prev.stay_destination_id && prev.stay_destination_id === d.stay_destination_id && prev.hotel_id) {
      d = { ...d, hotel_category: prev.hotel_category, hotel_id: prev.hotel_id, room_type: prev.room_type };
    } else if ("stay_destination_id" in patch) {
      d = { ...d, hotel_category: null, hotel_id: null, room_type: null };
    }
    if (d.stay_destination_id && !d.hotel_category) {
      const cats = categoriesFor(d.stay_destination_id, m.hotels);
      if (cats.length === 1) d.hotel_category = cats[0];
    }
  }
  if ("hotel_category" in patch) d = { ...d, hotel_id: null, room_type: null };
  if ("hotel_id" in patch) {
    const rooms = roomTypesFor(d.hotel_id, m.rates, ctx.it.meal_plan);
    d.room_type = rooms[0] ?? null;
    if (d.hotel_id && !d.hotel_category) d.hotel_category = m.hotels.find((h) => h.id === d.hotel_id)?.category ?? null;
  }
  out[i] = d;
  // later days must start where this day ends
  for (let k = i + 1; k < out.length; k++) {
    const allowed = placeOptions(k, ctx.nights, out, ctx.it, m).map((p) => p.id);
    if (out[k].day_plan_id && !allowed.includes(out[k].day_plan_id!)) {
      out[k] = { ...out[k], day_plan_id: null, stay_destination_id: null, hotel_category: null, hotel_id: null, room_type: null };
    } else break;
  }
  return out;
}

/** Resize the day list to nights + 1 rows, keeping what was already chosen. */
export function resizeDays(days: ItineraryDay[], nights: number): ItineraryDay[] {
  const want = Math.max(1, nights + 1);
  const out = days.slice(0, want).map((d, i) => ({ ...d, day_no: i + 1 }));
  while (out.length < want) {
    out.push({ day_no: out.length + 1, title: `Day ${out.length + 1}`, description: null, destination_id: null, meals: null, day_plan_id: null, stay_destination_id: null, hotel_category: null, hotel_id: null, room_type: null });
  }
  // the last day is the drop day: no night stay
  const last = out[out.length - 1];
  out[out.length - 1] = { ...last, stay_destination_id: null, hotel_category: null, hotel_id: null, room_type: null };
  return out;
}

/** Vehicle rows normalised to vehicle ids (old {type:"sedan",count} rows are mapped by name). */
export function normVehicles(list: VehicleRow[] | null | undefined, vehicles: Vehicle[]): { vehicle_id: string; ac: boolean }[] {
  const legacy: Record<string, RegExp> = { sedan: /sedan/i, suv: /ertiga|suv|innova \//i, crysta: /crysta/i };
  const out: { vehicle_id: string; ac: boolean }[] = [];
  for (const r of list ?? []) {
    let id = r.vehicle_id ?? null;
    if (!id && r.type) id = vehicles.find((v) => legacy[r.type!]?.test(v.name))?.id ?? null;
    if (!id) continue;
    for (let c = 0; c < Math.max(1, n0(r.count) || 1); c++) out.push({ vehicle_id: id, ac: !!r.ac });
  }
  return out;
}

export function vehicleName(id: string, vehicles: Vehicle[]) {
  return vehicles.find((v) => v.id === id)?.name ?? "Vehicle";
}

export function vehiclesLabel(rows: { vehicle_id: string; ac: boolean }[], vehicles: Vehicle[]) {
  const groups = new Map<string, number>();
  rows.forEach((r) => {
    const k = `${vehicleName(r.vehicle_id, vehicles)}${r.ac ? " (AC)" : ""}`;
    groups.set(k, (groups.get(k) ?? 0) + 1);
  });
  return [...groups].map(([k, n]) => (n > 1 ? `${k} × ${n}` : k)).join(" + ");
}

/** Rate of one vehicle for one place (AC rate falls back to the normal rate; old 3-column rates as last resort). */
export function placeVehicleRate(plan: Transfer, vehicleId: string, ac: boolean, planRates: TransferRate[], vehicles: Vehicle[]) {
  const r = planRates.find((x) => x.transfer_id === plan.id && x.vehicle_id === vehicleId);
  if (r) return n0(ac && n0(r.ac_rate) > 0 ? r.ac_rate : r.rate);
  const name = vehicleName(vehicleId, vehicles);
  const legacy = /crysta/i.test(name) ? plan.rate_crysta : /ertiga|suv|innova/i.test(name) ? plan.rate_suv : /sedan/i.test(name) ? plan.rate_sedan : 0;
  return n0(legacy) || 0;
}

/** Hotel stays = consecutive nights in the same hotel & room. */
export function hotelStays(days: ItineraryDay[], nights: number, start: string | null) {
  const out: { startDay: number; nights: number; hotel_id: string; room_type: string; stay_destination_id: string | null; checkIn: string | null; checkOut: string | null }[] = [];
  for (let n = 1; n <= nights; n++) {
    const d = days[n - 1];
    if (!d?.hotel_id) continue;
    const last = out[out.length - 1];
    if (last && last.hotel_id === d.hotel_id && last.room_type === (d.room_type ?? "") && last.startDay + last.nights === n) last.nights++;
    else out.push({ startDay: n, nights: 1, hotel_id: d.hotel_id, room_type: d.room_type ?? "", stay_destination_id: d.stay_destination_id, checkIn: null, checkOut: null });
  }
  for (const s of out) {
    s.checkIn = start ? addDaysIso(start, s.startDay - 1) : null;
    s.checkOut = start ? addDaysIso(start, s.startDay - 1 + s.nights) : null;
  }
  return out;
}

export function lines(text: string | null | undefined) {
  return (text ?? "").split("\n").map((x) => x.replace(/^[-•*✓✔✗✘✖]\s*/, "").trim()).filter(Boolean);
}

/** Inclusion chips for the package's region (region-wide + cities of the region + global). */
export function regionInclusions(it: Pick<Itinerary, "region_id">, m: Pick<Masters, "inclusions" | "destinations">, kind: "inclusion" | "exclusion") {
  const cities = regionCityIds(it.region_id, m.destinations);
  return m.inclusions
    .filter((x) => x.is_active !== false && x.kind === kind)
    .filter((x) => (!x.region_id && !x.destination_id) || (x.region_id && x.region_id === it.region_id) || (x.destination_id && (!cities || cities.has(x.destination_id))))
    .sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0) || a.title.localeCompare(b.title));
}

/** Final exclusions = exclusions + every inclusion chip that was left unticked (portal behaviour). */
export function finalExclusions(it: Pick<Itinerary, "region_id" | "inclusions" | "exclusions">, m: Pick<Masters, "inclusions" | "destinations">) {
  const ticked = new Set(lines(it.inclusions).map((l) => l.toLowerCase()));
  const out = lines(it.exclusions);
  const have = new Set(out.map((l) => l.toLowerCase()));
  for (const inc of regionInclusions(it, m, "inclusion")) {
    const k = inc.title.toLowerCase();
    if (!ticked.has(k) && !have.has(k)) { out.push(inc.title); have.add(k); }
  }
  return out;
}

export type CostLine = {
  kind: "hotel" | "transfer" | "addon";
  day_no: number | null;
  title: string;
  cost: number;
  ref_id: string | null;
  supplier_id: string | null;
  details: Record<string, unknown>;
  warn?: string;
};

export type PackageInput = Pick<Itinerary,
  "start_date" | "nights" | "adults" | "children" | "rooms" | "extra_beds" | "child_no_bed" | "meal_plan" | "vehicle_list" |
  "inclusions" | "region_id" | "margin_amount" | "include_gst" | "gst_percent" | "adults_above10" | "kids" | "pickup_point" | "drop_point">;

/** Every cost the package carries + the final amount (cost + margin + optional GST). */
export function computePackage(it: PackageInput, days: ItineraryDay[], m: Masters) {
  const lines_: CostLine[] = [];
  const destName = (id: string | null | undefined) => m.destinations.find((d) => d.id === id)?.name ?? "";

  for (const s of hotelStays(days, it.nights, it.start_date)) {
    const hotel = m.hotels.find((h) => h.id === s.hotel_id);
    if (!hotel) continue;
    const calc = hotelStayCost({
      rates: m.rates, hotelId: hotel.id, roomType: s.room_type, mealPlan: it.meal_plan || "MAP", checkIn: s.checkIn, nights: s.nights,
      rooms: it.rooms, extraAdults: it.extra_beds, childWithBed: 0, childWithoutBed: it.child_no_bed,
    });
    lines_.push({
      kind: "hotel", day_no: s.startDay, ref_id: hotel.id, supplier_id: hotel.supplier_id,
      title: `${hotel.name}${hotel.category ? ` (${hotel.category})` : ""}`, cost: calc.total,
      details: {
        auto: "hotel", hotel_id: hotel.id, hotel_name: hotel.name, destination_id: s.stay_destination_id, destination: destName(s.stay_destination_id),
        room_type: s.room_type, meal_plan: it.meal_plan, rooms: it.rooms, nights: s.nights, extra_adults: it.extra_beds, cwb: 0, cnb: it.child_no_bed,
        check_in: s.checkIn, check_out: s.checkOut, check_in_time: hotel.check_in_time, check_out_time: hotel.check_out_time,
      },
      warn: calc.missing ? `No ${it.meal_plan} rate for ${hotel.name} – ${s.room_type || "room"} on some nights (add it in Masters → Hotels)` : undefined,
    });
  }

  const vrows = normVehicles(it.vehicle_list, m.vehicles);
  if (vrows.length) {
    const label = vehiclesLabel(vrows, m.vehicles);
    days.forEach((d, i) => {
      const plan = m.plans.find((p) => p.id === d.day_plan_id);
      if (!plan || plan.transfer_type === "leisure") return;
      const parts = vrows.map((v) => ({ ...v, rate: placeVehicleRate(plan, v.vehicle_id, v.ac, m.planRates, m.vehicles) }));
      const cost = r2(parts.reduce((a, v) => a + v.rate, 0));
      const missing = [...new Set(parts.filter((v) => !v.rate).map((v) => vehicleName(v.vehicle_id, m.vehicles)))];
      lines_.push({
        kind: "transfer", day_no: i + 1, ref_id: plan.id, supplier_id: plan.supplier_id, title: `${plan.name} – ${label}`, cost,
        details: { auto: "transfer", plan_id: plan.id, route: plan.name, vehicles: vrows, vehicle_type: label, day: i + 1 },
        warn: missing.length ? `No ${missing.join(" / ")} rate for "${plan.name}" (Masters → Places)` : undefined,
      });
    });
  }

  const ticked = new Set(lines(it.inclusions).map((l) => l.toLowerCase()));
  const persons = n0(it.adults) + n0(it.adults_above10);
  for (const inc of regionInclusions(it, m, "inclusion")) {
    if (!(n0(inc.cost_adult) > 0 || n0(inc.cost_child) > 0) || !ticked.has(inc.title.toLowerCase())) continue;
    const idx = inc.destination_id ? days.findIndex((d) => d.stay_destination_id === inc.destination_id || d.destination_id === inc.destination_id) : -1;
    lines_.push({
      kind: "addon", day_no: idx >= 0 ? idx + 1 : null, ref_id: inc.id, supplier_id: null, title: inc.title,
      cost: r2(n0(inc.cost_adult) * persons + n0(inc.cost_child) * n0(it.kids)),
      details: { auto: "addon", inclusion_id: inc.id, adults: persons, children: it.kids },
    });
  }

  const cost = r2(lines_.reduce((a, l) => a + l.cost, 0));
  const margin = r2(n0(it.margin_amount));
  const gst = it.include_gst ? r2(((cost + margin) * n0(it.gst_percent)) / 100) : 0;
  const total = r2(cost + margin + gst);
  const sum = (k: CostLine["kind"]) => r2(lines_.filter((l) => l.kind === k).reduce((a, l) => a + l.cost, 0));
  return { lines: lines_, hotel: sum("hotel"), transport: sum("transfer"), addons: sum("addon"), cost, margin, gst, total, warnings: lines_.filter((l) => l.warn).map((l) => l.warn!) };
}

/** What still has to be chosen before the package can be calculated. */
export function missingSteps(it: Pick<Itinerary, "client_name" | "start_date" | "nights" | "adults" | "pickup_point_id" | "drop_point_id">, days: ItineraryDay[]) {
  const out: string[] = [];
  if (!it.client_name?.trim()) out.push("Client Name");
  if (!it.start_date) out.push("Arrival Date");
  if (!(it.adults > 0)) out.push("Adult Persons");
  days.forEach((d, i) => {
    if (!d.day_plan_id) out.push(`Day ${i + 1}: Place to Visit`);
    else if (i < it.nights && !d.hotel_id) out.push(`Day ${i + 1}: Hotel`);
  });
  return out;
}

import { test } from "node:test";
import assert from "node:assert/strict";
import { categoriesFor, computePackage, finalExclusions, hotelStays, nightsLabel, normVehicles, occupancy, placeOptions, resizeDays, setDay, shortDate } from "../src/lib/package.ts";

const D = (id: string, name: string, region_id = "kas") => ({ id, name, region_id, country: "India", state: null, description: null, image_url: null, is_active: true });
const destinations = [D("sxr", "Srinagar"), D("gul", "Gulmarg"), D("tng", "Tangmarg"), D("pah", "Pahalgam"), D("pat", "Pattaya", "thai")];
const P = (id: string, name: string, type: string, from: string, to: string | null, extra: any = {}) => ({
  id, name, transfer_type: type, destination_id: from, to_destination_id: to, supplier_id: null, vehicle_type: null, capacity: 4, cost: 0,
  rate_sedan: 0, rate_suv: 0, rate_crysta: 0, description: name + " text", is_active: true, sort: 0, images: [], stay_options: [], ...extra,
});
const plans = [
  P("a1", "Arrival Srinagar to Gulmarg", "arrival", "sxr", "gul", { stay_options: ["gul", "tng"] }),
  P("a2", "Arrival Srinagar local", "arrival", "sxr", "sxr"),
  P("g1", "Gulmarg to Pahalgam", "intercity", "gul", "pah"),
  P("p1", "Pahalgam sightseeing", "sightseeing", "pah", "pah"),
  P("p2", "Pahalgam to Srinagar", "intercity", "pah", "sxr"),
  P("d1", "Srinagar Drop", "departure", "sxr", null),
  P("x1", "Pattaya tour", "sightseeing", "pat", "pat"),
];
const H = (id: string, name: string, dest: string, category: string) => ({ id, name, destination_id: dest, supplier_id: null, category, address: null, phone: null, email: null, check_in_time: null, check_out_time: null, notes: null, is_active: true, images: [], description: null });
const hotels = [H("h1", "Royal Park", "gul", "3 Star"), H("h2", "Grand Mala", "pah", "2 Star Premium"), H("h3", "Gurcoo", "sxr", "3 Star"), H("h4", "Lux", "sxr", "4 Star")];
const R = (hotel_id: string, room_type: string, cost: number, extra = 0, from: string | null = null, to: string | null = null) => ({ id: hotel_id + room_type + cost, hotel_id, room_type, meal_plan: "MAP", valid_from: from, valid_to: to, cost_per_night: cost, extra_adult: extra, child_with_bed: 0, child_without_bed: 500 });
const rates = [R("h1", "Deluxe", 5000, 1500), R("h2", "Deluxe", 3000, 1000), R("h3", "Premium", 4000, 1200), R("h3", "Premium", 6000, 1500, "2026-12-24", "2027-01-02")];
const vehicles = [{ id: "sed", name: "Sedan", seats: 4, sort: 1, is_active: true }, { id: "inn", name: "Innova / Ertiga", seats: 6, sort: 2, is_active: true }, { id: "cry", name: "Innova Crysta", seats: 7, sort: 3, is_active: true }];
const planRates = ["a1", "g1", "p1", "p2", "d1"].flatMap((t, i) => [
  { transfer_id: t, vehicle_id: "sed", rate: 2000 + i * 100, ac_rate: 0 },
  { transfer_id: t, vehicle_id: "inn", rate: 3000 + i * 100, ac_rate: 3500 + i * 100 },
]);
const points = [{ id: "pp1", region_id: "kas", name: "Srinagar Airport / Railway Station", destination_id: "sxr", is_pickup: true, is_drop: true, sort: 1 }];
const inclusions = [
  { id: "i1", kind: "inclusion", title: "Shikara Ride 01 Hour", destination_id: null, region_id: "kas", is_default: true, cost_adult: 0, cost_child: 0, sort: 1, is_active: true },
  { id: "i2", kind: "inclusion", title: "Gondola First Phase", destination_id: "gul", region_id: null, is_default: false, cost_adult: 900, cost_child: 450, sort: 2, is_active: true },
  { id: "i3", kind: "inclusion", title: "Thai dinner", destination_id: "pat", region_id: null, is_default: false, cost_adult: 1, cost_child: 0, sort: 3, is_active: true },
  { id: "e1", kind: "exclusion", title: "Personal expenses", destination_id: null, region_id: null, is_default: true, cost_adult: 0, cost_child: 0, sort: 1, is_active: true },
] as any[];
const m: any = { destinations, hotels, rates, plans, planRates, vehicles, inclusions, points };

test("occupancy follows the portal", () => {
  assert.deepEqual(occupancy(4, 0, 0), { rooms: 2, extra: 0, cnb: 0, total: 4 });
  assert.deepEqual(occupancy(3, 0, 0), { rooms: 1, extra: 1, cnb: 0, total: 3 });
  assert.deepEqual(occupancy(3, 1, 1), { rooms: 1, extra: 2, cnb: 1, total: 5 });
  assert.deepEqual(occupancy(1, 0, 0), { rooms: 1, extra: 0, cnb: 0, total: 1 });
  assert.equal(nightsLabel(5), "5 Nights & 6 Days");
  assert.equal(shortDate("2026-11-20"), "20 Nov 26");
});

test("place options chain from last night's city", () => {
  const it = { pickup_point_id: "pp1", region_id: "kas", meal_plan: "MAP" };
  let days = resizeDays([], 4);
  assert.equal(days.length, 5);
  assert.deepEqual(placeOptions(0, 4, days, it, m).map((p) => p.id).sort(), ["a1", "a2"]);
  days = setDay(days, 0, { day_plan_id: "a1" }, { nights: 4, it, m });
  assert.equal(days[0].stay_destination_id, "gul");
  assert.equal(days[0].hotel_category, "3 Star"); // only one category in Gulmarg → auto
  assert.deepEqual(placeOptions(1, 4, days, it, m).map((p) => p.id), ["g1"]);
  // Tangmarg night stay still offers Gulmarg places next day
  const t = setDay(days, 0, { stay_destination_id: "tng" }, { nights: 4, it, m });
  assert.deepEqual(placeOptions(1, 4, t, it, m).map((p) => p.id), ["g1"]);
  days = setDay(days, 0, { hotel_id: "h1" }, { nights: 4, it, m });
  assert.equal(days[0].room_type, "Deluxe");
  days = setDay(days, 1, { day_plan_id: "g1" }, { nights: 4, it, m });
  days = setDay(days, 1, { hotel_category: "2 Star Premium" }, { nights: 4, it, m });
  days = setDay(days, 1, { hotel_id: "h2" }, { nights: 4, it, m });
  days = setDay(days, 2, { day_plan_id: "p1" }, { nights: 4, it, m });
  // same night stay as yesterday → hotel copied
  assert.equal(days[2].hotel_id, "h2");
  days = setDay(days, 3, { day_plan_id: "p2" }, { nights: 4, it, m });
  assert.deepEqual(categoriesFor("sxr", hotels as any), ["3 Star", "4 Star"]);
  days = setDay(days, 3, { hotel_category: "3 Star" }, { nights: 4, it, m });
  days = setDay(days, 3, { hotel_id: "h3" }, { nights: 4, it, m });
  assert.deepEqual(placeOptions(4, 4, days, it, m).map((p) => p.id), ["d1"]);
  days = setDay(days, 4, { day_plan_id: "d1" }, { nights: 4, it, m });
  assert.equal(days[4].hotel_id, null);
  // changing day 2 to a place ending elsewhere clears the now-invalid next day
  const ch = setDay(days, 1, { day_plan_id: null }, { nights: 4, it, m });
  assert.equal(ch[2].day_plan_id, "p1"); // fallback list still allows it
  assert.deepEqual(hotelStays(days, 4, "2026-11-20").map((s) => [s.hotel_id, s.nights, s.checkIn, s.checkOut]),
    [["h1", 1, "2026-11-20", "2026-11-21"], ["h2", 2, "2026-11-21", "2026-11-23"], ["h3", 1, "2026-11-23", "2026-11-24"]]);

  const occ = occupancy(3, 0, 1);
  const pkg = computePackage({
    start_date: "2026-11-20", nights: 4, adults: 3, children: 1, rooms: occ.rooms, extra_beds: occ.extra, child_no_bed: occ.cnb, meal_plan: "MAP",
    vehicle_list: [{ vehicle_id: "inn", ac: true }], inclusions: "Shikara Ride 01 Hour\nGondola First Phase", region_id: "kas",
    margin_amount: 2000, include_gst: true, gst_percent: 5, adults_above10: 0, kids: 1, pickup_point: null, drop_point: null,
  } as any, days, m);
  // hotels: Royal Park 1n (5000 + 1500 extra + 500 cnb) + Grand Mala 2n (3000+1000+500)*2 + Gurcoo 1n (4000+1200+500)
  assert.equal(pkg.hotel, 7000 + 9000 + 5700);
  // AC Innova per day: a1 3500, g1 3600, p1 3700, p2 3800, d1 3900
  assert.equal(pkg.transport, 3500 + 3600 + 3700 + 3800 + 3900);
  assert.equal(pkg.addons, 900 * 3 + 450 * 1);
  assert.equal(pkg.cost, pkg.hotel + pkg.transport + pkg.addons);
  assert.equal(pkg.gst, Math.round((pkg.cost + 2000) * 5) / 100);
  assert.equal(pkg.total, pkg.cost + 2000 + pkg.gst);
  assert.equal(pkg.warnings.length, 0);
});

test("unticked inclusions become exclusions; legacy vehicle rows map", () => {
  const ex = finalExclusions({ region_id: "kas", inclusions: "Shikara Ride 01 Hour", exclusions: "Personal expenses" }, m);
  assert.deepEqual(ex, ["Personal expenses", "Gondola First Phase"]);
  assert.deepEqual(normVehicles([{ type: "suv", count: 2, ac: false } as any, { vehicle_id: "cry", ac: true }], vehicles as any),
    [{ vehicle_id: "inn", ac: false }, { vehicle_id: "inn", ac: false }, { vehicle_id: "cry", ac: true }]);
});

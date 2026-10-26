// Pure pricing / tax maths — shared by the itinerary builder, invoices and tests.
// Keep this file free of imports so it can run under plain Node for unit tests.

export const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const n0 = (v: unknown) => {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};

export type HotelRate = {
  id: string;
  hotel_id: string;
  room_type: string;
  meal_plan: string;
  valid_from: string | null;
  valid_to: string | null;
  cost_per_night: number;
  extra_adult: number;
  child_with_bed: number;
  child_without_bed: number;
};

/** Best matching rate for a hotel on a given check-in date (season rate first, then an open-ended rate). */
export function pickHotelRate(rates: HotelRate[], hotelId: string, roomType: string, mealPlan: string, date: string | null) {
  const list = rates.filter((r) => r.hotel_id === hotelId && r.room_type === roomType && r.meal_plan === mealPlan);
  if (!list.length) return undefined;
  if (date) {
    const seasonal = list.find((r) => r.valid_from && r.valid_to && r.valid_from <= date && date <= r.valid_to);
    if (seasonal) return seasonal;
  }
  return list.find((r) => !r.valid_from && !r.valid_to) ?? list[0];
}

export function hotelCost(p: {
  nights: number; rooms: number; rate: Pick<HotelRate, "cost_per_night" | "extra_adult" | "child_with_bed" | "child_without_bed">;
  extraAdults?: number; childWithBed?: number; childWithoutBed?: number;
}) {
  const perNight =
    n0(p.rooms) * n0(p.rate.cost_per_night) +
    n0(p.extraAdults) * n0(p.rate.extra_adult) +
    n0(p.childWithBed) * n0(p.rate.child_with_bed) +
    n0(p.childWithoutBed) * n0(p.rate.child_without_bed);
  return r2(perNight * Math.max(0, n0(p.nights)));
}

/** Date-wise hotel cost: every night picks its own season rate (a stay can cross seasons). */
export function hotelStayCost(p: {
  rates: HotelRate[]; hotelId: string; roomType: string; mealPlan: string; checkIn: string | null; nights: number;
  rooms: number; extraAdults?: number; childWithBed?: number; childWithoutBed?: number;
}) {
  const nights = Math.max(0, Math.floor(n0(p.nights)));
  const breakdown: { date: string | null; rate: HotelRate | undefined; cost: number }[] = [];
  for (let i = 0; i < nights; i++) {
    const date = p.checkIn ? addDaysIso(p.checkIn, i) : null;
    const rate = pickHotelRate(p.rates, p.hotelId, p.roomType, p.mealPlan, date);
    const cost = rate ? hotelCost({ nights: 1, rooms: p.rooms, rate, extraAdults: p.extraAdults, childWithBed: p.childWithBed, childWithoutBed: p.childWithoutBed }) : 0;
    breakdown.push({ date, rate, cost });
  }
  const total = r2(breakdown.reduce((a, b) => a + b.cost, 0));
  const missing = breakdown.some((b) => !b.rate);
  return { total, breakdown, missing };
}

export function addDaysIso(date: string, days: number) {
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

export function nightsBetween(start: string | null, end: string | null) {
  if (!start || !end) return 0;
  const [a, b] = [start, end].map((x) => { const [y, m, d] = x.split("-").map(Number); return Date.UTC(y, m - 1, d); });
  return Math.max(0, Math.round((b - a) / 86400000));
}

export type VehicleKey = "sedan" | "suv" | "tempo";
const CAP: Record<VehicleKey, number> = { sedan: 4, suv: 6, tempo: 12 };

/** Smallest vehicle that fits everyone (children over 5 counted as seats). */
export function suggestVehicle(pax: number): { type: VehicleKey; count: number } {
  const n = Math.max(1, Math.ceil(n0(pax)));
  if (n <= CAP.sedan) return { type: "sedan", count: 1 };
  if (n <= CAP.suv) return { type: "suv", count: 1 };
  if (n <= CAP.tempo) return { type: "tempo", count: 1 };
  return { type: "tempo", count: Math.ceil(n / CAP.tempo) };
}

export function vehicleRate(t: { rate_sedan?: number | null; rate_suv?: number | null; rate_tempo?: number | null; cost?: number | null }, type: string) {
  const v = type === "suv" ? t.rate_suv : type === "tempo" ? t.rate_tempo : t.rate_sedan;
  return n0(v) || n0(t.cost);
}

export function activityCost(adults: number, children: number, costAdult: number, costChild: number) {
  return r2(n0(adults) * n0(costAdult) + n0(children) * n0(costChild));
}

export function vehiclesNeeded(pax: number, capacity: number) {
  return Math.max(1, Math.ceil(n0(pax) / Math.max(1, n0(capacity))));
}

export type QuoteSettings = {
  markup_type: "percent" | "fixed";
  markup_value: number;
  discount: number;
  gst_percent: number;
  gst_mode: "total" | "markup";
  tcs_percent: number;
};

export type QuoteLine = { cost: number; markup?: number | null };

export function quoteTotals(lines: QuoteLine[], s: QuoteSettings) {
  const cost_total = r2(lines.reduce((a, l) => a + n0(l.cost), 0));
  const auto = lines.filter((l) => l.markup == null || (l.markup as unknown) === "");
  const autoCost = auto.reduce((a, l) => a + n0(l.cost), 0);

  const lineMarkups = lines.map((l) => {
    if (!(l.markup == null || (l.markup as unknown) === "")) return r2(n0(l.markup));
    if (s.markup_type === "percent") return r2((n0(l.cost) * n0(s.markup_value)) / 100);
    // fixed ₹ markup spread over the lines proportionally to their cost
    if (autoCost <= 0) return auto.length ? r2(n0(s.markup_value) / auto.length) : 0;
    return r2((n0(s.markup_value) * n0(l.cost)) / autoCost);
  });

  const markup_total = r2(lineMarkups.reduce((a, b) => a + b, 0));
  const discount = r2(n0(s.discount));
  const subtotal = r2(cost_total + markup_total - discount);
  const gstBase = s.gst_mode === "markup" ? Math.max(0, markup_total - discount) : subtotal;
  const gst_total = r2((gstBase * n0(s.gst_percent)) / 100);
  const preTcs = r2(subtotal + gst_total);
  const tcs_total = r2((preTcs * n0(s.tcs_percent)) / 100);
  const grand_total = r2(preTcs + tcs_total);
  const lineSell = lines.map((l, i) => r2(n0(l.cost) + lineMarkups[i]));
  const margin_percent = cost_total > 0 ? r2(((markup_total - discount) / cost_total) * 100) : 0;
  return { cost_total, markup_total, discount, subtotal, gst_total, tcs_total, grand_total, lineMarkups, lineSell, margin_percent };
}

export type InvoiceSettings = {
  discount: number;
  gst_percent: number;
  gst_mode: "total" | "markup";
  service_charge: number;
  tax_type: "cgst_sgst" | "igst" | "none";
  tcs_percent: number;
};

export function invoiceTotals(items: { qty: number; rate: number }[], s: InvoiceSettings) {
  const amounts = items.map((i) => r2(n0(i.qty) * n0(i.rate)));
  const subtotal = r2(amounts.reduce((a, b) => a + b, 0));
  const discount = r2(n0(s.discount));
  const service = r2(n0(s.service_charge));
  const taxable_value = s.gst_mode === "markup" ? service : r2(subtotal - discount + service);
  const gst = s.tax_type === "none" ? 0 : r2((taxable_value * n0(s.gst_percent)) / 100);
  const cgst = s.tax_type === "cgst_sgst" ? r2(gst / 2) : 0;
  const sgst = s.tax_type === "cgst_sgst" ? r2(gst - cgst) : 0;
  const igst = s.tax_type === "igst" ? gst : 0;
  const preTcs = r2(subtotal - discount + service + gst);
  const tcs = r2((preTcs * n0(s.tcs_percent)) / 100);
  const total = r2(preTcs + tcs);
  return { amounts, subtotal, discount, taxable_value, cgst, sgst, igst, gst, tcs, total };
}

/** Financial-year label for a date: 2026-10-22 → "2026-27" */
export function financialYear(date: string) {
  const [y, m] = date.split("-").map(Number);
  const start = m >= 4 ? y : y - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
}

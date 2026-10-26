import { test } from "node:test";
import assert from "node:assert/strict";
import { activityCost, financialYear, hotelCost, hotelStayCost, invoiceTotals, nightsBetween, pickHotelRate, quoteTotals, suggestVehicle, vehicleRate, vehiclesNeeded } from "../src/lib/pricing.ts";

const rate = { cost_per_night: 4000, extra_adult: 1200, child_with_bed: 1000, child_without_bed: 600 };

test("hotel cost = nights × (rooms + extras)", () => {
  assert.equal(hotelCost({ nights: 3, rooms: 2, rate }), 24000);
  assert.equal(hotelCost({ nights: 3, rooms: 2, rate, extraAdults: 1, childWithBed: 1, childWithoutBed: 1 }), 24000 + 3 * (1200 + 1000 + 600));
});

test("activity + vehicles", () => {
  assert.equal(activityCost(2, 1, 1500, 800), 3800);
  assert.equal(vehiclesNeeded(5, 4), 2);
  assert.equal(vehiclesNeeded(0, 4), 1);
});

test("season rate is preferred, else open rate", () => {
  const rates = [
    { id: "a", hotel_id: "h", room_type: "Deluxe", meal_plan: "CP", valid_from: null, valid_to: null, cost_per_night: 3000, extra_adult: 0, child_with_bed: 0, child_without_bed: 0 },
    { id: "b", hotel_id: "h", room_type: "Deluxe", meal_plan: "CP", valid_from: "2026-12-20", valid_to: "2027-01-05", cost_per_night: 5000, extra_adult: 0, child_with_bed: 0, child_without_bed: 0 },
  ];
  assert.equal(pickHotelRate(rates, "h", "Deluxe", "CP", "2026-12-25")?.id, "b");
  assert.equal(pickHotelRate(rates, "h", "Deluxe", "CP", "2026-11-01")?.id, "a");
  assert.equal(pickHotelRate(rates, "h", "Suite", "CP", "2026-11-01"), undefined);
});

test("quote: percent markup, GST on total, TCS", () => {
  const t = quoteTotals([{ cost: 20000 }, { cost: 10000 }], {
    markup_type: "percent", markup_value: 10, discount: 1000, gst_percent: 5, gst_mode: "total", tcs_percent: 0,
  });
  assert.equal(t.cost_total, 30000);
  assert.equal(t.markup_total, 3000);
  assert.equal(t.subtotal, 32000);
  assert.equal(t.gst_total, 1600);
  assert.equal(t.grand_total, 33600);
  assert.deepEqual(t.lineSell, [22000, 11000]);
});

test("quote: fixed markup spread, per-line override, GST on markup only", () => {
  const t = quoteTotals([{ cost: 30000 }, { cost: 10000 }, { cost: 5000, markup: 500 }], {
    markup_type: "fixed", markup_value: 4000, discount: 0, gst_percent: 18, gst_mode: "markup", tcs_percent: 5,
  });
  assert.deepEqual(t.lineMarkups, [3000, 1000, 500]);
  assert.equal(t.markup_total, 4500);
  assert.equal(t.gst_total, 810);
  assert.equal(t.subtotal, 49500);
  assert.equal(t.tcs_total, Math.round((49500 + 810) * 0.05 * 100) / 100);
});

test("invoice: CGST+SGST on total, IGST, margin scheme", () => {
  const a = invoiceTotals([{ qty: 1, rate: 50000 }], { discount: 0, gst_percent: 5, gst_mode: "total", service_charge: 0, tax_type: "cgst_sgst", tcs_percent: 0 });
  assert.equal(a.cgst, 1250); assert.equal(a.sgst, 1250); assert.equal(a.total, 52500);
  const b = invoiceTotals([{ qty: 2, rate: 10000 }], { discount: 0, gst_percent: 5, gst_mode: "total", service_charge: 0, tax_type: "igst", tcs_percent: 0 });
  assert.equal(b.igst, 1000); assert.equal(b.total, 21000);
  const c = invoiceTotals([{ qty: 1, rate: 40000 }], { discount: 0, gst_percent: 18, gst_mode: "markup", service_charge: 5000, tax_type: "cgst_sgst", tcs_percent: 0 });
  assert.equal(c.taxable_value, 5000); assert.equal(c.gst, 900); assert.equal(c.total, 45900);
});

test("financial year", () => {
  assert.equal(financialYear("2026-10-22"), "2026-27");
  assert.equal(financialYear("2027-02-01"), "2026-27");
  assert.equal(financialYear("2027-04-01"), "2027-28");
});

test("stay crossing seasons is priced night by night", () => {
  const base = { hotel_id: "h", room_type: "Deluxe", meal_plan: "MAP", extra_adult: 1000, child_with_bed: 0, child_without_bed: 0 };
  const rates = [
    { ...base, id: "off", valid_from: null, valid_to: null, cost_per_night: 3000 },
    { ...base, id: "peak", valid_from: "2026-12-24", valid_to: "2027-01-02", cost_per_night: 6000 },
  ];
  // check-in 22 Dec, 4 nights: 22,23 off-season, 24,25 peak
  const r = hotelStayCost({ rates, hotelId: "h", roomType: "Deluxe", mealPlan: "MAP", checkIn: "2026-12-22", nights: 4, rooms: 2, extraAdults: 1 });
  assert.equal(r.total, 2 * (2 * 3000 + 1000) + 2 * (2 * 6000 + 1000));
  assert.equal(r.missing, false);
  assert.equal(r.breakdown[2].date, "2026-12-24");
});

test("nights between dates, vehicle suggestion and rate", () => {
  assert.equal(nightsBetween("2026-12-20", "2026-12-25"), 5);
  assert.equal(nightsBetween("2026-12-31", "2027-01-02"), 2);
  assert.deepEqual(suggestVehicle(2), { type: "sedan", count: 1 });
  assert.deepEqual(suggestVehicle(6), { type: "suv", count: 1 });
  assert.deepEqual(suggestVehicle(9), { type: "suv", count: 2 });
  assert.deepEqual(suggestVehicle(20), { type: "suv", count: 4 });
  assert.equal(vehicleRate({ rate_sedan: 2500, rate_suv: 3500, rate_crysta: 4500 }, "suv"), 3500);
  assert.equal(vehicleRate({ rate_sedan: 2500, rate_suv: 3500, rate_crysta: 4500 }, "crysta"), 4500);
  assert.equal(vehicleRate({ rate_sedan: 0, cost: 1800 }, "sedan"), 1800);
});

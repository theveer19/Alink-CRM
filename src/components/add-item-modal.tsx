"use client";
import { useEffect, useMemo, useState } from "react";
import { ITEM_TYPES, MEAL_PLANS, VEHICLE_TYPES } from "@/lib/constants";
import type { Activity, Destination, Hotel, ItineraryItem, Supplier, Transfer } from "@/lib/types";
import { activityCost, hotelCost, pickHotelRate, suggestVehicle, vehicleRate, type HotelRate } from "@/lib/pricing";
import { addDays, inr } from "@/lib/utils";
import { Button, Field, Input, Modal, Select, Textarea } from "./ui";

export type Masters = {
  destinations: Destination[]; hotels: Hotel[]; rates: HotelRate[]; activities: Activity[]; transfers: Transfer[]; suppliers: Supplier[];
};

type Trip = { start_date: string | null; nights: number; adults: number; children: number; rooms: number };

export function AddItemModal({ open, onClose, onSave, masters, trip, dayNo, item }: {
  open: boolean; onClose: () => void; onSave: (i: ItineraryItem) => void; masters: Masters; trip: Trip; dayNo: number | null; item?: ItineraryItem | null;
}) {
  const [type, setType] = useState("hotel");
  const [day, setDay] = useState<number>(1);
  const [dest, setDest] = useState("");
  const [refId, setRefId] = useState("");
  const [d, setD] = useState<Record<string, any>>({});
  const [title, setTitle] = useState("");
  const [cost, setCost] = useState<number>(0);
  const [manualCost, setManualCost] = useState(false);
  const [markup, setMarkup] = useState<string>("");
  const [supplier, setSupplier] = useState("");

  useEffect(() => {
    if (!open) return;
    if (item) {
      setType(item.item_type); setDay(item.day_no ?? 1); setRefId(item.ref_id ?? ""); setD(item.details ?? {}); setTitle(item.title);
      setCost(Number(item.cost)); setManualCost(true); setMarkup(item.markup == null ? "" : String(item.markup)); setSupplier(item.supplier_id ?? "");
      setDest(item.details?.destination_id ?? "");
    } else {
      setType("hotel"); setDay(dayNo ?? 1); setRefId(""); setTitle(""); setCost(0); setManualCost(false); setMarkup(""); setSupplier(""); setDest("");
      setD({ nights: 1, rooms: trip.rooms, extra_adults: 0, cwb: 0, cnb: trip.children, adults: trip.adults, children: trip.children, vehicles: 1 });
    }
  }, [open, item, dayNo, trip]);

  const checkIn = trip.start_date ? addDays(trip.start_date, day - 1) : null;
  const hotelsHere = masters.hotels.filter((h) => h.is_active && (!dest || h.destination_id === dest));
  const hotelRates = masters.rates.filter((r) => r.hotel_id === refId);
  const roomTypes = [...new Set(hotelRates.map((r) => r.room_type))];
  const mealPlans = [...new Set(hotelRates.filter((r) => !d.room_type || r.room_type === d.room_type).map((r) => r.meal_plan))];
  const rate = type === "hotel" && refId && d.room_type && d.meal_plan ? pickHotelRate(masters.rates, refId, d.room_type, d.meal_plan, checkIn) : undefined;

  // auto cost
  const auto = useMemo(() => {
    if (type === "hotel" && rate)
      return hotelCost({ nights: Number(d.nights), rooms: Number(d.rooms), rate, extraAdults: Number(d.extra_adults), childWithBed: Number(d.cwb), childWithoutBed: Number(d.cnb) });
    if (type === "activity") {
      const a = masters.activities.find((x) => x.id === refId);
      if (a) return activityCost(Number(d.adults), Number(d.children), a.cost_adult, a.cost_child);
    }
    if (type === "transfer") {
      const t = masters.transfers.find((x) => x.id === refId);
      if (t) return Number(d.vehicles || 1) * vehicleRate(t, d.vehicle_type || "sedan");
    }
    return null;
  }, [type, rate, d, refId, masters]);

  useEffect(() => { if (auto != null && !manualCost) setCost(auto); }, [auto, manualCost]);

  // defaults when a master record is picked
  function pick(id: string) {
    setRefId(id);
    setManualCost(false);
    if (type === "hotel") {
      const h = masters.hotels.find((x) => x.id === id);
      const rs = masters.rates.filter((r) => r.hotel_id === id);
      setTitle(h ? `${h.name}${h.category ? ` (${h.category})` : ""}` : "");
      setSupplier(h?.supplier_id ?? "");
      setD((x) => ({ ...x, hotel_id: id, hotel_name: h?.name, room_type: rs[0]?.room_type ?? "", meal_plan: rs[0]?.meal_plan ?? "", destination_id: h?.destination_id }));
    } else if (type === "activity") {
      const a = masters.activities.find((x) => x.id === id);
      setTitle(a?.name ?? ""); setSupplier(a?.supplier_id ?? "");
      setD((x) => ({ ...x, description: a?.description, duration: a?.duration }));
    } else if (type === "transfer") {
      const t = masters.transfers.find((x) => x.id === id);
      const sug = suggestVehicle(trip.adults + trip.children);
      setTitle(t ? t.name : ""); setSupplier(t?.supplier_id ?? "");
      setD((x) => ({ ...x, vehicle_type: x.vehicle_type || sug.type, vehicles: sug.count }));
    }
  }

  function save() {
    if (!title.trim()) return;
    const details = { ...d };
    if (type === "hotel") { details.check_in = checkIn; details.check_out = checkIn ? addDays(checkIn, Number(d.nights)) : null; details.rate_id = rate?.id; }
    onSave({
      id: item?.id, day_no: day, sort: item?.sort ?? Date.now() % 100000,
      item_type: type, ref_id: refId || null, supplier_id: supplier || null, title: title.trim(), details,
      qty: 1, unit_cost: cost, cost: Math.round(cost * 100) / 100, markup: markup === "" ? null : Number(markup),
    });
    onClose();
  }

  const set = (k: string) => (e: { target: { value: string } }) => { setD({ ...d, [k]: e.target.value }); };
  const dayOptions = Array.from({ length: trip.nights + 1 }, (_, i) => i + 1);

  return (
    <Modal open={open} onClose={onClose} title={item ? "Edit service" : "Add service"} size="lg"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={save} disabled={!title.trim()}>{item ? "Update" : "Add to itinerary"}</Button></>}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Field label="Service type">
            <Select value={type} onChange={(e) => { setType(e.target.value); setRefId(""); setTitle(""); setManualCost(false); setCost(0); }} disabled={!!item}>
              {ITEM_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </Select>
          </Field>
          <Field label={type === "hotel" ? "Check-in day" : "Day"}>
            <Select value={day} onChange={(e) => setDay(Number(e.target.value))}>
              {dayOptions.map((n) => <option key={n} value={n}>Day {n}{trip.start_date ? ` (${addDays(trip.start_date, n - 1)})` : ""}</option>)}
            </Select>
          </Field>
          {["hotel", "activity", "transfer"].includes(type) && (
            <Field label="Destination filter" className="col-span-2">
              <Select value={dest} onChange={(e) => setDest(e.target.value)}>
                <option value="">All destinations</option>
                {masters.destinations.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
              </Select>
            </Field>
          )}
        </div>

        {type === "hotel" && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Field label="Hotel" className="col-span-2">
              <Select value={refId} onChange={(e) => pick(e.target.value)}>
                <option value="">Choose hotel…</option>
                {hotelsHere.map((h) => <option key={h.id} value={h.id}>{h.name} {h.category ? `· ${h.category}` : ""}</option>)}
              </Select>
            </Field>
            <Field label="Room type">
              {roomTypes.length ? (
                <Select value={d.room_type ?? ""} onChange={(e) => { setManualCost(false); setD({ ...d, room_type: e.target.value }); }}>{roomTypes.map((r) => <option key={r}>{r}</option>)}</Select>
              ) : <Input value={d.room_type ?? ""} onChange={set("room_type")} placeholder="Deluxe" />}
            </Field>
            <Field label="Meal plan">
              <Select value={d.meal_plan ?? ""} onChange={(e) => { setManualCost(false); setD({ ...d, meal_plan: e.target.value }); }}>
                <option value="">—</option>
                {(mealPlans.length ? MEAL_PLANS.filter((m) => mealPlans.includes(m.value)) : MEAL_PLANS).map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
              </Select>
            </Field>
            <Field label="Nights"><Input type="number" min={1} value={d.nights ?? 1} onChange={(e) => { setManualCost(false); set("nights")(e); }} /></Field>
            <Field label="Rooms"><Input type="number" min={1} value={d.rooms ?? 1} onChange={(e) => { setManualCost(false); set("rooms")(e); }} /></Field>
            <Field label="Extra adults"><Input type="number" min={0} value={d.extra_adults ?? 0} onChange={(e) => { setManualCost(false); set("extra_adults")(e); }} /></Field>
            <Field label="Child w/ bed"><Input type="number" min={0} value={d.cwb ?? 0} onChange={(e) => { setManualCost(false); set("cwb")(e); }} /></Field>
            <Field label="Child w/o bed"><Input type="number" min={0} value={d.cnb ?? 0} onChange={(e) => { setManualCost(false); set("cnb")(e); }} /></Field>
            <div className="col-span-2 rounded-lg bg-slate-50 p-2 text-xs text-slate-600 sm:col-span-3">
              {refId && !hotelRates.length && "No rates saved for this hotel — add them in Masters → Hotels, or type the cost below."}
              {rate && <>Rate used: <b>{inr(rate.cost_per_night)}</b>/room/night{rate.valid_from ? ` (season ${rate.valid_from} → ${rate.valid_to})` : ""} · extra adult {inr(rate.extra_adult)} · CWB {inr(rate.child_with_bed)} · CNB {inr(rate.child_without_bed)}</>}
              {refId && hotelRates.length > 0 && !rate && "Choose room type and meal plan."}
            </div>
          </div>
        )}

        {type === "activity" && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Field label="Activity / sightseeing" className="col-span-2">
              <Select value={refId} onChange={(e) => pick(e.target.value)}>
                <option value="">Choose… (or type title below)</option>
                {masters.activities.filter((a) => a.is_active && (!dest || a.destination_id === dest)).map((a) => <option key={a.id} value={a.id}>{a.name} · {inr(a.cost_adult)}/adult</option>)}
              </Select>
            </Field>
            <Field label="Adults"><Input type="number" min={0} value={d.adults ?? trip.adults} onChange={(e) => { setManualCost(false); set("adults")(e); }} /></Field>
            <Field label="Children"><Input type="number" min={0} value={d.children ?? trip.children} onChange={(e) => { setManualCost(false); set("children")(e); }} /></Field>
          </div>
        )}

        {type === "transfer" && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Field label="Transfer / cab" className="col-span-2">
              <Select value={refId} onChange={(e) => pick(e.target.value)}>
                <option value="">Choose… (or type title below)</option>
                {masters.transfers.filter((t) => t.is_active && (!dest || t.destination_id === dest)).map((t) => <option key={t.id} value={t.id}>{t.name} · Sedan {inr(vehicleRate(t, "sedan"))} / SUV {inr(vehicleRate(t, "suv"))} / Tempo {inr(vehicleRate(t, "tempo"))}</option>)}
              </Select>
            </Field>
            <Field label="Vehicles"><Input type="number" min={1} value={d.vehicles ?? 1} onChange={(e) => { setManualCost(false); set("vehicles")(e); }} /></Field>
            <Field label="Vehicle type">
              <Select value={d.vehicle_type ?? "sedan"} onChange={(e) => { setManualCost(false); set("vehicle_type")(e); }}>
                {VEHICLE_TYPES.map((v) => <option key={v.value} value={v.value}>{v.label}</option>)}
              </Select>
            </Field>
          </div>
        )}

        {(type === "flight" || type === "train") && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Field label={type === "flight" ? "Airline" : "Train"}><Input value={d.carrier ?? ""} onChange={set("carrier")} /></Field>
            <Field label={type === "flight" ? "Flight no." : "Train no."}><Input value={d.number ?? ""} onChange={set("number")} /></Field>
            <Field label="From"><Input value={d.from ?? ""} onChange={set("from")} /></Field>
            <Field label="To"><Input value={d.to ?? ""} onChange={set("to")} /></Field>
            <Field label="Departure"><Input type="datetime-local" value={d.depart ?? ""} onChange={set("depart")} /></Field>
            <Field label="Arrival"><Input type="datetime-local" value={d.arrive ?? ""} onChange={set("arrive")} /></Field>
            <Field label="Class"><Input value={d.class ?? ""} onChange={set("class")} placeholder="Economy / 3A" /></Field>
            <Field label="PNR"><Input value={d.pnr ?? ""} onChange={set("pnr")} /></Field>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Field label="Title shown to customer" className="col-span-2" required>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={type === "flight" ? "Delhi → Srinagar flight" : type === "visa" ? "Dubai tourist visa (30 days)" : ""} />
          </Field>
          <Field label="Supplier">
            <Select value={supplier} onChange={(e) => setSupplier(e.target.value)}>
              <option value="">—</option>
              {masters.suppliers.filter((s) => s.is_active).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          </Field>
          <div />
          <Field label="Net cost (₹)" hint={auto != null ? `Auto: ${inr(auto)}${manualCost ? " — edited" : ""}` : "Enter supplier cost"}>
            <Input type="number" min={0} value={cost} onChange={(e) => { setManualCost(true); setCost(Number(e.target.value)); }} />
          </Field>
          <Field label="Markup override (₹)" hint="Blank = use quote markup">
            <Input type="number" value={markup} onChange={(e) => setMarkup(e.target.value)} />
          </Field>
          <Field label="Notes for customer" className="col-span-2">
            <Textarea className="min-h-[38px]" rows={1} value={d.note ?? ""} onChange={set("note")} />
          </Field>
        </div>
      </div>
    </Modal>
  );
}

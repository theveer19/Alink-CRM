"use client";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { sb } from "@/lib/supabase/client";
import { MEAL_PLANS, SERVICE_TYPES } from "@/lib/constants";
import type { BookingService, Hotel, Supplier } from "@/lib/types";
import { Button, Field, Input, Modal, Select, Textarea } from "./ui";

export function ServiceForm({ open, onClose, bookingId, service, onSaved, suppliers, hotels }: {
  open: boolean; onClose: () => void; bookingId: string; service?: BookingService | null; onSaved: () => void; suppliers: Supplier[]; hotels: Hotel[];
}) {
  const [f, setF] = useState<any>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setF(service ? { ...service, details: { ...(service.details ?? {}) } } : { service_type: "hotel", status: "pending", cost: 0, sell: 0, title: "", details: {} });
  }, [open, service]);

  const set = (k: string, v: unknown) => setF({ ...f, [k]: v });
  const setD = (k: string, v: unknown) => setF({ ...f, details: { ...f.details, [k]: v } });
  const D = (k: string) => ({ value: f.details?.[k] ?? "", onChange: (e: { target: { value: string } }) => setD(k, e.target.value) });

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!f.title?.trim()) return toast.error("Title required");
    setBusy(true);
    const payload = {
      booking_id: bookingId, service_type: f.service_type, supplier_id: f.supplier_id || null, title: f.title.trim(), details: f.details ?? {},
      start_date: f.start_date || null, end_date: f.end_date || null, confirmation_no: f.confirmation_no || null, status: f.status,
      cost: Number(f.cost || 0), sell: Number(f.sell || 0),
    };
    const { error } = service ? await sb().from("booking_services").update(payload).eq("id", service.id) : await sb().from("booking_services").insert(payload);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Service saved");
    onSaved();
    onClose();
  }

  const t = f.service_type;
  return (
    <Modal open={open} onClose={onClose} title={service ? "Edit service" : "Add service"} size="lg"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button form="svc-form" loading={busy}>Save</Button></>}>
      <form id="svc-form" onSubmit={save} className="space-y-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Field label="Type"><Select value={t} onChange={(e) => set("service_type", e.target.value)}>{SERVICE_TYPES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}</Select></Field>
          <Field label="Title" className="col-span-2" required><Input value={f.title ?? ""} onChange={(e) => set("title", e.target.value)} /></Field>
          <Field label="Status"><Select value={f.status} onChange={(e) => set("status", e.target.value)}><option value="pending">Pending</option><option value="confirmed">Confirmed</option><option value="cancelled">Cancelled</option></Select></Field>
          <Field label="Supplier"><Select value={f.supplier_id ?? ""} onChange={(e) => set("supplier_id", e.target.value)}><option value="">—</option>{suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
          <Field label="Confirmation no."><Input value={f.confirmation_no ?? ""} onChange={(e) => set("confirmation_no", e.target.value)} /></Field>
          <Field label={t === "hotel" ? "Check-in" : "Date"}><Input type="date" value={f.start_date ?? ""} onChange={(e) => set("start_date", e.target.value)} /></Field>
          <Field label={t === "hotel" ? "Check-out" : "End date"}><Input type="date" value={f.end_date ?? ""} onChange={(e) => set("end_date", e.target.value)} /></Field>
        </div>

        {t === "hotel" && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Field label="Hotel (master)" className="col-span-2">
              <Select value={f.details?.hotel_id ?? ""} onChange={(e) => { const h = hotels.find((x) => x.id === e.target.value); setF({ ...f, title: f.title || h?.name || "", supplier_id: f.supplier_id || h?.supplier_id || null, details: { ...f.details, hotel_id: e.target.value, hotel_name: h?.name } }); }}>
                <option value="">—</option>{hotels.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
              </Select>
            </Field>
            <Field label="Room type"><Input {...D("room_type")} /></Field>
            <Field label="Meal plan"><Select {...D("meal_plan")}><option value="">—</option>{MEAL_PLANS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}</Select></Field>
            <Field label="Rooms"><Input type="number" {...D("rooms")} /></Field>
            <Field label="Nights"><Input type="number" {...D("nights")} /></Field>
            <Field label="Extra bed / child"><Input {...D("extra")} placeholder="1 extra bed" /></Field>
          </div>
        )}
        {(t === "flight" || t === "train") && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Field label={t === "flight" ? "Airline" : "Train name"}><Input {...D("carrier")} /></Field>
            <Field label="Number"><Input {...D("number")} /></Field>
            <Field label="PNR"><Input {...D("pnr")} /></Field>
            <Field label="Class"><Input {...D("class")} /></Field>
            <Field label="From"><Input {...D("from")} /></Field>
            <Field label="To"><Input {...D("to")} /></Field>
            <Field label="Departure"><Input type="datetime-local" {...D("depart")} /></Field>
            <Field label="Arrival"><Input type="datetime-local" {...D("arrive")} /></Field>
            <Field label="Baggage"><Input {...D("baggage")} placeholder="15kg + 7kg" /></Field>
          </div>
        )}
        {t === "cab" && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Field label="Vehicle"><Input {...D("vehicle_type")} placeholder="Innova Crysta" /></Field>
            <Field label="Vehicle no."><Input {...D("vehicle_no")} /></Field>
            <Field label="Driver name"><Input {...D("driver_name")} /></Field>
            <Field label="Driver phone"><Input {...D("driver_phone")} /></Field>
            <Field label="Pickup point" className="col-span-2"><Input {...D("pickup")} /></Field>
            <Field label="Pickup time"><Input {...D("pickup_time")} placeholder="10:00 AM" /></Field>
            <Field label="Drop point"><Input {...D("drop")} /></Field>
          </div>
        )}
        {t === "tour" && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Field label="Reporting time"><Input {...D("reporting_time")} /></Field>
            <Field label="Meeting point" className="col-span-2"><Input {...D("meeting_point")} /></Field>
            <Field label="Duration"><Input {...D("duration")} /></Field>
          </div>
        )}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Field label="Pax / guests"><Input {...D("pax")} placeholder="2 Adults, 1 Child" /></Field>
          <Field label="Net cost ₹" hint="Supplier price"><Input type="number" value={f.cost ?? 0} onChange={(e) => set("cost", e.target.value)} /></Field>
          <Field label="Sell price ₹" hint="Customer price"><Input type="number" value={f.sell ?? 0} onChange={(e) => set("sell", e.target.value)} /></Field>
        </div>
        <Field label="Notes on voucher"><Textarea rows={2} {...D("note")} /></Field>
      </form>
    </Modal>
  );
}

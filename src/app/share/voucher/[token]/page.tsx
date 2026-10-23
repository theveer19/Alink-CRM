import { adminClient } from "@/lib/supabase/admin";
import { getSettings, isUuid } from "@/lib/share";
import { fmtDate } from "@/lib/utils";
import { MEAL_PLANS } from "@/lib/constants";
import { DocHeader, DocShell, NotFound } from "@/components/doc-parts";

export const dynamic = "force-dynamic";

const TITLES: Record<string, string> = { hotel: "Hotel Voucher", flight: "Flight / Travel Voucher", cab: "Transport Voucher", tour: "Tour Voucher", combined: "Travel Voucher" };
const ICON: Record<string, string> = { hotel: "🏨", flight: "✈️", train: "🚆", cab: "🚗", tour: "📸", visa: "🛂", insurance: "🛡️", other: "•" };

export default async function SharedVoucher({ params }: { params: { token: string } }) {
  if (!isUuid(params.token)) return <NotFound what="voucher" />;
  const { data: v } = await adminClient().from("vouchers").select("*").eq("share_token", params.token).single();
  if (!v) return <NotFound what="voucher" />;
  const s = await getSettings();
  const c = s.brand_color;
  const d = v.data ?? {};
  const meal = (m: string) => MEAL_PLANS.find((x) => x.value === m)?.label ?? m;
  const dt = (x: string | undefined) => (x ? x.replace("T", " ") : "");

  return (
    <DocShell s={s} title={`${v.voucher_no} – ${s.company_name}`}>
      <DocHeader s={s} right={<><p className="text-lg font-bold uppercase" style={{ color: c }}>{TITLES[v.voucher_type] ?? "Voucher"}</p><p className="text-sm font-semibold">{v.voucher_no}</p><p className="text-xs text-slate-500">Issued {fmtDate(v.created_at)}</p></>} />

      <div className="mt-5 grid gap-3 rounded-xl p-4 text-white sm:grid-cols-3" style={{ background: c }}>
        <div><p className="text-[11px] uppercase opacity-80">Guest</p><p className="font-semibold">{d.guest?.name}</p><p className="text-xs opacity-90">{d.guest?.phone}</p></div>
        <div><p className="text-[11px] uppercase opacity-80">Travellers</p><p className="font-semibold">{d.pax?.adults} Adult(s){d.pax?.children ? `, ${d.pax.children} Child` : ""}{d.pax?.infants ? `, ${d.pax.infants} Infant` : ""}</p></div>
        <div><p className="text-[11px] uppercase opacity-80">Booking</p><p className="font-semibold">{d.booking?.booking_no}</p><p className="text-xs opacity-90">{d.booking?.start_date ? `${fmtDate(d.booking.start_date)} – ${fmtDate(d.booking.end_date)}` : ""}</p></div>
      </div>

      <div className="mt-5 space-y-4">
        {(d.services ?? []).map((x: any) => (
          <div key={x.id} className="avoid-break rounded-xl border border-slate-200 p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <p className="text-base font-semibold text-slate-900">{ICON[x.type] ?? "•"} {x.title}</p>
              {x.confirmation_no && <p className="rounded bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700">Conf. # {x.confirmation_no}</p>}
            </div>
            <div className="mt-2 grid gap-x-6 gap-y-1 text-[13px] text-slate-700 sm:grid-cols-2">
              {x.type === "hotel" && (
                <>
                  {x.hotel?.address && <p className="sm:col-span-2">📍 {x.hotel.address}</p>}
                  {(x.hotel?.phone || x.supplier?.phone) && <p>📞 {x.hotel?.phone ?? x.supplier?.phone}</p>}
                  <p>Check-in: <b>{fmtDate(x.start_date)}</b>{x.hotel?.check_in_time ? ` (${x.hotel.check_in_time})` : ""}</p>
                  <p>Check-out: <b>{fmtDate(x.end_date)}</b>{x.hotel?.check_out_time ? ` (${x.hotel.check_out_time})` : ""}</p>
                  {x.details?.room_type && <p>Room: {x.details.rooms ? `${x.details.rooms} × ` : ""}{x.details.room_type}</p>}
                  {x.details?.meal_plan && <p>Meal plan: {meal(x.details.meal_plan)}</p>}
                  {x.details?.extra && <p>Extra: {x.details.extra}</p>}
                </>
              )}
              {(x.type === "flight" || x.type === "train") && (
                <>
                  <p>{x.details?.carrier} {x.details?.number}</p>
                  {x.details?.pnr && <p>PNR: <b>{x.details.pnr}</b></p>}
                  {x.details?.from && <p>{x.details.from} → {x.details.to}</p>}
                  {x.details?.class && <p>Class: {x.details.class}</p>}
                  {x.details?.depart && <p>Departure: <b>{dt(x.details.depart)}</b></p>}
                  {x.details?.arrive && <p>Arrival: {dt(x.details.arrive)}</p>}
                  {x.details?.baggage && <p>Baggage: {x.details.baggage}</p>}
                  {!x.details?.depart && x.start_date && <p>Date: {fmtDate(x.start_date)}</p>}
                </>
              )}
              {x.type === "cab" && (
                <>
                  <p>Date: <b>{fmtDate(x.start_date)}</b>{x.end_date && x.end_date !== x.start_date ? ` – ${fmtDate(x.end_date)}` : ""}</p>
                  {x.details?.vehicle_type && <p>Vehicle: {x.details.vehicle_type} {x.details.vehicle_no ? `(${x.details.vehicle_no})` : ""}</p>}
                  {x.details?.driver_name && <p>Driver: <b>{x.details.driver_name}</b> {x.details.driver_phone}</p>}
                  {x.details?.pickup && <p>Pickup: {x.details.pickup}{x.details.pickup_time ? ` at ${x.details.pickup_time}` : ""}</p>}
                  {x.details?.drop && <p>Drop: {x.details.drop}</p>}
                </>
              )}
              {!["hotel", "flight", "train", "cab"].includes(x.type) && (
                <>
                  {x.start_date && <p>Date: <b>{fmtDate(x.start_date)}</b></p>}
                  {x.details?.reporting_time && <p>Reporting: {x.details.reporting_time}</p>}
                  {x.details?.meeting_point && <p>Meeting point: {x.details.meeting_point}</p>}
                  {x.details?.duration && <p>Duration: {x.details.duration}</p>}
                </>
              )}
              {x.details?.pax && <p>Guests: {x.details.pax}</p>}
              {x.supplier?.name && x.type !== "hotel" && <p>Service by: {x.supplier.name}{x.supplier.phone ? ` · ${x.supplier.phone}` : ""}</p>}
              {x.details?.note && <p className="sm:col-span-2 text-slate-500">Note: {x.details.note}</p>}
            </div>
          </div>
        ))}
      </div>

      {v.notes && <p className="mt-5 whitespace-pre-wrap rounded-lg bg-amber-50 p-3 text-[12px] text-amber-900">{v.notes}</p>}
      <div className="mt-6 rounded-xl bg-slate-50 p-4 text-[13px]">
        <p className="font-semibold">24×7 assistance</p>
        <p className="text-slate-600">{s.company_name} · {[s.phone, s.email].filter(Boolean).join(" · ")}</p>
      </div>
      <p className="mt-4 text-center text-[10px] text-slate-400">Please show this voucher (printed or on mobile) at check-in / pickup along with a valid photo ID.</p>
    </DocShell>
  );
}

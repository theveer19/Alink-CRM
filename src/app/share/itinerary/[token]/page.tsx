import { adminClient } from "@/lib/supabase/admin";
import { getSettings, isUuid } from "@/lib/share";
import { quoteTotals } from "@/lib/pricing";
import { addDays, fmtDate, inr, waLink } from "@/lib/utils";
import { MEAL_PLANS, VEHICLE_TYPES } from "@/lib/constants";
import { DocHeader, DocShell, NotFound, SectionTitle } from "@/components/doc-parts";
import { QuoteResponse } from "@/components/quote-response";

export const dynamic = "force-dynamic";

const ICON: Record<string, string> = { hotel: "🏨", transfer: "🚗", activity: "📸", flight: "✈️", train: "🚆", visa: "🛂", insurance: "🛡️", other: "•" };

export default async function SharedItinerary({ params }: { params: { token: string } }) {
  if (!isUuid(params.token)) return <NotFound what="itinerary" />;
  const supa = adminClient();
  const { data: it } = await supa.from("itineraries").select("*").eq("share_token", params.token).single();
  if (!it) return <NotFound what="itinerary" />;
  const [s, days, items, contact, dests, creator] = await Promise.all([
    getSettings(),
    supa.from("itinerary_days").select("*").eq("itinerary_id", it.id).order("day_no"),
    supa.from("itinerary_items").select("*").eq("itinerary_id", it.id).order("day_no").order("sort"),
    it.contact_id ? supa.from("contacts").select("name, phone").eq("id", it.contact_id).single() : Promise.resolve({ data: null }),
    supa.from("destinations").select("id, name, description"),
    it.created_by ? supa.from("profiles").select("full_name, phone, email").eq("id", it.created_by).single() : Promise.resolve({ data: null }),
  ]);
  const its = items.data ?? [];
  const t = quoteTotals(its.map((x: any) => ({ cost: Number(x.cost), markup: x.markup == null ? null : Number(x.markup) })), {
    markup_type: it.markup_type, markup_value: Number(it.markup_value), discount: Number(it.discount), gst_percent: Number(it.gst_percent), gst_mode: it.gst_mode, tcs_percent: Number(it.tcs_percent),
  });
  const c = s.brand_color;
  const hotels = its.filter((x: any) => x.item_type === "hotel");
  const pax = Number(it.adults) + Number(it.children);
  const meal = (m: string) => MEAL_PLANS.find((x) => x.value === m)?.label.split("–")[1]?.trim() ?? m;
  const agent = creator.data as { full_name: string; phone: string | null; email: string | null } | null;
  const destName = (id: string | null) => (dests.data ?? []).find((d: any) => d.id === id)?.name;
  const destDesc = (id: string | null) => (dests.data ?? []).find((d: any) => d.id === id)?.description;
  const dayRows = (days.data ?? []) as any[];
  const vt = VEHICLE_TYPES.find((v) => v.value === it.vehicle_type);
  // which hotel the guest sleeps in on each night (day number)
  const nightHotel: Record<number, any> = {};
  hotels.forEach((h: any) => { for (let k = 0; k < Number(h.details?.nights ?? 1); k++) nightHotel[Number(h.day_no) + k] = h; });
  const endDate = it.start_date ? addDays(it.start_date, it.nights) : null;
  const incl = splitLines(it.inclusions);
  const excl = splitLines(it.exclusions);

  return (
    <DocShell s={s} title={`${it.title} – ${s.company_name}`}>
      <DocHeader s={s} right={<><p className="text-xs uppercase text-slate-400">Quotation</p><p className="font-semibold">{it.quote_no}{it.version > 1 ? ` (v${it.version})` : ""}</p><p className="text-xs text-slate-500">{fmtDate(it.created_at)}</p></>} />

      {it.cover_image && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={it.cover_image} alt="" className="mt-5 h-56 w-full rounded-xl object-cover" />
      )}
      <div className="mt-5 rounded-xl p-5 text-white" style={{ background: c }}>
        <h1 className="text-2xl font-bold">{it.title}</h1>
        <p className="mt-1 text-sm opacity-90">
          {contact.data?.name ? `Prepared for ${contact.data.name} · ` : ""}{it.nights}N / {it.nights + 1}D
          {it.start_date ? ` · ${fmtDate(it.start_date)} – ${fmtDate(addDays(it.start_date, it.nights))}` : ""}
          {` · ${it.adults} Adult${it.adults > 1 ? "s" : ""}`}{it.children ? `, ${it.children} Child` : ""}{it.infants ? `, ${it.infants} Infant` : ""}
        </p>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-[12px] sm:grid-cols-4">
        <Chip k="Duration" v={`${it.nights} Nights / ${it.nights + 1} Days`} />
        <Chip k="Travellers" v={`${it.adults} Adult${it.adults > 1 ? "s" : ""}${it.children ? ` + ${it.children} Child` : ""}${it.infants ? ` + ${it.infants} Infant` : ""}`} />
        <Chip k="Rooms" v={`${it.rooms} Room${it.rooms > 1 ? "s" : ""}`} />
        <Chip k="Vehicle" v={it.vehicle_type === "none" || !vt ? "Not included" : `${vt.label}${it.vehicles > 1 ? ` × ${it.vehicles}` : ""} (${vt.models})`} />
      </div>
      {(it.pickup_point || it.drop_point) && (
        <div className="avoid-break mt-3 grid gap-2 sm:grid-cols-2">
          {it.pickup_point && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-[13px]">
              <p className="text-[11px] font-semibold uppercase text-emerald-700">Pickup / arrival</p>
              <p className="font-medium text-slate-800">{it.pickup_point}</p>
              <p className="text-slate-600">{[it.start_date && fmtDate(it.start_date), it.pickup_time, it.arrival_details].filter(Boolean).join(" · ")}</p>
            </div>
          )}
          {it.drop_point && (
            <div className="rounded-lg border border-sky-200 bg-sky-50 p-3 text-[13px]">
              <p className="text-[11px] font-semibold uppercase text-sky-700">Drop / departure</p>
              <p className="font-medium text-slate-800">{it.drop_point}</p>
              <p className="text-slate-600">{[endDate && fmtDate(endDate), it.drop_time, it.departure_details].filter(Boolean).join(" · ")}</p>
            </div>
          )}
        </div>
      )}
      {it.overview && <p className="mt-4 whitespace-pre-wrap text-sm text-slate-700">{it.overview}</p>}

      <SectionTitle color={c}>Day-wise itinerary</SectionTitle>
      <div className="space-y-4">
        {dayRows.map((d: any, i: number) => {
          const dayItems = its.filter((x: any) => x.day_no === d.day_no && x.details?.auto !== "transfer" && x.item_type !== "hotel");
          const from = i === 0 ? null : dayRows[i - 1]?.stay_destination_id;
          const stay = d.stay_destination_id;
          const isLast = i === dayRows.length - 1;
          const checkIn = hotels.find((h: any) => Number(h.day_no) === d.day_no);
          const overnight = nightHotel[d.day_no];
          const desc = d.description || destDesc(stay) || destDesc(d.destination_id);
          return (
            <div key={d.id} className="avoid-break flex gap-4">
              <div className="flex flex-col items-center">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white" style={{ background: c }}>D{d.day_no}</div>
                {i < dayRows.length - 1 && <div className="w-px flex-1 bg-slate-200" />}
              </div>
              <div className="flex-1 pb-2">
                <p className="font-semibold text-slate-900">{d.title}</p>
                <p className="text-xs text-slate-500">
                  {it.start_date ? fmtDate(addDays(it.start_date, i)) : `Day ${d.day_no}`}
                  {(from || stay || d.destination_id) && <> · 📍 {i === 0 ? (it.pickup_point || destName(d.destination_id) || "Arrival") : destName(from) || destName(d.destination_id)}{!isLast && stay && <> → 🌙 {destName(stay)}</>}{isLast && it.drop_point ? <> → {it.drop_point}</> : ""}</>}
                  {d.meals ? ` · Meals: ${d.meals}` : ""}
                </p>
                {desc && <p className="mt-1 whitespace-pre-wrap text-[13px] leading-relaxed text-slate-700">{desc}</p>}
                <ul className="mt-2 space-y-1">
                  {checkIn && (
                    <li className="rounded-md bg-slate-50 px-3 py-1.5 text-[13px] text-slate-700">
                      🏨 Check-in at <b>{checkIn.title}</b>
                      <span className="text-slate-500"> — {checkIn.details?.room_type}{checkIn.details?.meal_plan ? `, ${meal(checkIn.details.meal_plan)}` : ""}, {checkIn.details?.nights} night{Number(checkIn.details?.nights) > 1 ? "s" : ""}{checkIn.details?.check_in_time ? ` · check-in ${checkIn.details.check_in_time}` : ""}</span>
                    </li>
                  )}
                  {!checkIn && overnight && !isLast && <li className="px-1 text-[12px] text-slate-500">🌙 Overnight at {overnight.title}</li>}
                  {dayItems.map((x: any) => (
                    <li key={x.id} className="rounded-md bg-slate-50 px-3 py-1.5 text-[13px] text-slate-700">
                      {ICON[x.item_type]} <b>{x.title}</b>
                      {(x.item_type === "flight" || x.item_type === "train") && <span className="text-slate-500"> — {[x.details?.carrier, x.details?.number, x.details?.from && `${x.details.from} → ${x.details.to}`, x.details?.depart && x.details.depart.replace("T", " ")].filter(Boolean).join(" · ")}</span>}
                      {x.item_type === "transfer" && x.details?.vehicle_type && <span className="text-slate-500"> — {x.details.vehicles ?? 1} × {x.details.vehicle_type}</span>}
                      {x.details?.note && <span className="block text-xs text-slate-500">{x.details.note}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          );
        })}
      </div>

      {hotels.length > 0 && (
        <>
          <SectionTitle color={c}>Accommodation</SectionTitle>
          <table className="w-full text-[13px]">
            <thead><tr className="text-left text-xs uppercase text-slate-500"><th className="border-b py-1.5">City</th><th className="border-b">Hotel</th><th className="border-b">Check-in</th><th className="border-b">Check-out</th><th className="border-b">Nights</th><th className="border-b">Room</th><th className="border-b">Meals</th></tr></thead>
            <tbody>
              {hotels.map((h: any) => {
                const cin = h.details?.check_in ?? (it.start_date ? addDays(it.start_date, Number(h.day_no) - 1) : null);
                const cout = h.details?.check_out ?? (cin ? addDays(cin, Number(h.details?.nights ?? 1)) : null);
                return (
                  <tr key={h.id}>
                    <td className="border-b py-1.5">{h.details?.destination ?? ""}</td>
                    <td className="border-b font-medium">{h.title}</td>
                    <td className="border-b">{cin ? fmtDate(cin) : `Day ${h.day_no}`}</td>
                    <td className="border-b">{cout ? fmtDate(cout) : ""}</td>
                    <td className="border-b">{h.details?.nights}</td>
                    <td className="border-b">{h.details?.rooms} × {h.details?.room_type}</td>
                    <td className="border-b">{meal(h.details?.meal_plan ?? "")}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </>
      )}

      <SectionTitle color={c}>Package cost</SectionTitle>
      <div className="avoid-break rounded-xl border border-slate-200 p-4">
        {it.show_item_prices && its.length > 0 && (
          <table className="mb-3 w-full text-[13px]">
            <tbody>
              {its.map((x: any, i: number) => <tr key={x.id}><td className="py-1 text-slate-700">{x.title}</td><td className="py-1 text-right">{inr(t.lineSell[i])}</td></tr>)}
            </tbody>
          </table>
        )}
        <div className="space-y-1 text-sm">
          {t.discount > 0 && <div className="flex justify-between"><span>Package price</span><span>{inr(t.subtotal + t.discount)}</span></div>}
          {t.discount > 0 && <div className="flex justify-between text-emerald-700"><span>Discount</span><span>− {inr(t.discount)}</span></div>}
          <div className="flex justify-between"><span>Package cost{t.gst_total > 0 ? " (before GST)" : ""}</span><span>{inr(t.subtotal)}</span></div>
          {t.gst_total > 0 && <div className="flex justify-between"><span>GST @ {Number(it.gst_percent)}%{it.gst_mode === "markup" ? " on service fee" : ""}</span><span>{inr(t.gst_total)}</span></div>}
          {t.tcs_total > 0 && <div className="flex justify-between"><span>TCS @ {Number(it.tcs_percent)}%</span><span>{inr(t.tcs_total)}</span></div>}
          <div className="mt-2 flex items-end justify-between border-t pt-2">
            <span className="font-semibold">Total payable</span>
            <span className="text-2xl font-bold" style={{ color: c }}>{inr(t.grand_total)}</span>
          </div>
          {pax > 0 && <p className="text-right text-xs text-slate-500">≈ {inr(t.grand_total / pax)} per person</p>}
          {it.valid_till && <p className="text-xs text-slate-500">Quote valid till {fmtDate(it.valid_till)}. Prices subject to availability at the time of booking.</p>}
        </div>
      </div>

      {incl.length > 0 && (
        <div className="avoid-break">
          <SectionTitle color="#059669">✓ Tour inclusions</SectionTitle>
          <ul className="space-y-1">{incl.map((x, k) => <li key={k} className="flex gap-2 text-[13px] text-slate-700"><span className="font-bold text-emerald-600">✓</span>{x}</li>)}</ul>
        </div>
      )}
      {excl.length > 0 && (
        <div className="avoid-break">
          <SectionTitle color="#dc2626">✗ Tour exclusions</SectionTitle>
          <ul className="space-y-1">{excl.map((x, k) => <li key={k} className="flex gap-2 text-[13px] text-slate-700"><span className="font-bold text-rose-600">✗</span>{x}</li>)}</ul>
        </div>
      )}
      {it.terms && (<><SectionTitle color={c}>Terms & policies</SectionTitle><p className="whitespace-pre-wrap text-[12px] leading-relaxed text-slate-600">{it.terms}</p></>)}
      {(s.bank_account_no || s.upi_id) && (
        <>
          <SectionTitle color={c}>Payment details</SectionTitle>
          <p className="text-[12px] text-slate-700">
            {s.bank_account_no && <>{[s.bank_name, s.bank_account_name && `A/c name: ${s.bank_account_name}`, `A/c no: ${s.bank_account_no}`, s.bank_ifsc && `IFSC: ${s.bank_ifsc}`].filter(Boolean).join(" · ")}<br /></>}
            {s.upi_id && <>UPI: {s.upi_id}</>}
          </p>
        </>
      )}

      <div className="avoid-break mt-8 flex flex-wrap items-center justify-between gap-4 rounded-xl bg-slate-50 p-4">
        <div className="text-sm">
          <p className="font-semibold">{agent?.full_name ?? s.company_name}</p>
          <p className="text-slate-600">{[agent?.phone ?? s.phone, agent?.email ?? s.email].filter(Boolean).join(" · ")}</p>
        </div>
        <div className="no-print">
          <QuoteResponse token={params.token} status={it.status} whatsapp={waLink(agent?.phone || s.phone, `Hi, I'm interested in ${it.title} (${it.quote_no}).`)} />
        </div>
      </div>
    </DocShell>
  );
}

function splitLines(t: string | null | undefined) {
  return (t ?? "").split("\n").map((x) => x.replace(/^[-•*✓✔✗✘]\s*/, "").trim()).filter(Boolean);
}

function Chip({ k, v }: { k: string; v: string }) {
  return (
    <div className="rounded-lg bg-slate-50 px-3 py-2">
      <p className="text-[10px] font-semibold uppercase text-slate-400">{k}</p>
      <p className="font-medium text-slate-800">{v}</p>
    </div>
  );
}

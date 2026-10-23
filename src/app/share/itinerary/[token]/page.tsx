import { adminClient } from "@/lib/supabase/admin";
import { getSettings, isUuid } from "@/lib/share";
import { quoteTotals } from "@/lib/pricing";
import { addDays, fmtDate, inr, waLink } from "@/lib/utils";
import { MEAL_PLANS } from "@/lib/constants";
import { DocHeader, DocShell, Lines, NotFound, SectionTitle } from "@/components/doc-parts";
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
    supa.from("destinations").select("id, name"),
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
      {it.overview && <p className="mt-4 whitespace-pre-wrap text-sm text-slate-700">{it.overview}</p>}

      <SectionTitle color={c}>Day-wise itinerary</SectionTitle>
      <div className="space-y-4">
        {(days.data ?? []).map((d: any, i: number) => {
          const dayItems = its.filter((x: any) => x.day_no === d.day_no);
          return (
            <div key={d.id} className="avoid-break flex gap-4">
              <div className="flex flex-col items-center">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white" style={{ background: c }}>D{d.day_no}</div>
                {i < (days.data ?? []).length - 1 && <div className="w-px flex-1 bg-slate-200" />}
              </div>
              <div className="flex-1 pb-2">
                <p className="font-semibold text-slate-900">{d.title}{destName(d.destination_id) ? <span className="font-normal text-slate-500"> · {destName(d.destination_id)}</span> : ""}</p>
                {it.start_date && <p className="text-xs text-slate-500">{fmtDate(addDays(it.start_date, i))}{d.meals ? ` · Meals: ${d.meals}` : ""}</p>}
                {d.description && <p className="mt-1 whitespace-pre-wrap text-[13px] leading-relaxed text-slate-700">{d.description}</p>}
                {dayItems.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {dayItems.map((x: any) => (
                      <li key={x.id} className="rounded-md bg-slate-50 px-3 py-1.5 text-[13px] text-slate-700">
                        {ICON[x.item_type]} <b>{x.title}</b>
                        {x.item_type === "hotel" && <span className="text-slate-500"> — {x.details?.room_type}{x.details?.meal_plan ? `, ${meal(x.details.meal_plan)}` : ""}, {x.details?.nights} night{Number(x.details?.nights) > 1 ? "s" : ""}{x.details?.rooms ? `, ${x.details.rooms} room(s)` : ""}</span>}
                        {(x.item_type === "flight" || x.item_type === "train") && <span className="text-slate-500"> — {[x.details?.carrier, x.details?.number, x.details?.from && `${x.details.from} → ${x.details.to}`, x.details?.depart && x.details.depart.replace("T", " ")].filter(Boolean).join(" · ")}</span>}
                        {x.item_type === "transfer" && x.details?.vehicle_type && <span className="text-slate-500"> — {x.details.vehicles ?? 1} × {x.details.vehicle_type}</span>}
                        {x.details?.note && <span className="block text-xs text-slate-500">{x.details.note}</span>}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {hotels.length > 0 && (
        <>
          <SectionTitle color={c}>Accommodation</SectionTitle>
          <table className="w-full text-[13px]">
            <thead><tr className="text-left text-xs uppercase text-slate-500"><th className="border-b py-1.5">Hotel</th><th className="border-b">Check-in</th><th className="border-b">Nights</th><th className="border-b">Room</th><th className="border-b">Meals</th></tr></thead>
            <tbody>
              {hotels.map((h: any) => (
                <tr key={h.id}><td className="border-b py-1.5 font-medium">{h.title}</td><td className="border-b">{h.details?.check_in ? fmtDate(h.details.check_in) : `Day ${h.day_no}`}</td><td className="border-b">{h.details?.nights}</td><td className="border-b">{h.details?.rooms} × {h.details?.room_type}</td><td className="border-b">{meal(h.details?.meal_plan ?? "")}</td></tr>
              ))}
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

      <div className="mt-2 grid gap-6 sm:grid-cols-2">
        {it.inclusions && <div><SectionTitle color={c}>Inclusions</SectionTitle><Lines text={it.inclusions} /></div>}
        {it.exclusions && <div><SectionTitle color={c}>Exclusions</SectionTitle><Lines text={it.exclusions} /></div>}
      </div>
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

import type { ReactNode } from "react";
import { adminClient } from "@/lib/supabase/admin";
import { getSettings, isUuid } from "@/lib/share";
import { addDaysIso } from "@/lib/pricing";
import { finalExclusions, lines, nightsLabel, normVehicles, shortDate, vehiclesLabel } from "@/lib/package";
import { fmtDate, inr, waLink } from "@/lib/utils";
import { NotFound } from "@/components/doc-parts";
import { QuoteResponse } from "@/components/quote-response";
import { PrintBar } from "@/components/print-bar";
import { RichText } from "@/components/gallery";

export const dynamic = "force-dynamic";

const MEAL: Record<string, string> = { MAP: "Breakfast and Dinner", CP: "Breakfast", AP: "Breakfast, Lunch and Dinner", EP: "Room Only", AI: "All Inclusive" };

/** Package view / PDF — same layout as the portal's "Package Detail". */
export default async function PackageView({ params }: { params: { token: string } }) {
  if (!isUuid(params.token)) return <NotFound what="package" />;
  const supa = adminClient();
  const { data: it } = await supa.from("itineraries").select("*").eq("share_token", params.token).single();
  if (!it) return <NotFound what="package" />;
  const [s, daysQ, dests, plansQ, hotelsQ, vehQ, incQ, regionQ, creator, contact] = await Promise.all([
    getSettings(),
    supa.from("itinerary_days").select("*").eq("itinerary_id", it.id).order("day_no"),
    supa.from("destinations").select("id, name, region_id, image_url"),
    supa.from("transfers").select("id, name, description, images, destination_id, to_destination_id, transfer_type"),
    supa.from("hotels").select("id, name, category, images, description, check_in_time, check_out_time"),
    supa.from("vehicles").select("*"),
    supa.from("inclusion_items").select("*").eq("is_active", true),
    it.region_id ? supa.from("regions").select("*").eq("id", it.region_id).single() : Promise.resolve({ data: null }),
    it.created_by ? supa.from("profiles").select("full_name, phone, email").eq("id", it.created_by).single() : Promise.resolve({ data: null }),
    it.contact_id ? supa.from("contacts").select("name, phone").eq("id", it.contact_id).single() : Promise.resolve({ data: null }),
  ]);
  const days = (daysQ.data ?? []) as any[];
  const plans = (plansQ.data ?? []) as any[];
  const hotels = (hotelsQ.data ?? []) as any[];
  const destinations = (dests.data ?? []) as any[];
  const vehicles = (vehQ.data ?? []) as any[];
  const region = regionQ.data as any;
  const agent = creator.data as { full_name: string; phone: string | null; email: string | null } | null;
  const destName = (id: string | null) => destinations.find((d) => d.id === id)?.name ?? "";
  const planOf = (d: any) => plans.find((p) => p.id === d.day_plan_id);
  const hotelOf = (d: any) => hotels.find((h) => h.id === d.hotel_id);
  const vrows = normVehicles(it.vehicle_list, vehicles);
  const vLabel = vehiclesLabel(vrows, vehicles) || "As per itinerary";
  const acLabel = vrows.length ? (vrows.every((v) => v.ac) ? "With AC" : vrows.some((v) => v.ac) ? "AC / Without AC" : "Without AC") : "—";
  const incl = lines(it.inclusions);
  const excl = finalExclusions({ region_id: it.region_id, inclusions: it.inclusions, exclusions: it.exclusions }, { inclusions: (incQ.data ?? []) as any[], destinations });
  const amount = Number(it.grand_total);
  const meal = `${it.meal_plan} - ${MEAL[it.meal_plan] ?? it.meal_plan}`;
  const heroImg = region?.image_url || it.cover_image || destinations.find((d) => d.image_url && d.region_id === it.region_id)?.image_url || null;
  const nights = Number(it.nights);
  const wa = waLink(s.whatsapp || s.phone || "", `Hi, about package ${it.quote_no} (${it.client_name ?? ""})`);

  return (
    <div className="min-h-screen bg-[#eef2f9] py-6 print:bg-white print:py-0">
      <PrintBar title={`${it.title} – ${it.client_name ?? ""} – ${s.company_name}`} label="Download Itinerary (PDF)" />
      <div className="print-page mx-auto max-w-[900px] space-y-6 px-3 text-slate-800">
        {/* HERO */}
        <div className="avoid-break relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#10284a] via-[#173a66] to-[#1f4f86] p-6 text-white shadow-xl print:rounded-none" style={{ printColorAdjust: "exact", WebkitPrintColorAdjust: "exact" }}>
          <div className="absolute -right-16 -top-16 h-56 w-56 rounded-full bg-white/5" />
          <div className="absolute -bottom-20 -left-10 h-48 w-48 rounded-full bg-white/5" />
          <div className="relative grid gap-6 md:grid-cols-[auto_1fr_1fr]">
            <div className="flex items-center justify-center">
              <div className="flex h-28 w-28 items-center justify-center overflow-hidden rounded-full border-4 border-gold-500 bg-white">
                {s.logo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={s.logo_url} alt="" className="h-full w-full object-contain p-2" />
                ) : <span className="text-4xl font-black text-[#173a66]">{s.company_name.slice(0, 1)}</span>}
              </div>
            </div>
            <div>
              <p className="mb-2 text-[11px] font-bold uppercase tracking-[.2em] text-gold-400">Agent Details</p>
              <table className="w-full text-sm">
                <tbody>
                  {([["Name", agent?.full_name], ["Company", s.company_name], ["Address", [s.address, s.city, s.state].filter(Boolean).join(", ")], ["Email", s.email ?? agent?.email], ["Phone", s.phone ?? agent?.phone], ["Phone 2", s.phone2]] as [string, string | null | undefined][])
                    .filter(([, v]) => v).map(([k, v]) => (
                      <tr key={k} className="border-b border-white/10 last:border-0">
                        <td className="w-24 py-1.5 align-top text-white/70">{k}</td>
                        <td className="py-1.5 font-semibold">{v}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
            <div className="md:border-l md:border-white/15 md:pl-6">
              <p className="text-[11px] font-bold uppercase tracking-[.2em] text-gold-400">Package</p>
              <p className="mb-3 text-2xl font-black uppercase tracking-wide">{it.title || "Package"}</p>
              {([["Client Name", it.client_name ?? (contact.data as any)?.name], ["Arrival", it.start_date ? fmtDate(it.start_date) : "To be decided"], ["Departure", it.start_date ? fmtDate(addDaysIso(it.start_date, nights)) : "—"], ["Query No.", it.quote_no], ["Confirmation No.", it.confirmation_no]] as [string, string | null][]).map(([k, v]) => (
                <div key={k} className="mb-2 flex items-center gap-3">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white/10 text-[11px] text-gold-400">●</span>
                  <div><p className="text-[10px] font-semibold uppercase tracking-wider text-white/60">{k}</p><p className="text-sm font-bold">{v || ""}</p></div>
                </div>
              ))}
            </div>
          </div>
          <div className="relative mt-4 flex justify-end md:absolute md:right-6 md:top-6 md:mt-0">
            <div className="flex h-32 w-32 flex-col items-center justify-center rounded-full border-4 border-gold-400/60 bg-gradient-to-br from-gold-400 to-gold-600 text-center text-slate-900 shadow-lg">
              <span className="text-[9px] font-bold uppercase tracking-wider">Package Cost</span>
              <span className="text-lg font-black leading-tight">{inr(amount)}</span>
            </div>
          </div>
        </div>

        {/* DESTINATION */}
        {(region?.description || it.overview) && (
          <Block eyebrow="Where you will go" title="Destination" icon="📍">
            <div className="rounded-2xl bg-white p-5 text-[15px] leading-relaxed shadow-card"><RichText text={it.overview || region?.description} /></div>
          </Block>
        )}

        {/* OVERVIEW */}
        <Block eyebrow="At a glance" title="Tour Overview" icon="🧳">
          <div className="grid gap-4 md:grid-cols-[1.4fr_1fr]">
            <div className="overflow-hidden rounded-2xl bg-white shadow-card">
              <div className="bg-[#173a66] px-4 py-3 text-white" style={{ printColorAdjust: "exact", WebkitPrintColorAdjust: "exact" }}>
                <p className="text-[10px] font-bold uppercase tracking-widest text-white/70">Tour Duration</p>
                <p className="text-xl font-bold">{nightsLabel(nights)}</p>
              </div>
              <div className="grid grid-cols-2">
                {([["Adults", it.adults], ["Rooms", it.rooms], ["Children (above 10)", it.adults_above10], ["Extra Beds", it.extra_beds], ["Kids (5-10)", it.kids], ["CNB", it.child_no_bed]] as [string, number][]).map(([k, v]) => (
                  <div key={k} className="border-b border-r border-slate-100 px-4 py-3"><p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{k}</p><p className="text-lg font-bold text-[#173a66]">{v ?? 0}</p></div>
                ))}
              </div>
            </div>
            {heroImg ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={heroImg} alt="" className="h-full max-h-80 w-full rounded-2xl object-cover shadow-card" />
            ) : <div className="hidden rounded-2xl bg-gradient-to-br from-brand-600 to-sky-400 md:block" />}
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-6 rounded-2xl bg-[#173a66] px-5 py-4 text-sm text-white" style={{ printColorAdjust: "exact", WebkitPrintColorAdjust: "exact" }}>
            <span className="font-semibold">🚗 VEHICLE: <span className="font-normal">{vLabel}</span></span>
            <span className="h-6 w-px bg-white/30" />
            <span className="uppercase">{MEAL[it.meal_plan] ?? it.meal_plan}</span>
          </div>
        </Block>

        {/* DAY WISE */}
        <div className="rounded-2xl bg-white p-5 shadow-card">
          <h2 className="mb-4 border-b border-slate-200 pb-3 text-xl font-black tracking-wide text-slate-900">TOUR DETAIL</h2>
          <div className="space-y-6">
            {days.map((d, i) => {
              const plan = planOf(d);
              const hotel = hotelOf(d);
              const date = it.start_date ? shortDate(addDaysIso(it.start_date, i)) : null;
              const last = i >= nights;
              if (last) {
                return (
                  <div key={i} className="avoid-break flex gap-5 rounded-2xl border border-slate-200 p-5">
                    <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-5xl">🚌</div>
                    <div>
                      <p className="text-lg font-black text-[#173a66]">DAY {String(i + 1).padStart(2, "0")}{date ? ` (${date})` : ""}</p>
                      <p className="font-bold tracking-wide text-slate-800">DROP-OFF</p>
                      <span className="my-2 block h-1 w-10 rounded bg-gold-500" />
                      <p className="font-semibold">{it.drop_point ?? plan?.name}</p>
                      <RichText text={plan?.description ?? d.description} className="text-sm text-slate-600" />
                    </div>
                  </div>
                );
              }
              const pImg = plan?.images?.[0];
              const hImgs: string[] = (hotel?.images ?? []).filter(Boolean);
              return (
                <div key={i} className="avoid-break grid gap-5 md:grid-cols-[1.25fr_1fr]">
                  <div className="md:border-r md:border-slate-200 md:pr-5">
                    <div className="mb-3 rounded-lg border-l-4 border-[#173a66] bg-sky-50 px-3 py-2">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Daily Itinerary</p>
                      <p className="text-lg font-black text-[#173a66]">DAY {String(i + 1).padStart(2, "0")}{date ? ` (${date})` : ""}</p>
                    </div>
                    {pImg && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={pImg} alt="" className="mb-3 h-52 w-full rounded-xl object-cover" />
                    )}
                    <p className="text-[10px] font-bold uppercase tracking-widest text-brand-700">Destination</p>
                    <p className="mb-2 border-b border-slate-200 pb-2 text-lg font-bold text-[#173a66]">{plan?.name ?? d.title}</p>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">About this stop</p>
                    <RichText text={plan?.description ?? d.description} className="text-sm leading-relaxed text-slate-600" />
                  </div>
                  <div>
                    <div className="mb-3 rounded-lg border-l-4 border-emerald-700 bg-emerald-50 px-3 py-2">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-700">Accommodation</p>
                      <p className="text-lg font-black text-emerald-900">NIGHT STAY</p>
                    </div>
                    {hImgs[0] && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={hImgs[0]} alt="" className="h-44 w-full rounded-xl object-cover" />
                    )}
                    {hImgs.length > 1 && (
                      <div className="mt-2 grid grid-cols-3 gap-2">
                        {hImgs.slice(1, 4).map((src, k) => (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img key={k} src={src} alt="" className="h-16 w-full rounded-lg object-cover" />
                        ))}
                      </div>
                    )}
                    <div className="mt-3 rounded-lg border-l-4 border-[#173a66] bg-slate-50 px-3 py-2">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Overnight Location</p>
                      <p className="font-bold text-slate-900">{destName(d.stay_destination_id) || "—"}</p>
                    </div>
                    <div className="mt-3 space-y-2 text-sm">
                      <div className="border-b border-slate-100 pb-2"><p className="text-[10px] font-bold uppercase tracking-widest text-emerald-700">Hotel</p><p>{hotel?.name ?? "—"}{hotel?.category ? <span className="text-slate-400"> · {hotel.category}</span> : null}</p></div>
                      <div><p className="text-[10px] font-bold uppercase tracking-widest text-emerald-700">Room Type</p><p>{d.room_type ?? "—"}</p></div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* TRANSPORT */}
        <Block eyebrow="Getting around" title="Transport" icon="🚌">
          <div className="avoid-break overflow-hidden rounded-2xl bg-white shadow-card">
            <table className="w-full text-sm">
              <tbody>
                <tr className="border-b border-slate-100"><td className="w-48 bg-slate-50 px-4 py-3 font-semibold text-slate-600">Vehicle</td><td className="px-4 py-3">{vLabel}</td></tr>
                <tr><td className="bg-slate-50 px-4 py-3 font-semibold text-slate-600">Transport</td><td className="px-4 py-3">{acLabel}</td></tr>
                {it.pickup_point && <tr className="border-t border-slate-100"><td className="bg-slate-50 px-4 py-3 font-semibold text-slate-600">Pick up</td><td className="px-4 py-3">{it.pickup_point}</td></tr>}
                {it.drop_point && <tr className="border-t border-slate-100"><td className="bg-slate-50 px-4 py-3 font-semibold text-slate-600">Drop</td><td className="px-4 py-3">{it.drop_point}</td></tr>}
              </tbody>
            </table>
          </div>
        </Block>

        {/* INCLUDES */}
        <Block eyebrow="What is covered" title="Package Includes" icon="✅">
          <div className="avoid-break overflow-hidden rounded-2xl bg-white shadow-card">
            <p className="border-b-2 border-[#173a66] bg-slate-50 px-4 py-3 text-sm font-bold text-[#173a66]">{meal}</p>
            <p className="px-4 pt-3 text-[10px] font-bold uppercase tracking-widest text-emerald-700">Included</p>
            <ul className="divide-y divide-slate-100 px-4 pb-2 text-sm">
              {incl.map((l, k) => <li key={k} className="py-2">✓&nbsp; {l}</li>)}
              {incl.length === 0 && <li className="py-2 text-slate-400">—</li>}
            </ul>
          </div>
        </Block>

        {/* EXCLUDES */}
        <Block eyebrow="What is not covered" title="Package Excludes" icon="✖️">
          <div className="avoid-break overflow-hidden rounded-2xl bg-white shadow-card">
            <table className="w-full text-sm">
              <tbody>
                {excl.map((l, k) => (
                  <tr key={k} className="border-b border-slate-100 last:border-0"><td className="w-12 px-4 py-2 font-bold text-rose-600">{String(k + 1).padStart(2, "0")}</td><td className="py-2 pr-4">{l}</td></tr>
                ))}
                {excl.length === 0 && <tr><td className="px-4 py-3 text-slate-400">—</td></tr>}
              </tbody>
            </table>
          </div>
        </Block>

        {/* COST */}
        <Block eyebrow="Cost breakdown" title="Package Cost" icon="💳">
          <div className="avoid-break rounded-2xl bg-white p-5 text-[15px] leading-relaxed shadow-card">
            Dear Guest, your total package cost amounts to <b>{inr(amount)}</b>{it.include_gst ? " (inclusive of GST)" : ""}. This price covers accommodation, sightseeing and transport as per the itinerary above.
            Should you need any further assistance, please do not hesitate to reach out. Thank you for entrusting us with your travel arrangements.
          </div>
        </Block>

        {/* BANK */}
        {(s.bank_name || s.bank_account_no || s.upi_id) && (
          <Block eyebrow="Payment information" title="Bank Details" icon="🏦">
            <div className="avoid-break grid overflow-hidden rounded-2xl border border-slate-200 bg-white text-sm shadow-card sm:grid-cols-2">
              {([["🏢 Bank Name", s.bank_name], ["👤 Account Name", s.bank_account_name], ["💳 Account Number", s.bank_account_no], ["🔑 IFSC Code", s.bank_ifsc], ["📞 UPI", s.upi_id]] as [string, string | null][]).map(([k, v]) => (
                <div key={k} className="border-b border-r border-slate-100 px-4 py-3"><p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{k}</p><p className="font-semibold">{v || "—"}</p></div>
              ))}
            </div>
          </Block>
        )}

        {/* TERMS */}
        {(it.terms || region?.terms) && (
          <Block eyebrow="Please read carefully" title="Terms & Conditions" icon="📄">
            <div className="rounded-2xl bg-white p-5 text-sm leading-relaxed shadow-card">
              <RichText text={it.terms || region?.terms} />
            </div>
          </Block>
        )}

        <div className="avoid-break rounded-2xl bg-white p-6 text-center shadow-card">
          <p className="text-2xl font-black text-[#173a66]">Thank You</p>
          <p className="mt-1 text-sm text-slate-600">We look forward to hosting you. For any assistance, please contact your travel consultant{agent?.full_name ? ` ${agent.full_name}` : ""}{s.phone ? ` · ${s.phone}` : ""}.</p>
          {it.valid_till && <p className="mt-1 text-xs text-slate-400">Package valid till {fmtDate(it.valid_till)}</p>}
          <div className="no-print mt-4 flex justify-center"><QuoteResponse token={it.share_token} status={it.status} whatsapp={wa} /></div>
        </div>
        <p className="pb-6 text-center text-xs text-slate-400">© {new Date().getFullYear()} {s.company_name}</p>
      </div>
    </div>
  );
}

function Block({ eyebrow, title, icon, children }: { eyebrow: string; title: string; icon: string; children: ReactNode }) {
  return (
    <section className="avoid-break-head">
      <div className="mb-3 flex items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#173a66] text-lg shadow" style={{ printColorAdjust: "exact", WebkitPrintColorAdjust: "exact" }}>{icon}</span>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[.2em] text-gold-600">{eyebrow}</p>
          <h2 className="text-2xl font-black text-slate-900">{title}</h2>
        </div>
      </div>
      {children}
    </section>
  );
}

"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Calendar, CheckCircle2, Clock, Eye, Hourglass, Luggage, Pencil, Save, Search, Send, XCircle } from "lucide-react";
import { sb } from "@/lib/supabase/client";
import { addDaysIso } from "@/lib/pricing";
import { nightsLabel } from "@/lib/package";
import { cn, inr, isoDate } from "@/lib/utils";
import { convertToBooking } from "@/lib/actions";
import { useAuth } from "./auth";
import { ConfirmButton, Empty, Spinner } from "./ui";

type Row = {
  id: string; quote_no: string; version: number; title: string; client_name: string | null; destination: string | null; nights: number; start_date: string | null;
  pickup_point: string | null; drop_point: string | null; grand_total: number; cost_total: number; margin_amount: number; include_gst: boolean; gst_percent: number;
  status: string; agent_note: string | null; admin_note: string | null; booking_id: string | null; share_token: string; created_at: string; created_by: string | null;
  markup_type: string; markup_value: number; discount: number; gst_mode: string; tcs_percent: number; lead_id: string | null; contact_id: string | null;
  adults: number; children: number; infants: number; end_date: string | null;
};

const STATE = (s: string) => (s === "accepted" ? "confirmed" : s === "rejected" ? "rejected" : "pending");

/** Portal-style dashboard: year / month counters + "packages added" list with margin, notes and confirmation. */
export function PackagesBoard({ compact = false }: { compact?: boolean }) {
  const { can, role, userName } = useAuth();
  const router = useRouter();
  const today = isoDate();
  const [from, setFrom] = useState(addDaysIso(today, -30));
  const [to, setTo] = useState(today);
  const [q, setQ] = useState("");
  const [state, setState] = useState<"" | "pending" | "confirmed" | "rejected">("");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [stats, setStats] = useState<{ year: Row[]; month: Row[] }>({ year: [], month: [] });
  const [edits, setEdits] = useState<Record<string, Partial<Row>>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const isAdmin = !!role?.is_admin || can("itineraries", "delete");
  const year = today.slice(0, 4);
  const month = today.slice(0, 7);

  async function load() {
    const supa = sb();
    const cols = "id, quote_no, version, title, client_name, destination, nights, start_date, end_date, pickup_point, drop_point, grand_total, cost_total, margin_amount, include_gst, gst_percent, status, agent_note, admin_note, booking_id, share_token, created_at, created_by, markup_type, markup_value, discount, gst_mode, tcs_percent, lead_id, contact_id, adults, children, infants";
    const [list, ys] = await Promise.all([
      supa.from("itineraries").select(cols).gte("created_at", `${from}T00:00:00`).lte("created_at", `${to}T23:59:59.999`).order("created_at", { ascending: false }).limit(500),
      supa.from("itineraries").select("id, status, created_at").gte("created_at", `${year}-01-01T00:00:00`),
    ]);
    if (list.error) return toast.error(list.error.message);
    setRows((list.data ?? []) as Row[]);
    const y = (ys.data ?? []) as Row[];
    setStats({ year: y, month: y.filter((r) => r.created_at.slice(0, 7) === month) });
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [from, to]);

  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (rows ?? []).filter((r) => (!state || STATE(r.status) === state) && (!t || [r.client_name, r.title, r.quote_no, r.destination].some((x) => x?.toLowerCase().includes(t))));
  }, [rows, q, state]);

  const val = <K extends keyof Row>(r: Row, k: K) => (k in (edits[r.id] ?? {}) ? (edits[r.id] as Row)[k] : r[k]);
  const edit = (r: Row, p: Partial<Row>) => setEdits({ ...edits, [r.id]: { ...(edits[r.id] ?? {}), ...p } });

  async function update(r: Row, p: Record<string, unknown>, msg: string) {
    setBusy(r.id);
    const { error } = await sb().from("itineraries").update(p).eq("id", r.id);
    setBusy(null);
    if (error) return toast.error(error.message);
    toast.success(msg);
    setEdits((e) => { const n = { ...e }; delete n[r.id]; return n; });
    load();
  }

  async function saveMargin(r: Row) {
    const margin = Math.max(0, Number(val(r, "margin_amount")) || 0);
    const cost = Number(r.cost_total);
    const gst = r.include_gst ? Math.round((cost + margin) * Number(r.gst_percent)) / 100 : 0;
    await update(r, { margin_amount: margin, markup_type: "fixed", markup_value: margin, markup_total: margin, gst_total: gst, grand_total: Math.round((cost + margin + gst) * 100) / 100 }, "Margin updated");
  }

  async function confirm(r: Row) {
    setBusy(r.id);
    try {
      const items = (await sb().from("itinerary_items").select("*").eq("itinerary_id", r.id).order("sort")).data ?? [];
      if (!items.length) throw new Error("Open the package and click Calculate & Save first");
      const bId = await convertToBooking({ ...(r as any), markup_type: "fixed", markup_value: r.margin_amount, gst_percent: r.include_gst ? r.gst_percent : 0, discount: 0, tcs_percent: 0 }, items as any);
      toast.success("Confirmed — booking created");
      router.push(`/bookings/${bId}`);
    } catch (e: any) {
      toast.error(e.message);
      setBusy(null);
    }
  }

  const count = (list: Row[], s?: string) => (s ? list.filter((r) => STATE(r.status) === s).length : list.length);

  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-white p-4 shadow-card">
        <p className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-slate-600"><Luggage className="h-4 w-4" /> Packages</p>
        {([["This Year:", year, stats.year], ["This Month:", new Date().toLocaleString("en-IN", { month: "long" }), stats.month]] as [string, string, Row[]][]).map(([k, v, list]) => (
          <div key={k} className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 py-2 last:border-0">
            <p className="text-sm text-slate-700">{k} <b>{v}</b></p>
            <div className="flex flex-wrap gap-1.5">
              <Pill cls="bg-slate-800" label="Total" n={count(list)} onClick={() => setState("")} />
              <Pill cls="bg-blue-500" label="Underprocess" n={count(list, "pending")} onClick={() => setState("pending")} />
              <Pill cls="bg-emerald-600" label="Confirmed" n={count(list, "confirmed")} onClick={() => setState("confirmed")} />
              <Pill cls="bg-rose-600" label="Rejected" n={count(list, "rejected")} onClick={() => setState("rejected")} />
            </div>
          </div>
        ))}
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <label className="text-xs text-slate-600">Search Generated Packages
            <div className="mt-1 flex items-center gap-2">
              <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9 rounded-lg border border-slate-300 px-2 text-sm" />
              <span>-</span>
              <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-9 rounded-lg border border-slate-300 px-2 text-sm" />
            </div>
          </label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Client, query no…" className="h-9 w-56 rounded-lg border border-slate-300 pl-8 pr-2 text-sm" />
          </div>
          {state && <button onClick={() => setState("")} className="h-9 rounded-lg bg-slate-100 px-3 text-xs">Clear filter: {state}</button>}
          {can("itineraries", "create") && <Link href="/compose" className="ml-auto inline-flex h-9 items-center gap-1 rounded-lg bg-brand-600 px-3 text-sm font-medium text-white hover:bg-brand-700">+ Compose Package</Link>}
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl bg-white shadow-card">
        <p className="border-b border-slate-100 px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-500">
          Packages added ({new Date(from).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })} – {new Date(to).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })})
        </p>
        {!rows ? <Spinner /> : shown.length === 0 ? <Empty title="No packages found in this date range!" /> : (
          <div className={cn("overflow-x-auto", compact && "max-h-[640px] overflow-y-auto")}>
            <table className="w-full min-w-[1100px] text-sm">
              <thead className="sticky top-0 z-10 bg-slate-50 text-left text-xs font-semibold text-slate-600">
                <tr><th className="px-3 py-2">Query</th><th className="px-3 py-2">Package_Name</th><th className="px-3 py-2">Package</th><th className="px-3 py-2">Summary</th><th className="px-3 py-2">Admin</th><th className="px-3 py-2">Agent</th></tr>
              </thead>
              <tbody>
                {shown.map((r, idx) => {
                  const s = STATE(r.status);
                  const created = new Date(r.created_at);
                  return (
                    <tr key={r.id} className={cn("align-top", idx % 2 ? "bg-white" : "bg-slate-50/60")}>
                      <td className="px-3 py-3">
                        <span className="rounded bg-amber-400 px-2 py-0.5 text-xs font-bold text-slate-900">{r.quote_no}</span>
                        <p className="mt-4"><span className="rounded bg-amber-400 px-2 py-0.5 text-[10px] font-semibold text-slate-900">Margin</span></p>
                        <input type="number" min={0} value={val(r, "margin_amount") as number} onChange={(e) => edit(r, { margin_amount: Number(e.target.value) })} disabled={!!r.booking_id}
                          className="mt-1 h-8 w-28 rounded border border-slate-300 px-2 text-sm italic text-emerald-800" />
                        {!r.booking_id && <button onClick={() => saveMargin(r)} disabled={busy === r.id} className="mt-1 block w-28 rounded bg-brand-600 py-1 text-xs font-semibold text-white hover:bg-brand-700">Update</button>}
                      </td>
                      <td className="px-3 py-3 text-xs">
                        <p className="font-semibold text-slate-600">🧳 Client Package:</p>
                        <p className="font-bold text-emerald-800">{r.client_name || "—"}</p>
                        <p className="mt-2 font-semibold text-slate-600">✏️ Package Name</p>
                        <textarea rows={2} value={(val(r, "title") as string) ?? ""} onChange={(e) => edit(r, { title: e.target.value })} className="mt-1 w-44 rounded border border-slate-300 px-2 py-1 text-xs" />
                        <button onClick={() => update(r, { title: val(r, "title") }, "Package name saved")} className="mt-1 inline-flex items-center gap-1 rounded bg-emerald-600 px-2 py-1 text-[11px] font-semibold text-white"><Save className="h-3 w-3" /> Save</button>
                        <p className="mt-2 flex items-center gap-1 text-slate-500"><Calendar className="h-3 w-3 text-rose-500" /> <b>{created.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }).replace(/ /g, "-")}</b> | <Clock className="h-3 w-3 text-amber-500" /> {created.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false })}</p>
                        <p className="text-[10px] text-slate-400">by {userName(r.created_by)}</p>
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex w-28 flex-col gap-1.5">
                          <a href={`/share/itinerary/${r.share_token}`} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center gap-1 rounded bg-brand-600 px-2 py-1 text-xs font-semibold text-white hover:bg-brand-700"><Eye className="h-3.5 w-3.5" /> Package</a>
                          <Link href={`/itineraries/${r.id}`} className="inline-flex items-center justify-center gap-1 rounded border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"><Pencil className="h-3.5 w-3.5" /> {r.booking_id ? "Open" : "Edit"}</Link>
                          {r.booking_id ? (
                            <Link href={`/bookings/${r.booking_id}`} className="inline-flex items-center justify-center gap-1 rounded bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5" /> Booking</Link>
                          ) : can("bookings", "create") && s !== "rejected" && (
                            <ConfirmButton size="sm" variant="success" label="Confirm & book?" loading={busy === r.id} onConfirm={() => confirm(r)}><Send className="h-3.5 w-3.5" /> Confirm</ConfirmButton>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <div className="w-72 space-y-1 rounded-lg border border-slate-200 bg-white p-2 text-[11px]">
                          <span className="inline-block rounded bg-brand-600 px-2 py-0.5 font-semibold text-white">{nightsLabel(r.nights)}</span>
                          <div className="flex flex-wrap gap-1">
                            <span className="rounded bg-sky-100 px-1.5 py-0.5 text-sky-800">Destination: {r.destination ?? r.title}</span>
                            {r.pickup_point && <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-emerald-800">Pick: {r.pickup_point}</span>}
                            {r.drop_point && <span className="rounded bg-amber-100 px-1.5 py-0.5 text-amber-800">Drop: {r.drop_point}</span>}
                            {r.start_date && <span className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-700">Arrival: {r.start_date}</span>}
                            <span className="rounded bg-rose-100 px-1.5 py-0.5 font-semibold text-rose-800">Amount: {inr(r.grand_total)}</span>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-xs">
                        <span className="rounded bg-brand-600 px-2 py-0.5 font-semibold text-white">Admin Note</span>
                        <textarea rows={3} disabled={!isAdmin} value={(val(r, "admin_note") as string) ?? ""} onChange={(e) => edit(r, { admin_note: e.target.value })}
                          className="mt-1 block w-44 rounded border border-slate-300 px-2 py-1 text-xs italic text-rose-800 disabled:bg-slate-50" />
                        {isAdmin && "admin_note" in (edits[r.id] ?? {}) && <button onClick={() => update(r, { admin_note: val(r, "admin_note") }, "Admin note saved")} className="mt-1 rounded bg-brand-600 px-2 py-0.5 text-[11px] text-white">Save note</button>}
                        <p className="mt-2"><span className="rounded bg-amber-400 px-2 py-0.5 font-semibold text-slate-900">Admin Confirmation</span></p>
                        <Status s={s} />
                        {isAdmin && !r.booking_id && s === "pending" && (
                          <button onClick={() => update(r, { status: "rejected" }, "Marked rejected")} className="mt-1 text-[11px] text-rose-600 hover:underline">Reject</button>
                        )}
                        {isAdmin && s === "rejected" && <button onClick={() => update(r, { status: "draft" }, "Re-opened")} className="mt-1 text-[11px] text-brand-700 hover:underline">Re-open</button>}
                      </td>
                      <td className="px-3 py-3 text-xs">
                        <span className="rounded bg-brand-600 px-2 py-0.5 font-semibold text-white">Agent Note</span>
                        <textarea rows={3} value={(val(r, "agent_note") as string) ?? ""} placeholder="write a note to admin" onChange={(e) => edit(r, { agent_note: e.target.value })}
                          className="mt-1 block w-44 rounded border border-slate-300 px-2 py-1 text-xs italic" />
                        {"agent_note" in (edits[r.id] ?? {}) && <button onClick={() => update(r, { agent_note: val(r, "agent_note") }, "Note saved")} className="mt-1 rounded bg-brand-600 px-2 py-0.5 text-[11px] text-white">Save note</button>}
                        <p className="mt-2"><span className="rounded bg-amber-400 px-2 py-0.5 font-semibold text-slate-900">Client Confirmation</span></p>
                        <Status s={r.status === "accepted" || r.booking_id ? "confirmed" : r.status === "sent" ? "sent" : s} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function Pill({ cls, label, n, onClick }: { cls: string; label: string; n: number; onClick: () => void }) {
  return (
    <button onClick={onClick} className={cn("inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:opacity-90", cls)}>
      {label} <span className="rounded bg-white px-1.5 text-[11px] font-bold text-slate-800">{n}</span>
    </button>
  );
}

function Status({ s }: { s: string }) {
  if (s === "confirmed") return <p className="mt-1 flex items-center gap-1 text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5" /> Confirmed</p>;
  if (s === "rejected") return <p className="mt-1 flex items-center gap-1 text-rose-700"><XCircle className="h-3.5 w-3.5" /> Rejected</p>;
  if (s === "sent") return <p className="mt-1 flex items-center gap-1 text-sky-700"><Send className="h-3.5 w-3.5" /> Sent to client</p>;
  return <p className="mt-1 flex items-center gap-1 text-amber-600"><Hourglass className="h-3.5 w-3.5" /> Pending</p>;
}


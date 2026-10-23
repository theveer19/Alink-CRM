"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { Check, ChevronLeft, ChevronRight, MessageCircle, Pencil, Phone, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { sb } from "@/lib/supabase/client";
import { FOLLOWUP_KINDS, statusMeta } from "@/lib/constants";
import type { Followup } from "@/lib/types";
import { cn, fmtDateTime, isoDate, waLink } from "@/lib/utils";
import { useLoad } from "@/lib/hooks";
import { Guard, useAuth } from "@/components/auth";
import { FollowupForm } from "@/components/followup-form";
import { DoneModal } from "@/components/done-modal";
import { Badge, Button, Card, ConfirmButton, Empty, PageHeader, Select, Spinner, Tabs } from "@/components/ui";

export default function FollowupsPage() {
  return <Guard module="followups"><Followups /></Guard>;
}

type FU = Followup & { leads: { id: string; name: string; lead_no: string; phone: string | null; destination: string | null } | null };

function Followups() {
  const { can, team, userId, userName } = useAuth();
  const [tab, setTab] = useState("overdue");
  const [who, setWho] = useState(can("followups", "view_all") ? "" : userId);
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<Followup | null>(null);
  const [done, setDone] = useState<Followup | null>(null);
  const [month, setMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [day, setDay] = useState<string | null>(null);
  const [nextLead, setNextLead] = useState<string | null>(null);

  const { data, loading, reload } = useLoad(async () => {
    const now = new Date();
    const sod = new Date(); sod.setHours(0, 0, 0, 0);
    const eod = new Date(); eod.setHours(23, 59, 59, 999);
    let q = sb().from("followups").select("*, leads(id, name, lead_no, phone, destination)");
    if (who) q = q.eq("assigned_to", who);
    if (tab === "overdue") q = q.eq("status", "pending").lt("due_at", now.toISOString()).order("due_at");
    else if (tab === "today") q = q.eq("status", "pending").gte("due_at", now.toISOString()).lte("due_at", eod.toISOString()).order("due_at");
    else if (tab === "upcoming") q = q.eq("status", "pending").gt("due_at", eod.toISOString()).order("due_at").limit(300);
    else if (tab === "done") q = q.neq("status", "pending").order("completed_at", { ascending: false, nullsFirst: false }).limit(200);
    else {
      const start = new Date(month); const end = new Date(month.getFullYear(), month.getMonth() + 1, 0, 23, 59, 59);
      q = q.gte("due_at", start.toISOString()).lte("due_at", end.toISOString()).order("due_at");
    }
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []) as FU[];
  }, [tab, who, month]);

  const counts = useLoad(async () => {
    const now = new Date().toISOString();
    const eod = new Date(); eod.setHours(23, 59, 59, 999);
    const base = () => { let q = sb().from("followups").select("id", { count: "exact", head: true }).eq("status", "pending"); if (who) q = q.eq("assigned_to", who); return q; };
    const [o, t] = await Promise.all([base().lt("due_at", now), base().gte("due_at", now).lte("due_at", eod.toISOString())]);
    return { overdue: o.count ?? 0, today: t.count ?? 0 };
  }, [who, data]);

  const byDay = useMemo(() => {
    const m: Record<string, FU[]> = {};
    (data ?? []).forEach((f) => { const k = isoDate(new Date(f.due_at)); (m[k] ??= []).push(f); });
    return m;
  }, [data]);

  const list = tab === "calendar" ? (day ? byDay[day] ?? [] : []) : data ?? [];

  return (
    <>
      <PageHeader
        title="Follow-ups"
        subtitle="Calls, meetings and tasks — never miss a customer"
        actions={
          <>
            {can("followups", "view_all") && (
              <Select value={who} onChange={(e) => setWho(e.target.value)} className="w-44">
                <option value="">Everyone</option>
                {team.map((t) => <option key={t.id} value={t.id}>{t.full_name}{t.id === userId ? " (me)" : ""}</option>)}
              </Select>
            )}
            {can("followups", "create") && <Button onClick={() => { setEdit(null); setOpen(true); }}><Plus className="h-4 w-4" /> Add task</Button>}
          </>
        }
      />
      <Tabs
        value={tab}
        onChange={(v) => { setTab(v); setDay(null); }}
        tabs={[
          { value: "overdue", label: <span>Overdue {counts.data?.overdue ? <Badge className="ml-1 bg-rose-100 text-rose-700">{counts.data.overdue}</Badge> : null}</span> },
          { value: "today", label: <span>Today {counts.data?.today ? <Badge className="ml-1 bg-sky-100 text-sky-700">{counts.data.today}</Badge> : null}</span> },
          { value: "upcoming", label: "Upcoming" },
          { value: "calendar", label: "Calendar" },
          { value: "done", label: "Completed" },
        ]}
      />

      {tab === "calendar" && (
        <Card className="mb-4" bodyClass="p-3">
          <div className="mb-3 flex items-center justify-between">
            <Button variant="ghost" size="icon" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}><ChevronLeft className="h-4 w-4" /></Button>
            <span className="text-sm font-semibold">{month.toLocaleString("en-IN", { month: "long", year: "numeric" })}</span>
            <Button variant="ghost" size="icon" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}><ChevronRight className="h-4 w-4" /></Button>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-medium text-slate-500">
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => <div key={d}>{d}</div>)}
          </div>
          <div className="mt-1 grid grid-cols-7 gap-1">
            {Array.from({ length: (month.getDay() + 6) % 7 }).map((_, i) => <div key={"b" + i} />)}
            {Array.from({ length: new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate() }).map((_, i) => {
              const d = isoDate(new Date(month.getFullYear(), month.getMonth(), i + 1));
              const items = byDay[d] ?? [];
              const pend = items.filter((x) => x.status === "pending").length;
              return (
                <button key={d} onClick={() => setDay(d)}
                  className={cn("h-16 rounded-lg border p-1 text-left text-xs", day === d ? "border-brand-500 bg-brand-50" : "border-slate-100 hover:bg-slate-50", d === isoDate() && "font-bold text-brand-700")}>
                  {i + 1}
                  {items.length > 0 && (
                    <div className="mt-1 space-y-0.5">
                      {pend > 0 && <div className="truncate rounded bg-sky-100 px-1 text-[10px] text-sky-700">{pend} pending</div>}
                      {items.length - pend > 0 && <div className="truncate rounded bg-emerald-100 px-1 text-[10px] text-emerald-700">{items.length - pend} done</div>}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </Card>
      )}

      {loading ? <Spinner /> : (
        <Card bodyClass="p-0">
          {list.length === 0 ? (
            <Empty title={tab === "calendar" ? (day ? "Nothing on this day" : "Pick a date") : tab === "overdue" ? "No overdue follow-ups 🎉" : "Nothing here"} />
          ) : (
            <ul className="divide-y divide-slate-100">
              {list.map((f) => {
                const overdue = f.status === "pending" && new Date(f.due_at) < new Date();
                return (
                  <li key={f.id} className="flex flex-wrap items-center gap-3 px-4 py-3 hover:bg-slate-50">
                    <Badge className={cn(f.status === "done" ? "bg-emerald-100 text-emerald-700" : overdue ? "bg-rose-100 text-rose-700" : "bg-sky-100 text-sky-700")}>
                      {statusMeta(FOLLOWUP_KINDS, f.kind)?.label}
                    </Badge>
                    <div className="min-w-0 flex-1">
                      <p className={cn("text-sm font-medium", f.status === "done" ? "text-slate-500 line-through" : "text-slate-800")}>{f.title}</p>
                      <p className="text-xs text-slate-500">
                        {f.leads ? <Link href={`/leads/${f.leads.id}`} className="text-brand-700 hover:underline">{f.leads.name} ({f.leads.lead_no})</Link> : "General task"}
                        {f.leads?.destination ? ` · ${f.leads.destination}` : ""} · <span className={overdue ? "font-medium text-rose-600" : ""}>{fmtDateTime(f.due_at)}</span> · {userName(f.assigned_to)}
                      </p>
                      {(f.notes || f.outcome) && <p className="mt-0.5 text-xs text-slate-600">{f.outcome ? `Outcome: ${f.outcome}` : f.notes}</p>}
                    </div>
                    <div className="flex items-center gap-1">
                      {f.leads?.phone && <a href={`tel:${f.leads.phone}`} className="rounded p-1.5 text-slate-400 hover:bg-slate-100" title="Call"><Phone className="h-4 w-4" /></a>}
                      {f.leads?.phone && <a href={waLink(f.leads.phone, `Hi ${f.leads.name}, `)} target="_blank" rel="noreferrer" className="rounded p-1.5 text-slate-400 hover:bg-emerald-50 hover:text-emerald-600" title="WhatsApp"><MessageCircle className="h-4 w-4" /></a>}
                      {f.status === "pending" && (
                        <>
                          <Button size="sm" variant="secondary" onClick={() => setDone(f)}><Check className="h-3.5 w-3.5 text-emerald-600" /> Done</Button>
                          <button onClick={() => { setEdit(f); setOpen(true); }} className="rounded p-1.5 text-slate-400 hover:bg-slate-100" title="Edit / reschedule"><Pencil className="h-4 w-4" /></button>
                        </>
                      )}
                      {can("followups", "delete") && (
                        <ConfirmButton size="icon" onConfirm={async () => {
                          const { error } = await sb().from("followups").delete().eq("id", f.id);
                          if (error) toast.error(error.message); else reload();
                        }} label="?"><Trash2 className="h-4 w-4" /></ConfirmButton>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      )}

      <FollowupForm open={open} onClose={() => setOpen(false)} followup={edit} leadId={edit?.lead_id} onSaved={reload} />
      <DoneModal fu={done} onClose={() => setDone(null)} onDone={() => { setDone(null); reload(); }}
        onNext={done?.lead_id ? () => setNextLead(done.lead_id) : undefined} />
      <FollowupForm open={!!nextLead} onClose={() => setNextLead(null)} leadId={nextLead} onSaved={reload} />
    </>
  );
}

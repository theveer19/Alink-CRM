"use client";
import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Download, KanbanSquare, List, Plus, Upload, Phone, MessageCircle, CalendarClock } from "lucide-react";
import { sb } from "@/lib/supabase/client";
import { LEAD_STATUSES, PRIORITIES, statusMeta } from "@/lib/constants";
import type { Lead } from "@/lib/types";
import { cn, downloadCsv, fmtDate, fmtDateTime, inr, isoDate, timeAgo, waLink } from "@/lib/utils";
import { useAuth, Guard } from "@/components/auth";
import { LeadForm } from "@/components/lead-form";
import { Badge, Button, Card, ConfirmButton, Empty, Input, PageHeader, Select, Spinner, Table, Td, Th } from "@/components/ui";
import { useDebounced } from "@/lib/hooks";
import { LostModal } from "@/components/lost-modal";

const PAGE = 50;

export default function LeadsPage() {
  return (
    <Guard module="leads">
      <Suspense fallback={<Spinner />}>
        <Leads />
      </Suspense>
    </Guard>
  );
}

function Leads() {
  const { sources, team, can, userName } = useAuth();
  const params = useSearchParams();
  const router = useRouter();
  const [view, setView] = useState<"table" | "kanban">("table");
  const [rows, setRows] = useState<Lead[]>([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [q, setQ] = useState("");
  const dq = useDebounced(q, 300);
  const [filters, setFilters] = useState({
    status: params.get("status") ?? "", source: params.get("source") ?? "", priority: "", assigned: params.get("assigned") ?? "",
    from: "", to: "", fu: params.get("fu") ?? "",
  });
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [formOpen, setFormOpen] = useState(params.get("new") === "1");
  const [lostFor, setLostFor] = useState<Lead | null>(null);

  useEffect(() => {
    try { const v = localStorage.getItem("leads.view"); if (v === "kanban" || v === "table") setView(v); } catch {}
  }, []);
  useEffect(() => { try { localStorage.setItem("leads.view", view); } catch {} }, [view]);

  function buildQuery(forExport = false) {
    let qb = sb().from("leads").select("*", { count: "exact" });
    const term = dq.trim().replace(/[%,()]/g, "");
    if (term) qb = qb.or(`name.ilike.%${term}%,phone.ilike.%${term}%,email.ilike.%${term}%,lead_no.ilike.%${term}%,destination.ilike.%${term}%`);
    if (filters.status) qb = qb.eq("status", filters.status);
    else if (view === "table" && !forExport) qb = qb.not("status", "in", "(won,lost)");
    if (filters.source) qb = qb.eq("source", filters.source);
    if (filters.priority) qb = qb.eq("priority", filters.priority);
    if (filters.assigned === "none") qb = qb.is("assigned_to", null);
    else if (filters.assigned) qb = qb.eq("assigned_to", filters.assigned);
    if (filters.from) qb = qb.gte("created_at", filters.from);
    if (filters.to) qb = qb.lte("created_at", filters.to + "T23:59:59");
    const now = new Date();
    const eod = new Date(); eod.setHours(23, 59, 59, 999);
    if (filters.fu === "overdue") qb = qb.lt("next_followup_at", now.toISOString());
    if (filters.fu === "today") qb = qb.gte("next_followup_at", isoDate(now)).lte("next_followup_at", eod.toISOString());
    if (filters.fu === "none") qb = qb.is("next_followup_at", null).not("status", "in", "(won,lost)");
    return qb;
  }

  async function load() {
    setLoading(true);
    let qb = buildQuery().order("created_at", { ascending: false });
    qb = view === "kanban" ? qb.limit(600) : qb.range(page * PAGE, page * PAGE + PAGE - 1);
    const { data, count: c, error } = await qb;
    setLoading(false);
    if (error) return toast.error(error.message);
    setRows((data ?? []) as Lead[]);
    setCount(c ?? 0);
    setSel(new Set());
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [dq, filters, page, view]);
  useEffect(() => setPage(0), [dq, filters, view]);

  async function updateMany(patch: Partial<Lead>) {
    const ids = [...sel];
    const { error } = await sb().from("leads").update(patch).in("id", ids);
    if (error) return toast.error(error.message);
    toast.success(`${ids.length} lead(s) updated`);
    load();
  }

  async function exportCsv() {
    const { data, error } = await buildQuery(true).order("created_at", { ascending: false }).limit(5000);
    if (error) return toast.error(error.message);
    downloadCsv(`leads-${isoDate()}.csv`, [
      ["Lead No", "Name", "Phone", "Email", "City", "Source", "Campaign", "Status", "Priority", "Destination", "Travel Date", "Nights", "Adults", "Children", "Budget", "Assigned To", "Next Follow-up", "Created"],
      ...(data ?? []).map((l: Lead) => [l.lead_no, l.name, l.phone, l.email, l.city, l.source, l.campaign, l.status, l.priority, l.destination, l.travel_date, l.nights, l.adults, l.children, l.budget, userName(l.assigned_to), l.next_followup_at ? fmtDateTime(l.next_followup_at) : "", fmtDateTime(l.created_at)]),
    ]);
  }

  async function moveStatus(lead: Lead, status: string, lost_reason?: string) {
    if (status === "lost" && !lost_reason) return setLostFor(lead);
    setRows((r) => r.map((x) => (x.id === lead.id ? { ...x, status } : x)));
    const { error } = await sb().from("leads").update({ status, ...(lost_reason ? { lost_reason } : {}) }).eq("id", lead.id);
    if (error) { toast.error(error.message); load(); }
  }

  const F = (k: keyof typeof filters) => (e: { target: { value: string } }) => setFilters({ ...filters, [k]: e.target.value });
  const allSel = rows.length > 0 && rows.every((r) => sel.has(r.id));

  return (
    <>
      <PageHeader
        title="Leads"
        subtitle={`${count} ${filters.status ? statusMeta(LEAD_STATUSES, filters.status)?.label.toLowerCase() : view === "table" ? "open" : ""} leads`}
        actions={
          <>
            <div className="flex rounded-lg border border-slate-300 bg-white p-0.5">
              <button onClick={() => setView("table")} className={cn("rounded-md p-1.5", view === "table" ? "bg-slate-100 text-slate-900" : "text-slate-400")} title="List"><List className="h-4 w-4" /></button>
              <button onClick={() => setView("kanban")} className={cn("rounded-md p-1.5", view === "kanban" ? "bg-slate-100 text-slate-900" : "text-slate-400")} title="Pipeline"><KanbanSquare className="h-4 w-4" /></button>
            </div>
            <Button variant="secondary" onClick={exportCsv}><Download className="h-4 w-4" /> Export</Button>
            {can("leads", "import") && <Link href="/leads/import"><Button variant="secondary"><Upload className="h-4 w-4" /> Import</Button></Link>}
            {can("leads", "create") && <Button onClick={() => setFormOpen(true)}><Plus className="h-4 w-4" /> New lead</Button>}
          </>
        }
      />

      <Card bodyClass="p-3" className="mb-4">
        <div className="flex flex-wrap gap-2">
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, phone, email, destination…" className="w-64" />
          <Select value={filters.status} onChange={F("status")} className="w-36">
            <option value="">{view === "table" ? "Open leads" : "All statuses"}</option>
            {LEAD_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </Select>
          <Select value={filters.source} onChange={F("source")} className="w-36">
            <option value="">All sources</option>
            {sources.map((s) => <option key={s}>{s}</option>)}
          </Select>
          <Select value={filters.priority} onChange={F("priority")} className="w-28">
            <option value="">Priority</option>
            {PRIORITIES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </Select>
          {can("leads", "view_all") && (
            <Select value={filters.assigned} onChange={F("assigned")} className="w-40">
              <option value="">All staff</option>
              <option value="none">Unassigned</option>
              {team.map((t) => <option key={t.id} value={t.id}>{t.full_name}</option>)}
            </Select>
          )}
          <Select value={filters.fu} onChange={F("fu")} className="w-40">
            <option value="">Any follow-up</option>
            <option value="overdue">Follow-up overdue</option>
            <option value="today">Follow-up today</option>
            <option value="none">No follow-up set</option>
          </Select>
          <Input type="date" value={filters.from} onChange={F("from")} className="w-36" title="Created from" />
          <Input type="date" value={filters.to} onChange={F("to")} className="w-36" title="Created to" />
          {(q || Object.values(filters).some(Boolean)) && (
            <Button variant="ghost" onClick={() => { setQ(""); setFilters({ status: "", source: "", priority: "", assigned: "", from: "", to: "", fu: "" }); }}>Clear</Button>
          )}
        </div>
      </Card>

      {sel.size > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg bg-brand-50 px-3 py-2 text-sm">
          <b>{sel.size} selected</b>
          {can("leads", "view_all") && (
            <Select className="h-8 w-44" value="" onChange={(e) => e.target.value && updateMany({ assigned_to: e.target.value })}>
              <option value="">Assign to…</option>
              {team.filter((t) => t.is_active).map((t) => <option key={t.id} value={t.id}>{t.full_name}</option>)}
            </Select>
          )}
          <Select className="h-8 w-40" value="" onChange={(e) => e.target.value && updateMany({ status: e.target.value })}>
            <option value="">Change status…</option>
            {LEAD_STATUSES.filter((s) => s.value !== "lost").map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </Select>
          {can("leads", "delete") && (
            <ConfirmButton size="sm" label={`Delete ${sel.size}?`} onConfirm={async () => {
              const { error } = await sb().from("leads").delete().in("id", [...sel]);
              if (error) toast.error(error.message); else { toast.success("Deleted"); load(); }
            }}>Delete</ConfirmButton>
          )}
        </div>
      )}

      {loading ? <Spinner /> : view === "table" ? (
        <Card bodyClass="p-0">
          {rows.length === 0 ? <Empty title="No leads found" text="Add a lead, import from Excel, or connect Facebook / website forms in Settings → Lead capture." /> : (
            <Table>
              <thead>
                <tr>
                  <Th className="w-8"><input type="checkbox" checked={allSel} onChange={() => setSel(allSel ? new Set() : new Set(rows.map((r) => r.id)))} /></Th>
                  <Th>Lead</Th><Th>Trip</Th><Th>Source</Th><Th>Status</Th><Th>Next follow-up</Th><Th>Assigned</Th><Th>Created</Th><Th></Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((l) => {
                  const st = statusMeta(LEAD_STATUSES, l.status);
                  const pr = statusMeta(PRIORITIES, l.priority);
                  const overdue = l.next_followup_at && new Date(l.next_followup_at) < new Date();
                  return (
                    <tr key={l.id} className="hover:bg-slate-50">
                      <Td><input type="checkbox" checked={sel.has(l.id)} onChange={() => { const s = new Set(sel); s.has(l.id) ? s.delete(l.id) : s.add(l.id); setSel(s); }} /></Td>
                      <Td>
                        <Link href={`/leads/${l.id}`} className="font-medium text-slate-900 hover:text-brand-700">{l.name}</Link>
                        <div className="text-xs text-slate-500">{l.lead_no} · {l.phone ?? l.email}</div>
                      </Td>
                      <Td>
                        <div>{l.destination ?? "—"}</div>
                        <div className="text-xs text-slate-500">
                          {l.travel_date ? fmtDate(l.travel_date) : "Dates TBD"} · {l.adults}A{l.children ? ` ${l.children}C` : ""}{l.budget ? ` · ${inr(l.budget)}` : ""}
                        </div>
                      </Td>
                      <Td><div>{l.source}</div>{l.campaign && <div className="max-w-[140px] truncate text-xs text-slate-500">{l.campaign}</div>}</Td>
                      <Td>
                        <Badge className={st?.color}>{st?.label}</Badge>
                        {pr && <Badge className={cn("ml-1", pr.color)}>{pr.label}</Badge>}
                      </Td>
                      <Td className={cn("text-xs", overdue ? "font-medium text-rose-600" : "text-slate-600")}>
                        {l.next_followup_at ? fmtDateTime(l.next_followup_at) : <span className="text-amber-600">Not set</span>}
                      </Td>
                      <Td className="text-xs">{userName(l.assigned_to)}</Td>
                      <Td className="text-xs text-slate-500">{timeAgo(l.created_at)}</Td>
                      <Td>
                        <div className="flex gap-1">
                          {l.phone && <a href={`tel:${l.phone}`} className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700" title="Call"><Phone className="h-4 w-4" /></a>}
                          {l.phone && <a href={waLink(l.phone, `Hi ${l.name}, `)} target="_blank" rel="noreferrer" className="rounded p-1 text-slate-400 hover:bg-emerald-50 hover:text-emerald-600" title="WhatsApp"><MessageCircle className="h-4 w-4" /></a>}
                        </div>
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          )}
          {count > PAGE && (
            <div className="flex items-center justify-between border-t border-slate-100 px-4 py-2 text-xs text-slate-500">
              <span>Showing {page * PAGE + 1}–{Math.min(count, page * PAGE + PAGE)} of {count}</span>
              <div className="flex gap-2">
                <Button size="sm" variant="secondary" disabled={page === 0} onClick={() => setPage(page - 1)}>Previous</Button>
                <Button size="sm" variant="secondary" disabled={(page + 1) * PAGE >= count} onClick={() => setPage(page + 1)}>Next</Button>
              </div>
            </div>
          )}
        </Card>
      ) : (
        <Kanban rows={rows} onMove={moveStatus} userName={userName} />
      )}

      <LeadForm open={formOpen} onClose={() => { setFormOpen(false); if (params.get("new")) router.replace("/leads"); }} onSaved={() => load()} />
      <LostModal lead={lostFor} onClose={() => setLostFor(null)} onSave={(r) => { if (lostFor) moveStatus(lostFor, "lost", r); setLostFor(null); }} />
    </>
  );
}

function Kanban({ rows, onMove, userName }: { rows: Lead[]; onMove: (l: Lead, s: string) => void; userName: (id: string | null) => string }) {
  const [drag, setDrag] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const cols = useMemo(() => LEAD_STATUSES.map((s) => ({ ...s, items: rows.filter((r) => r.status === s.value) })), [rows]);
  return (
    <div className="flex gap-3 overflow-x-auto pb-4">
      {cols.map((c) => (
        <div
          key={c.value}
          onDragOver={(e) => { e.preventDefault(); setOver(c.value); }}
          onDragLeave={() => setOver(null)}
          onDrop={() => {
            const l = rows.find((r) => r.id === drag);
            if (l && l.status !== c.value) onMove(l, c.value);
            setDrag(null); setOver(null);
          }}
          className={cn("flex w-64 shrink-0 flex-col rounded-xl bg-slate-100/80 p-2", over === c.value && "ring-2 ring-brand-400")}
        >
          <div className="mb-2 flex items-center justify-between px-1">
            <span className="flex items-center gap-1.5 text-xs font-semibold uppercase text-slate-600"><span className={cn("h-2 w-2 rounded-full", c.dot)} />{c.label}</span>
            <span className="text-xs text-slate-500">{c.items.length}</span>
          </div>
          <div className="flex max-h-[70vh] flex-col gap-2 overflow-y-auto">
            {c.items.map((l) => (
              <div key={l.id} draggable onDragStart={() => setDrag(l.id)} className="cursor-grab rounded-lg border border-slate-200 bg-white p-2.5 shadow-sm active:cursor-grabbing">
                <Link href={`/leads/${l.id}`} className="text-sm font-medium text-slate-900 hover:text-brand-700">{l.name}</Link>
                <p className="text-xs text-slate-500">{l.destination ?? "—"}{l.travel_date ? ` · ${fmtDate(l.travel_date)}` : ""}</p>
                <div className="mt-1.5 flex items-center justify-between text-[11px] text-slate-500">
                  <span>{l.source}</span>
                  <span>{userName(l.assigned_to)}</span>
                </div>
                {l.next_followup_at && (
                  <p className={cn("mt-1 flex items-center gap-1 text-[11px]", new Date(l.next_followup_at) < new Date() ? "text-rose-600" : "text-slate-500")}>
                    <CalendarClock className="h-3 w-3" /> {fmtDateTime(l.next_followup_at)}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

"use client";
import { useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, Check, Mail, MessageCircle, Pencil, Phone, Plus, Trash2, Map, CalendarPlus, User } from "lucide-react";
import { sb } from "@/lib/supabase/client";
import { FOLLOWUP_KINDS, LEAD_STATUSES, PRIORITIES, QUOTE_STATUSES, BOOKING_STATUSES, statusMeta } from "@/lib/constants";
import type { Followup, Lead } from "@/lib/types";
import { cn, fmtDate, fmtDateTime, inr, timeAgo } from "@/lib/utils";
import { useLoad } from "@/lib/hooks";
import { createItinerary } from "@/lib/actions";
import { Guard, useAuth } from "@/components/auth";
import { LeadForm } from "@/components/lead-form";
import { FollowupForm } from "@/components/followup-form";
import { LostModal } from "@/components/lost-modal";
import { MessageComposer, type ComposeTarget } from "@/components/message-composer";
import { DocumentsCard } from "@/components/documents-card";
import { DoneModal } from "@/components/done-modal";
import { Badge, Button, Card, ConfirmButton, Input, Select, Spinner } from "@/components/ui";

export default function LeadDetailPage() {
  return <Guard module="leads"><LeadDetail /></Guard>;
}

function LeadDetail() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { can, userName, settings, team } = useAuth();
  const [edit, setEdit] = useState(false);
  const [fuOpen, setFuOpen] = useState(false);
  const [fuEdit, setFuEdit] = useState<Followup | null>(null);
  const [lost, setLost] = useState(false);
  const [compose, setCompose] = useState<ComposeTarget | null>(null);
  const [note, setNote] = useState("");
  const [noteKind, setNoteKind] = useState("note");
  const [doneFu, setDoneFu] = useState<Followup | null>(null);
  const [creating, setCreating] = useState(false);

  const lead = useLoad(async () => {
    const { data, error } = await sb().from("leads").select("*").eq("id", id).single();
    if (error) throw error;
    return data as Lead;
  }, [id]);

  const rel = useLoad(async () => {
    const supa = sb();
    const [acts, fus, its, bks] = await Promise.all([
      supa.from("lead_activities").select("*").eq("lead_id", id).order("created_at", { ascending: false }).limit(200),
      supa.from("followups").select("*").eq("lead_id", id).order("due_at", { ascending: true }),
      supa.from("itineraries").select("id, quote_no, version, title, status, grand_total, created_at").eq("lead_id", id).order("created_at", { ascending: false }),
      supa.from("bookings").select("id, booking_no, title, status, sell_amount, start_date").eq("lead_id", id),
    ]);
    return { acts: acts.data ?? [], fus: (fus.data ?? []) as Followup[], its: its.data ?? [], bks: bks.data ?? [] };
  }, [id]);

  const reloadAll = () => { lead.reload(); rel.reload(); };

  if (lead.loading && !lead.data) return <Spinner />;
  if (!lead.data) return <p className="text-sm text-slate-500">Lead not found or you don&apos;t have access. <Link href="/leads" className="text-brand-700 underline">Back to leads</Link></p>;
  const l = lead.data;
  const st = statusMeta(LEAD_STATUSES, l.status);

  async function setStatus(status: string) {
    if (status === "lost") return setLost(true);
    const { error } = await sb().from("leads").update({ status }).eq("id", l.id);
    if (error) return toast.error(error.message);
    reloadAll();
  }

  async function patch(p: Partial<Lead>) {
    const { error } = await sb().from("leads").update(p).eq("id", l.id);
    if (error) return toast.error(error.message);
    reloadAll();
  }

  async function addNote() {
    if (!note.trim()) return;
    const { error } = await sb().from("lead_activities").insert({ lead_id: l.id, kind: noteKind, body: note.trim() });
    if (error) return toast.error(error.message);
    setNote("");
    reloadAll();
  }

  async function newItinerary() {
    setCreating(true);
    try {
      const itId = await createItinerary(settings, l);
      if (["new", "contacted", "qualified"].includes(l.status)) await sb().from("leads").update({ status: "quoted" }).eq("id", l.id);
      router.push(`/itineraries/${itId}`);
    } catch (e: any) {
      toast.error(e.message);
      setCreating(false);
    }
  }

  const pending = (rel.data?.fus ?? []).filter((f) => f.status === "pending");
  const done = (rel.data?.fus ?? []).filter((f) => f.status !== "pending");

  return (
    <>
      <Link href="/leads" className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800"><ArrowLeft className="h-4 w-4" /> Leads</Link>

      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold text-slate-900">{l.name}</h1>
            <Badge className={st?.color}>{st?.label}</Badge>
            <Badge className={statusMeta(PRIORITIES, l.priority)?.color}>{statusMeta(PRIORITIES, l.priority)?.label}</Badge>
          </div>
          <p className="mt-0.5 text-sm text-slate-500">
            {l.lead_no} · {l.source}{l.campaign ? ` / ${l.campaign}` : ""} · created {timeAgo(l.created_at)} · {userName(l.assigned_to)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {l.phone && <a href={`tel:${l.phone}`}><Button variant="secondary"><Phone className="h-4 w-4" /> Call</Button></a>}
          {l.phone && <Button variant="secondary" onClick={() => setCompose({ channel: "whatsapp", name: l.name, phone: l.phone, leadId: l.id, vars: { destination: l.destination } })}><MessageCircle className="h-4 w-4 text-emerald-600" /> WhatsApp</Button>}
          {l.email && <Button variant="secondary" onClick={() => setCompose({ channel: "email", name: l.name, email: l.email, leadId: l.id, vars: { destination: l.destination } })}><Mail className="h-4 w-4" /> Email</Button>}
          {can("leads", "edit") && <Button variant="secondary" onClick={() => setEdit(true)}><Pencil className="h-4 w-4" /> Edit</Button>}
          {can("itineraries", "create") && <Button loading={creating} onClick={newItinerary}><Map className="h-4 w-4" /> Create itinerary</Button>}
        </div>
      </div>

      {/* pipeline bar */}
      <div className="mb-5 flex overflow-x-auto rounded-xl border border-slate-200 bg-white p-1 shadow-card">
        {LEAD_STATUSES.map((s) => (
          <button
            key={s.value}
            disabled={!can("leads", "edit")}
            onClick={() => s.value !== l.status && setStatus(s.value)}
            className={cn(
              "flex-1 whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
              l.status === s.value ? cn(s.color, "ring-1 ring-inset ring-current/20") : "text-slate-500 hover:bg-slate-50"
            )}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card title="Trip requirement">
            <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-4">
              <Info label="Destination" value={l.destination} />
              <Info label="Travel date" value={l.travel_date ? fmtDate(l.travel_date) : null} />
              <Info label="Return" value={l.return_date ? fmtDate(l.return_date) : null} />
              <Info label="Nights" value={l.nights} />
              <Info label="Travellers" value={`${l.adults} Adults${l.children ? `, ${l.children} Children` : ""}${l.infants ? `, ${l.infants} Infants` : ""}`} />
              <Info label="Budget" value={l.budget ? inr(l.budget) : null} />
              <Info label="Phone" value={l.phone} />
              <Info label="Email" value={l.email} />
              <Info label="City" value={l.city} />
              {l.lost_reason && <Info label="Lost reason" value={l.lost_reason} />}
            </dl>
            {l.requirements && <p className="mt-4 whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-sm text-slate-700">{l.requirements}</p>}
          </Card>

          <Card title="Activity & notes">
            <div className="mb-4 space-y-2">
              <div className="flex gap-2">
                <Select value={noteKind} onChange={(e) => setNoteKind(e.target.value)} className="w-36">
                  <option value="note">Note</option>
                  <option value="call">Call log</option>
                  <option value="whatsapp">WhatsApp</option>
                  <option value="email">Email</option>
                  <option value="meeting">Meeting</option>
                </Select>
                <Input value={note} onChange={(e) => setNote(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addNote()} placeholder="What happened? e.g. Customer wants 4★ hotel, will confirm by Friday" />
                <Button onClick={addNote}>Add</Button>
              </div>
            </div>
            <ol className="relative space-y-4 border-l border-slate-200 pl-5">
              {(rel.data?.acts ?? []).map((a: any) => (
                <li key={a.id} className="relative">
                  <span className={cn("absolute -left-[25px] top-1 h-2.5 w-2.5 rounded-full ring-4 ring-white",
                    a.kind === "status" ? "bg-violet-500" : a.kind === "call" ? "bg-sky-500" : a.kind === "whatsapp" ? "bg-emerald-500" : a.kind === "system" ? "bg-slate-400" : "bg-amber-500")} />
                  <p className="whitespace-pre-wrap text-sm text-slate-800">{a.body}</p>
                  <p className="text-[11px] text-slate-500">{a.kind} · {userName(a.created_by)} · {fmtDateTime(a.created_at)}</p>
                </li>
              ))}
              <li className="relative">
                <span className="absolute -left-[25px] top-1 h-2.5 w-2.5 rounded-full bg-slate-300 ring-4 ring-white" />
                <p className="text-sm text-slate-600">Lead created from <b>{l.source}</b></p>
                <p className="text-[11px] text-slate-500">{fmtDateTime(l.created_at)}</p>
              </li>
            </ol>
          </Card>
        </div>

        <div className="space-y-5">
          <Card title="Follow-ups" action={can("followups", "create") && <Button size="sm" variant="secondary" onClick={() => { setFuEdit(null); setFuOpen(true); }}><CalendarPlus className="h-3.5 w-3.5" /> Add</Button>}>
            {pending.length === 0 && <p className="text-sm text-amber-600">No follow-up scheduled — set one so this lead isn&apos;t forgotten.</p>}
            <ul className="space-y-2">
              {pending.map((f) => {
                const overdue = new Date(f.due_at) < new Date();
                return (
                  <li key={f.id} className={cn("rounded-lg border p-2.5", overdue ? "border-rose-200 bg-rose-50" : "border-slate-200")}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-800">{f.title}</p>
                        <p className={cn("text-xs", overdue ? "text-rose-600" : "text-slate-500")}>
                          {statusMeta(FOLLOWUP_KINDS, f.kind)?.label} · {fmtDateTime(f.due_at)} · {userName(f.assigned_to)}
                        </p>
                        {f.notes && <p className="mt-1 text-xs text-slate-600">{f.notes}</p>}
                      </div>
                      <div className="flex shrink-0 gap-1">
                        <button title="Mark done" onClick={() => setDoneFu(f)} className="rounded p-1 text-emerald-600 hover:bg-emerald-50"><Check className="h-4 w-4" /></button>
                        <button title="Edit" onClick={() => { setFuEdit(f); setFuOpen(true); }} className="rounded p-1 text-slate-400 hover:bg-slate-100"><Pencil className="h-3.5 w-3.5" /></button>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
            {done.length > 0 && (
              <details className="mt-3">
                <summary className="cursor-pointer text-xs text-slate-500">History ({done.length})</summary>
                <ul className="mt-2 space-y-1.5">
                  {done.map((f) => (
                    <li key={f.id} className="text-xs text-slate-600">
                      <span className={f.status === "done" ? "text-emerald-600" : "text-slate-400"}>{f.status === "done" ? "✓" : "✕"}</span> {f.title} — {fmtDateTime(f.completed_at ?? f.due_at)}{f.outcome ? ` · ${f.outcome}` : ""}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </Card>

          <Card title="Quotes / itineraries" action={can("itineraries", "create") && <Button size="sm" variant="secondary" loading={creating} onClick={newItinerary}><Plus className="h-3.5 w-3.5" /> New</Button>}>
            {(rel.data?.its ?? []).length === 0 && <p className="text-sm text-slate-400">No quote yet.</p>}
            <ul className="divide-y divide-slate-100">
              {(rel.data?.its ?? []).map((it: any) => (
                <li key={it.id} className="flex items-center justify-between py-2">
                  <Link href={`/itineraries/${it.id}`} className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-800 hover:text-brand-700">{it.title}</p>
                    <p className="text-xs text-slate-500">{it.quote_no} v{it.version} · {inr(it.grand_total)}</p>
                  </Link>
                  <Badge className={statusMeta(QUOTE_STATUSES, it.status)?.color}>{statusMeta(QUOTE_STATUSES, it.status)?.label}</Badge>
                </li>
              ))}
            </ul>
            {(rel.data?.bks ?? []).length > 0 && (
              <div className="mt-3 border-t border-slate-100 pt-3">
                <p className="mb-1 text-xs font-semibold uppercase text-slate-400">Bookings</p>
                {(rel.data?.bks ?? []).map((b: any) => (
                  <Link key={b.id} href={`/bookings/${b.id}`} className="flex items-center justify-between py-1 text-sm hover:text-brand-700">
                    <span>{b.booking_no} · {inr(b.sell_amount)}</span>
                    <Badge className={statusMeta(BOOKING_STATUSES, b.status)?.color}>{statusMeta(BOOKING_STATUSES, b.status)?.label}</Badge>
                  </Link>
                ))}
              </div>
            )}
          </Card>

          <Card title="Lead settings">
            <div className="space-y-3">
              {l.contact_id && (
                <Link href={`/contacts/${l.contact_id}`} className="flex items-center gap-2 text-sm text-brand-700 hover:underline"><User className="h-4 w-4" /> Open customer profile</Link>
              )}
              <label className="block text-xs text-slate-500">Priority
                <Select value={l.priority} onChange={(e) => patch({ priority: e.target.value })} disabled={!can("leads", "edit")}>
                  {PRIORITIES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                </Select>
              </label>
              {can("leads", "view_all") && (
                <label className="block text-xs text-slate-500">Assigned to
                  <Select value={l.assigned_to ?? ""} onChange={(e) => patch({ assigned_to: e.target.value || null })}>
                    <option value="">Unassigned</option>
                    {team.filter((t) => t.is_active).map((t) => <option key={t.id} value={t.id}>{t.full_name}</option>)}
                  </Select>
                </label>
              )}
              {can("leads", "delete") && (
                <ConfirmButton variant="ghost" className="w-full text-rose-600" label="Delete this lead?" onConfirm={async () => {
                  const { error } = await sb().from("leads").delete().eq("id", l.id);
                  if (error) { toast.error(error.message); return; }
                  toast.success("Lead deleted");
                  router.replace("/leads");
                }}><Trash2 className="h-4 w-4" /> Delete lead</ConfirmButton>
              )}
            </div>
          </Card>

          <DocumentsCard leadId={l.id} contactId={l.contact_id} />
        </div>
      </div>

      <LeadForm open={edit} onClose={() => setEdit(false)} lead={l} onSaved={reloadAll} />
      <FollowupForm open={fuOpen} onClose={() => setFuOpen(false)} leadId={l.id} contactId={l.contact_id} followup={fuEdit} onSaved={reloadAll} defaultTitle={`Call ${l.name}`} />
      <LostModal lead={lost ? l : null} onClose={() => setLost(false)} onSave={(r) => { setLost(false); patch({ status: "lost", lost_reason: r }); }} />
      <MessageComposer target={compose} onClose={() => { setCompose(null); rel.reload(); }} />
      <DoneModal fu={doneFu} onClose={() => setDoneFu(null)} onDone={() => { setDoneFu(null); reloadAll(); }} onNext={() => { setFuEdit(null); setFuOpen(true); }} />
    </>
  );
}

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="font-medium text-slate-800">{value || value === 0 ? value : "—"}</dd>
    </div>
  );
}

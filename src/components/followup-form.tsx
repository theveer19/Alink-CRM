"use client";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { sb } from "@/lib/supabase/client";
import { FOLLOWUP_KINDS } from "@/lib/constants";
import { toLocalInput } from "@/lib/utils";
import type { Followup } from "@/lib/types";
import { useAuth } from "./auth";
import { Button, Field, Input, Modal, Select, Textarea } from "./ui";

function quick(hours: number) {
  const d = new Date(Date.now() + hours * 3600_000);
  if (hours >= 24) d.setHours(11, 0, 0, 0);
  return toLocalInput(d);
}

export function FollowupForm({ open, onClose, leadId, contactId, followup, onSaved, defaultTitle }: {
  open: boolean; onClose: () => void; leadId?: string | null; contactId?: string | null; followup?: Followup | null;
  onSaved: () => void; defaultTitle?: string;
}) {
  const { team, userId } = useAuth();
  const [f, setF] = useState({ kind: "call", title: "", notes: "", due_at: quick(2), assigned_to: userId });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (followup) setF({ kind: followup.kind, title: followup.title, notes: followup.notes ?? "", due_at: toLocalInput(followup.due_at), assigned_to: followup.assigned_to ?? userId });
    else setF({ kind: "call", title: defaultTitle ?? "Call customer", notes: "", due_at: quick(2), assigned_to: userId });
  }, [open, followup, userId, defaultTitle]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const payload = { kind: f.kind, title: f.title, notes: f.notes || null, due_at: new Date(f.due_at).toISOString(), assigned_to: f.assigned_to || null };
    const { error } = followup
      ? await sb().from("followups").update(payload).eq("id", followup.id)
      : await sb().from("followups").insert({ ...payload, lead_id: leadId ?? null, contact_id: contactId ?? null });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(followup ? "Follow-up updated" : "Follow-up scheduled");
    onSaved();
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title={followup ? "Edit follow-up" : "Schedule follow-up"} size="sm"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button form="fu-form" loading={busy}>Save</Button></>}>
      <form id="fu-form" onSubmit={save} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Type">
            <Select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}>
              {FOLLOWUP_KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
            </Select>
          </Field>
          <Field label="Assign to">
            <Select value={f.assigned_to} onChange={(e) => setF({ ...f, assigned_to: e.target.value })}>
              {team.filter((t) => t.is_active).map((t) => <option key={t.id} value={t.id}>{t.full_name}</option>)}
            </Select>
          </Field>
        </div>
        <Field label="Title" required><Input required value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
        <Field label="Due">
          <Input type="datetime-local" required value={f.due_at} onChange={(e) => setF({ ...f, due_at: e.target.value })} />
        </Field>
        <div className="flex flex-wrap gap-1.5">
          {[["1 hour", 1], ["3 hours", 3], ["Tomorrow", 24], ["2 days", 48], ["1 week", 168]].map(([l, h]) => (
            <button type="button" key={l} onClick={() => setF({ ...f, due_at: quick(h as number) })} className="rounded-full border border-slate-200 px-2.5 py-0.5 text-xs text-slate-600 hover:bg-slate-50">{l}</button>
          ))}
        </div>
        <Field label="Notes"><Textarea value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
      </form>
    </Modal>
  );
}

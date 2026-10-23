"use client";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { FileText, Trash2, Upload, Download } from "lucide-react";
import { sb } from "@/lib/supabase/client";
import { DOC_TYPES, statusMeta } from "@/lib/constants";
import { fmtDate } from "@/lib/utils";
import { useLoad } from "@/lib/hooks";
import { useAuth } from "./auth";
import { Badge, Button, Card, Input, Select } from "./ui";

type Doc = { id: string; name: string; doc_type: string; file_path: string; file_size: number | null; expiry_date: string | null; created_at: string };

export function DocumentsCard({ contactId, leadId, bookingId }: { contactId?: string | null; leadId?: string | null; bookingId?: string | null }) {
  const { can } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);
  const [type, setType] = useState("passport");
  const [expiry, setExpiry] = useState("");
  const [busy, setBusy] = useState(false);

  const { data, reload } = useLoad(async () => {
    let q = sb().from("documents").select("*").order("created_at", { ascending: false });
    const ors: string[] = [];
    if (contactId) ors.push(`contact_id.eq.${contactId}`);
    if (leadId) ors.push(`lead_id.eq.${leadId}`);
    if (bookingId) ors.push(`booking_id.eq.${bookingId}`);
    if (!ors.length) return [] as Doc[];
    q = q.or(ors.join(","));
    const { data } = await q;
    return (data ?? []) as Doc[];
  }, [contactId, leadId, bookingId]);

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    for (const file of Array.from(files)) {
      if (file.size > 10 * 1024 * 1024) { toast.error(`${file.name} is larger than 10 MB`); continue; }
      const folder = bookingId ? `booking/${bookingId}` : leadId ? `lead/${leadId}` : `contact/${contactId}`;
      const path = `${folder}/${Date.now()}-${file.name.replace(/[^\w.\-]+/g, "_")}`;
      const up = await sb().storage.from("documents").upload(path, file, { contentType: file.type });
      if (up.error) { toast.error(up.error.message); continue; }
      const { error } = await sb().from("documents").insert({
        name: file.name, doc_type: type, file_path: path, file_size: file.size, mime_type: file.type,
        expiry_date: expiry || null, contact_id: contactId ?? null, lead_id: leadId ?? null, booking_id: bookingId ?? null,
      });
      if (error) toast.error(error.message);
    }
    setBusy(false);
    setExpiry("");
    if (fileRef.current) fileRef.current.value = "";
    reload();
  }

  async function open(d: Doc) {
    const { data, error } = await sb().storage.from("documents").createSignedUrl(d.file_path, 300);
    if (error) return toast.error(error.message);
    window.open(data.signedUrl, "_blank");
  }

  async function remove(d: Doc) {
    await sb().storage.from("documents").remove([d.file_path]);
    const { error } = await sb().from("documents").delete().eq("id", d.id);
    if (error) return toast.error(error.message);
    reload();
  }

  return (
    <Card title="Documents" bodyClass="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Select value={type} onChange={(e) => setType(e.target.value)} className="h-8 w-28 text-xs">
          {DOC_TYPES.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
        </Select>
        <Input type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} className="h-8 w-36 text-xs" title="Expiry (optional)" />
        <input ref={fileRef} type="file" multiple hidden onChange={(e) => upload(e.target.files)} />
        <Button size="sm" variant="secondary" loading={busy} onClick={() => fileRef.current?.click()}><Upload className="h-3.5 w-3.5" /> Upload</Button>
      </div>
      {(data ?? []).length === 0 && <p className="text-xs text-slate-400">Passport, visa, tickets, ID proofs…</p>}
      <ul className="divide-y divide-slate-100">
        {(data ?? []).map((d) => {
          const expired = d.expiry_date && d.expiry_date < new Date().toISOString().slice(0, 10);
          return (
            <li key={d.id} className="flex items-center gap-2 py-2">
              <FileText className="h-4 w-4 shrink-0 text-slate-400" />
              <div className="min-w-0 flex-1">
                <button onClick={() => open(d)} className="block truncate text-left text-sm text-slate-800 hover:text-brand-700">{d.name}</button>
                <div className="flex gap-1 text-[11px] text-slate-500">
                  <Badge>{statusMeta(DOC_TYPES, d.doc_type)?.label}</Badge>
                  {d.expiry_date && <span className={expired ? "text-rose-600" : ""}>exp {fmtDate(d.expiry_date)}</span>}
                </div>
              </div>
              <button onClick={() => open(d)} className="p-1 text-slate-400 hover:text-slate-700" title="Download"><Download className="h-4 w-4" /></button>
              {can("contacts", "delete") && <button onClick={() => remove(d)} className="p-1 text-slate-400 hover:text-rose-600" title="Delete"><Trash2 className="h-4 w-4" /></button>}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

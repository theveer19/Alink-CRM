"use client";
import { useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Download, Pencil, Plus, Trash2, Upload } from "lucide-react";
import { sb } from "@/lib/supabase/client";
import { downloadCsv, inr, parseCsv } from "@/lib/utils";
import { useDebounced } from "@/lib/hooks";
import { useAuth } from "./auth";
import { Badge, Button, Card, ConfirmButton, Empty, Field, Input, Modal, Select, Spinner, Table, Td, Textarea, Th } from "./ui";

export type CrudField = {
  key: string;
  label: string;
  type?: "text" | "number" | "money" | "select" | "textarea" | "date" | "bool";
  options?: { value: string; label: string }[];
  required?: boolean;
  list?: boolean;          // show in table
  wide?: boolean;
  default?: unknown;
};

export function CrudTable({ table, title, fields, module = "masters", order = "name", searchKeys = ["name"], extraAction, rowAction }: {
  table: string; title: string; fields: CrudField[]; module?: string; order?: string; searchKeys?: string[];
  extraAction?: ReactNode; rowAction?: (row: any) => ReactNode;
}) {
  const { can } = useAuth();
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const dq = useDebounced(q);
  const [edit, setEdit] = useState<any | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    setLoading(true);
    let qb = sb().from(table).select("*").order(order).limit(2000);
    const t = dq.trim().replace(/[%,()]/g, "");
    if (t) qb = qb.or(searchKeys.map((k) => `${k}.ilike.%${t}%`).join(","));
    const { data, error } = await qb;
    setLoading(false);
    if (error) return toast.error(error.message);
    setRows(data ?? []);
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [dq, table]);

  function blank() {
    const o: any = {};
    fields.forEach((f) => (o[f.key] = f.default ?? (f.type === "bool" ? true : f.type === "number" || f.type === "money" ? 0 : "")));
    return o;
  }

  function clean(o: any) {
    const p: any = {};
    fields.forEach((f) => {
      let v = o[f.key];
      if (f.type === "number" || f.type === "money") v = v === "" || v == null ? 0 : Number(v);
      else if (f.type === "bool") v = !!v && v !== "false";
      else if (v === "") v = null;
      p[f.key] = v;
    });
    return p;
  }

  async function save() {
    for (const f of fields) if (f.required && !String(edit[f.key] ?? "").trim()) return toast.error(`${f.label} is required`);
    setBusy(true);
    const p = clean(edit);
    const { error } = edit.id ? await sb().from(table).update(p).eq("id", edit.id) : await sb().from(table).insert(p);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Saved");
    setEdit(null);
    load();
  }

  async function importCsv(file: File | undefined) {
    if (!file) return;
    const t = parseCsv(await file.text());
    if (t.length < 2) return toast.error("Empty file");
    const hdr = t[0].map((h) => h.trim().toLowerCase());
    const recs = t.slice(1).map((r) => {
      const o: any = blank();
      fields.forEach((f) => {
        const i = hdr.findIndex((h) => h === f.key || h === f.label.toLowerCase());
        if (i >= 0) o[f.key] = r[i];
      });
      return clean(o);
    }).filter((o) => fields.filter((f) => f.required).every((f) => o[f.key]));
    const { error } = await sb().from(table).insert(recs);
    if (error) return toast.error(error.message);
    toast.success(`Imported ${recs.length} rows`);
    load();
  }

  const listFields = fields.filter((f) => f.list);
  const show = (f: CrudField, v: any) => {
    if (f.type === "bool") return v ? <Badge className="bg-emerald-100 text-emerald-700">Yes</Badge> : <Badge>No</Badge>;
    if (f.type === "money") return inr(v);
    if (f.type === "select") return f.options?.find((o) => o.value === v)?.label ?? v ?? "—";
    return v == null || v === "" ? "—" : String(v);
  };

  return (
    <Card title={title} bodyClass="p-0" action={
      <div className="flex flex-wrap gap-2">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" className="h-8 w-44 text-xs" />
        <Button size="sm" variant="secondary" onClick={() => downloadCsv(`${table}.csv`, [fields.map((f) => f.key), ...rows.map((r) => fields.map((f) => r[f.key]))])}><Download className="h-3.5 w-3.5" /></Button>
        {can(module, "create") && (
          <label className="inline-flex h-8 cursor-pointer items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 text-xs font-medium text-slate-700 hover:bg-slate-50" title="Import CSV (same columns as export)">
            <Upload className="h-3.5 w-3.5" /><input type="file" accept=".csv" hidden onChange={(e) => importCsv(e.target.files?.[0])} />
          </label>
        )}
        {extraAction}
        {can(module, "create") && <Button size="sm" onClick={() => setEdit(blank())}><Plus className="h-3.5 w-3.5" /> Add</Button>}
      </div>
    }>
      {loading ? <Spinner /> : rows.length === 0 ? <Empty title={`No ${title.toLowerCase()} yet`} /> : (
        <Table>
          <thead><tr>{listFields.map((f) => <Th key={f.key} className={f.type === "money" ? "text-right" : ""}>{f.label}</Th>)}<Th /></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="hover:bg-slate-50">
                {listFields.map((f, i) => (
                  <Td key={f.key} className={f.type === "money" ? "text-right" : i === 0 ? "font-medium" : ""}>
                    <span className={f.type === "textarea" ? "line-clamp-2 max-w-md text-xs" : ""}>{show(f, r[f.key])}</span>
                  </Td>
                ))}
                <Td>
                  <div className="flex justify-end gap-1">
                    {rowAction?.(r)}
                    {can(module, "edit") && <button onClick={() => setEdit({ ...r })} className="rounded p-1 text-slate-400 hover:bg-slate-100"><Pencil className="h-3.5 w-3.5" /></button>}
                    {can(module, "delete") && <ConfirmButton size="icon" label="?" onConfirm={async () => { const { error } = await sb().from(table).delete().eq("id", r.id); if (error) toast.error(error.message); else load(); }}><Trash2 className="h-3.5 w-3.5" /></ConfirmButton>}
                  </div>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? `Edit ${title.replace(/s$/, "").toLowerCase()}` : `Add ${title.replace(/s$/, "").toLowerCase()}`} size="md"
        footer={<><Button variant="secondary" onClick={() => setEdit(null)}>Cancel</Button><Button loading={busy} onClick={save}>Save</Button></>}>
        {edit && (
          <div className="grid grid-cols-2 gap-3">
            {fields.map((f) => (
              <Field key={f.key} label={f.label} required={f.required} className={f.wide || f.type === "textarea" ? "col-span-2" : ""}>
                {f.type === "select" ? (
                  <Select value={edit[f.key] ?? ""} onChange={(e) => setEdit({ ...edit, [f.key]: e.target.value })}>
                    {!f.required && <option value="">—</option>}
                    {f.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </Select>
                ) : f.type === "textarea" ? (
                  <Textarea rows={4} value={edit[f.key] ?? ""} onChange={(e) => setEdit({ ...edit, [f.key]: e.target.value })} />
                ) : f.type === "bool" ? (
                  <label className="flex h-9 items-center gap-2 text-sm"><input type="checkbox" checked={!!edit[f.key]} onChange={(e) => setEdit({ ...edit, [f.key]: e.target.checked })} /> {f.label}</label>
                ) : (
                  <Input type={f.type === "money" || f.type === "number" ? "number" : f.type === "date" ? "date" : "text"} value={edit[f.key] ?? ""} onChange={(e) => setEdit({ ...edit, [f.key]: e.target.value })} />
                )}
              </Field>
            ))}
          </div>
        )}
      </Modal>
    </Card>
  );
}

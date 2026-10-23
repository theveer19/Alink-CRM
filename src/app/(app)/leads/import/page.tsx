"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowLeft, FileSpreadsheet, Download } from "lucide-react";
import { sb } from "@/lib/supabase/client";
import { downloadCsv, isoDate, parseCsv } from "@/lib/utils";
import { Guard, useAuth } from "@/components/auth";
import { Button, Card, Field, PageHeader, Select, Table, Td, Th } from "@/components/ui";

const TARGETS = [
  { key: "name", label: "Name", match: ["name", "full_name", "full name", "customer", "customer name", "client"] },
  { key: "phone", label: "Phone", match: ["phone", "mobile", "phone_number", "phone number", "contact", "whatsapp", "mobile number"] },
  { key: "email", label: "Email", match: ["email", "email address", "e-mail"] },
  { key: "city", label: "City", match: ["city", "location", "from"] },
  { key: "destination", label: "Destination", match: ["destination", "place", "package", "tour", "where"] },
  { key: "travel_date", label: "Travel date", match: ["travel date", "travel_date", "date of travel", "departure", "start date"] },
  { key: "nights", label: "Nights", match: ["nights", "no of nights", "duration"] },
  { key: "adults", label: "Adults", match: ["adults", "pax", "no of adults", "persons", "travellers"] },
  { key: "children", label: "Children", match: ["children", "kids", "child"] },
  { key: "budget", label: "Budget", match: ["budget", "amount"] },
  { key: "source", label: "Source", match: ["source", "lead source", "platform"] },
  { key: "campaign", label: "Campaign", match: ["campaign", "campaign_name", "ad", "ad_name", "form", "form_name"] },
  { key: "requirements", label: "Notes", match: ["notes", "remarks", "requirement", "requirements", "message", "comments"] },
] as const;

type Row = Record<string, string>;

function parseDateLoose(v: string): string | null {
  const s = v.trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (m) {
    const y = m[3].length === 2 ? "20" + m[3] : m[3];
    return `${y}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`; // dd/mm/yyyy (India)
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : isoDate(d);
}

export default function ImportPage() {
  return <Guard module="leads" action="import"><Importer /></Guard>;
}

function Importer() {
  const { sources, team, userId } = useAuth();
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [map, setMap] = useState<Record<string, string>>({});
  const [source, setSource] = useState("Excel Import");
  const [assign, setAssign] = useState<string>("auto");
  const [skipDupes, setSkipDupes] = useState(true);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [fileName, setFileName] = useState("");

  async function onFile(file: File | undefined) {
    if (!file) return;
    setFileName(file.name);
    let table: string[][] = [];
    try {
      if (file.name.toLowerCase().endsWith(".csv")) {
        table = parseCsv(await file.text());
      } else {
        const ExcelJS = (await import("exceljs")).default;
        const wb = new ExcelJS.Workbook();
        await wb.xlsx.load(await file.arrayBuffer());
        const ws = wb.worksheets[0];
        ws.eachRow({ includeEmpty: false }, (r) => {
          const vals = (r.values as unknown[]).slice(1).map((v) => {
            if (v instanceof Date) return isoDate(v);
            if (v && typeof v === "object") {
              const o = v as { text?: string; result?: unknown; richText?: { text: string }[] };
              if (o.richText) return o.richText.map((t) => t.text).join("");
              if (o.text) return String(o.text);
              if (o.result != null) return String(o.result);
            }
            return v == null ? "" : String(v);
          });
          table.push(vals);
        });
      }
    } catch (e: any) {
      return toast.error("Could not read file: " + e.message + " (save as .xlsx or .csv)");
    }
    if (table.length < 2) return toast.error("File has no data rows");
    const hdr = table[0].map((h, i) => (h || `Column ${i + 1}`).trim());
    const data = table.slice(1).map((r) => Object.fromEntries(hdr.map((h, i) => [h, (r[i] ?? "").toString().trim()])));
    setHeaders(hdr);
    setRows(data.filter((r) => Object.values(r).some(Boolean)));
    const auto: Record<string, string> = {};
    TARGETS.forEach((t) => {
      const h = hdr.find((x) => (t.match as readonly string[]).includes(x.toLowerCase().trim()));
      if (h) auto[t.key] = h;
    });
    setMap(auto);
  }

  const mapped = useMemo(
    () =>
      rows.map((r) => {
        const get = (k: string) => (map[k] ? r[map[k]] ?? "" : "");
        const extra = headers.filter((h) => !Object.values(map).includes(h) && r[h]).map((h) => `${h}: ${r[h]}`);
        return {
          name: get("name") || get("phone") || "Unknown",
          phone: get("phone").replace(/^p:/, "") || null,
          email: get("email") || null,
          city: get("city") || null,
          destination: get("destination") || null,
          travel_date: parseDateLoose(get("travel_date")),
          nights: parseInt(get("nights")) || null,
          adults: parseInt(get("adults")) || 2,
          children: parseInt(get("children")) || 0,
          budget: parseFloat(get("budget").replace(/[^\d.]/g, "")) || null,
          source: normalizeSource(get("source")) || source,
          campaign: get("campaign") || null,
          requirements: [get("requirements"), ...extra].filter(Boolean).join("\n") || null,
        };
      }),
    [rows, map, headers, source]
  );

  async function run() {
    if (!map.name && !map.phone) return toast.error("Map at least the Name or Phone column");
    setBusy(true);
    let inserted = 0, skipped = 0, failed = 0;
    let list = mapped.filter((m) => m.phone || m.email);
    skipped += mapped.length - list.length;
    if (skipDupes) {
      const phones = list.map((m) => (m.phone ?? "").replace(/\D/g, "").slice(-10)).filter((p) => p.length === 10);
      const existing = new Set<string>();
      for (let i = 0; i < phones.length; i += 200) {
        const { data } = await sb().from("contacts").select("phone_norm, leads(status)").in("phone_norm", phones.slice(i, i + 200));
        (data ?? []).forEach((c: any) => {
          if ((c.leads ?? []).some((l: any) => !["won", "lost"].includes(l.status))) existing.add(c.phone_norm);
        });
      }
      const seen = new Set<string>();
      list = list.filter((m) => {
        const p = (m.phone ?? "").replace(/\D/g, "").slice(-10);
        if (p && (existing.has(p) || seen.has(p))) { skipped++; return false; }
        if (p) seen.add(p);
        return true;
      });
    }
    const assigned_to = assign === "auto" ? null : assign === "me" ? userId : assign;
    for (let i = 0; i < list.length; i += 100) {
      setProgress(`Importing ${i + 1}–${Math.min(list.length, i + 100)} of ${list.length}…`);
      const batch = list.slice(i, i + 100).map((m) => ({ ...m, ...(assigned_to ? { assigned_to } : {}) }));
      const { error, data } = await sb().from("leads").insert(batch).select("id");
      if (error) {
        // retry one by one so a single bad row doesn't kill the batch
        for (const row of batch) {
          const r = await sb().from("leads").insert(row);
          if (r.error) failed++; else inserted++;
        }
      } else inserted += data?.length ?? batch.length;
    }
    setBusy(false);
    setProgress("");
    toast.success(`Imported ${inserted} leads · skipped ${skipped}${failed ? ` · failed ${failed}` : ""}`);
    setRows([]); setHeaders([]); setFileName("");
  }

  function normalizeSource(s: string) {
    const v = s.trim().toLowerCase();
    if (!v) return "";
    if (v === "fb" || v.includes("facebook")) return "Facebook";
    if (v === "ig" || v.includes("insta")) return "Instagram";
    return sources.find((x) => x.toLowerCase() === v) ?? s.trim();
  }

  return (
    <>
      <Link href="/leads" className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800"><ArrowLeft className="h-4 w-4" /> Leads</Link>
      <PageHeader
        title="Import leads"
        subtitle="Excel (.xlsx) or CSV. Facebook / Instagram lead-form sheets work directly."
        actions={<Button variant="secondary" onClick={() => downloadCsv("lead-import-template.csv", [["Name", "Phone", "Email", "City", "Destination", "Travel Date", "Nights", "Adults", "Children", "Budget", "Source", "Notes"], ["Ravi Sharma", "9876543210", "ravi@example.com", "Gwalior", "Kashmir", "15/12/2026", "5", "2", "1", "60000", "Facebook", "Honeymoon"]])}><Download className="h-4 w-4" /> Template</Button>}
      />
      <Card className="mb-5">
        <label className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-300 p-8 text-center hover:border-brand-400 hover:bg-brand-50/30">
          <FileSpreadsheet className="h-10 w-10 text-brand-600" />
          <span className="mt-2 text-sm font-medium">{fileName || "Choose .xlsx or .csv file"}</span>
          <span className="text-xs text-slate-500">First row must be the column headers</span>
          <input type="file" accept=".xlsx,.csv" hidden onChange={(e) => onFile(e.target.files?.[0])} />
        </label>
        <p className="mt-3 text-xs text-slate-500">
          Want new Facebook / Instagram leads to arrive automatically? Set up a Google Sheet sync in <Link href="/settings?tab=capture" className="text-brand-700 underline">Settings → Lead capture</Link>.
        </p>
      </Card>

      {rows.length > 0 && (
        <>
          <Card title={`1. Match columns (${rows.length} rows)`} className="mb-5">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
              {TARGETS.map((t) => (
                <Field key={t.key} label={t.label}>
                  <Select value={map[t.key] ?? ""} onChange={(e) => setMap({ ...map, [t.key]: e.target.value })}>
                    <option value="">— skip —</option>
                    {headers.map((h) => <option key={h}>{h}</option>)}
                  </Select>
                </Field>
              ))}
            </div>
            <p className="mt-2 text-xs text-slate-500">Unmatched columns are saved into the lead notes, so nothing is lost.</p>
          </Card>
          <Card title="2. Options" className="mb-5">
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Source (when the file has none)">
                <Select value={source} onChange={(e) => setSource(e.target.value)}>{sources.map((s) => <option key={s}>{s}</option>)}</Select>
              </Field>
              <Field label="Assign to">
                <Select value={assign} onChange={(e) => setAssign(e.target.value)}>
                  <option value="auto">Auto (Settings rule)</option>
                  <option value="me">Me</option>
                  {team.filter((t) => t.is_active).map((t) => <option key={t.id} value={t.id}>{t.full_name}</option>)}
                </Select>
              </Field>
              <label className="flex items-center gap-2 pt-6 text-sm">
                <input type="checkbox" checked={skipDupes} onChange={(e) => setSkipDupes(e.target.checked)} /> Skip numbers that already have an open lead
              </label>
            </div>
          </Card>
          <Card title="3. Preview (first 10)" bodyClass="p-0" className="mb-5">
            <Table>
              <thead><tr><Th>Name</Th><Th>Phone</Th><Th>Email</Th><Th>Destination</Th><Th>Travel</Th><Th>Pax</Th><Th>Source</Th></tr></thead>
              <tbody>
                {mapped.slice(0, 10).map((m, i) => (
                  <tr key={i}><Td>{m.name}</Td><Td>{m.phone}</Td><Td>{m.email}</Td><Td>{m.destination}</Td><Td>{m.travel_date}</Td><Td>{m.adults}+{m.children}</Td><Td>{m.source}</Td></tr>
                ))}
              </tbody>
            </Table>
          </Card>
          <div className="flex items-center gap-3">
            <Button loading={busy} onClick={run}>Import {rows.length} leads</Button>
            {progress && <span className="text-sm text-slate-500">{progress}</span>}
          </div>
        </>
      )}
    </>
  );
}

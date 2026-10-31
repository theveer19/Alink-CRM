"use client";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Copy, RefreshCw, Trash2, Plus, Upload } from "lucide-react";
import { sb } from "@/lib/supabase/client";
import type { Settings } from "@/lib/types";
import { appUrl, fmtDateTime } from "@/lib/utils";
import { useLoad } from "@/lib/hooks";
import { Guard, useAuth } from "@/components/auth";
import { THEMES } from "@/components/shell";
import { Badge, Button, Card, ConfirmButton, Field, Input, PageHeader, Select, Spinner, Table, Tabs, Td, Textarea, Th } from "@/components/ui";

export default function SettingsPage() {
  return <Guard module="settings" action="edit"><Suspense fallback={<Spinner />}><SettingsInner /></Suspense></Guard>;
}

function SettingsInner() {
  const params = useSearchParams();
  const { settings, reload } = useAuth();
  const [tab, setTab] = useState(params.get("tab") ?? "company");
  const [s, setS] = useState<Settings>(settings);
  const [busy, setBusy] = useState(false);

  useEffect(() => setS(settings), [settings]);

  const set = (k: keyof Settings) => (e: { target: { value: string } }) => setS({ ...s, [k]: e.target.value } as Settings);

  async function save() {
    setBusy(true);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { id, ...rest } = s as any;
    delete rest.updated_at;
    ["default_markup_percent", "default_gst_percent", "default_tcs_percent", "unattended_hours", "default_margin_amount", "package_validity_days"].forEach((k) => (rest[k] = Number(rest[k] || 0)));
    const { error } = await sb().from("settings").update({ ...rest, updated_at: new Date().toISOString() }).eq("id", 1);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Settings saved");
    reload();
  }

  async function uploadLogo(file: File | undefined) {
    if (!file) return;
    const path = `logo-${Date.now()}.${file.name.split(".").pop()}`;
    const { error } = await sb().storage.from("branding").upload(path, file, { upsert: true, contentType: file.type });
    if (error) return toast.error(error.message);
    const { data } = sb().storage.from("branding").getPublicUrl(path);
    setS({ ...s, logo_url: data.publicUrl });
    toast.success("Logo uploaded — click Save");
  }

  return (
    <>
      <PageHeader title="Settings" actions={tab !== "capture" && <Button loading={busy} onClick={save}>Save settings</Button>} />
      <Tabs value={tab} onChange={setTab} tabs={[
        { value: "company", label: "Company & branding" }, { value: "tax", label: "Invoice, GST & bank" }, { value: "docs", label: "Quotes & vouchers" },
        { value: "capture", label: "Lead capture (FB / Insta / website)" },
      ]} />

      {tab === "company" && (
        <Card>
          <div className="grid gap-4 md:grid-cols-3">
            <Field label="Company name" required><Input value={s.company_name} onChange={set("company_name")} /></Field>
            <Field label="Tagline"><Input value={s.tagline ?? ""} onChange={set("tagline")} /></Field>
            <Field label="Brand colour" hint="Used on itineraries, invoices, vouchers">
              <div className="flex gap-2"><input type="color" value={s.brand_color} onChange={set("brand_color")} className="h-9 w-12 rounded border" /><Input value={s.brand_color} onChange={set("brand_color")} /></div>
            </Field>
            <Field label="Phone"><Input value={s.phone ?? ""} onChange={set("phone")} /></Field>
            <Field label="Phone 2"><Input value={s.phone2 ?? ""} onChange={set("phone2")} /></Field>
            <Field label="WhatsApp number" hint="Sidebar & Customer Care WhatsApp button"><Input value={s.whatsapp ?? ""} onChange={set("whatsapp")} /></Field>
            <Field label="Support email"><Input value={s.support_email ?? ""} onChange={set("support_email")} /></Field>
            <Field label="Sales email"><Input value={s.sales_email ?? ""} onChange={set("sales_email")} /></Field>
            <Field label="Default theme" hint="Each user can still pick a theme from the top bar">
              <Select value={s.theme ?? "blue"} onChange={set("theme")}>{THEMES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}</Select>
            </Field>
            <Field label="Email"><Input value={s.email ?? ""} onChange={set("email")} /></Field>
            <Field label="Website"><Input value={s.website ?? ""} onChange={set("website")} /></Field>
            <Field label="Address" className="md:col-span-2"><Input value={s.address ?? ""} onChange={set("address")} /></Field>
            <Field label="City"><Input value={s.city ?? ""} onChange={set("city")} /></Field>
            <Field label="Logo">
              <div className="flex items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {s.logo_url && <img src={s.logo_url} alt="logo" className="h-12 w-12 rounded border object-contain" />}
                <label className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg border border-slate-300 px-3 text-sm hover:bg-slate-50">
                  <Upload className="h-4 w-4" /> Upload<input type="file" accept="image/*" hidden onChange={(e) => uploadLogo(e.target.files?.[0])} />
                </label>
              </div>
            </Field>
            <Field label="Logo URL" className="md:col-span-2"><Input value={s.logo_url ?? ""} onChange={set("logo_url")} /></Field>
          </div>
        </Card>
      )}

      {tab === "tax" && (
        <div className="grid gap-5 lg:grid-cols-2">
          <Card title="GST & tax defaults">
            <div className="grid grid-cols-2 gap-3">
              <Field label="GSTIN"><Input value={s.gstin ?? ""} onChange={(e) => setS({ ...s, gstin: e.target.value.toUpperCase() })} /></Field>
              <Field label="PAN"><Input value={s.pan ?? ""} onChange={(e) => setS({ ...s, pan: e.target.value.toUpperCase() })} /></Field>
              <Field label="Your state" hint="Same state → CGST+SGST, else IGST"><Input value={s.state ?? ""} onChange={set("state")} /></Field>
              <Field label="State code"><Input value={s.state_code ?? ""} onChange={set("state_code")} /></Field>
              <Field label="SAC code"><Input value={s.sac_code} onChange={set("sac_code")} /></Field>
              <Field label="Default GST %"><Select value={s.default_gst_percent} onChange={set("default_gst_percent")}>{[0, 5, 12, 18].map((g) => <option key={g} value={g}>{g}%</option>)}</Select></Field>
              <Field label="GST charged on (quotes)"><Select value={s.gst_mode} onChange={set("gst_mode")}><option value="total">Whole package (5% tour operator)</option><option value="markup">Service fee only (18%)</option></Select></Field>
              <Field label="Default TCS %"><Select value={s.default_tcs_percent} onChange={set("default_tcs_percent")}>{[0, 2, 5, 20].map((g) => <option key={g} value={g}>{g}%</option>)}</Select></Field>
              <Field label="Default markup %"><Input type="number" value={s.default_markup_percent} onChange={set("default_markup_percent")} /></Field>
              <Field label="Default package margin ₹" hint="Pre-filled Margin Amount on new packages"><Input type="number" value={s.default_margin_amount ?? 0} onChange={set("default_margin_amount")} /></Field>
              <Field label="Package validity (days)"><Input type="number" value={s.package_validity_days ?? 15} onChange={set("package_validity_days")} /></Field>
            </div>
            <p className="mt-3 text-xs text-slate-500">Please confirm the GST rate / TCS rules that apply to your business with your CA — the CRM only calculates what you set.</p>
          </Card>
          <Card title="Bank & UPI (printed on invoice)">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Bank name"><Input value={s.bank_name ?? ""} onChange={set("bank_name")} /></Field>
              <Field label="Account name"><Input value={s.bank_account_name ?? ""} onChange={set("bank_account_name")} /></Field>
              <Field label="Account no."><Input value={s.bank_account_no ?? ""} onChange={set("bank_account_no")} /></Field>
              <Field label="IFSC"><Input value={s.bank_ifsc ?? ""} onChange={(e) => setS({ ...s, bank_ifsc: e.target.value.toUpperCase() })} /></Field>
              <Field label="UPI ID" hint="Shows a pay-by-UPI QR on invoices" className="col-span-2"><Input value={s.upi_id ?? ""} onChange={set("upi_id")} placeholder="alinktours@okicici" /></Field>
            </div>
          </Card>
          <Card title="Numbering prefixes">
            <div className="grid grid-cols-3 gap-3">
              <Field label="Lead"><Input value={s.lead_prefix} onChange={set("lead_prefix")} /></Field>
              <Field label="Quote"><Input value={s.quote_prefix} onChange={set("quote_prefix")} /></Field>
              <Field label="Booking"><Input value={s.booking_prefix} onChange={set("booking_prefix")} /></Field>
              <Field label="Invoice" hint="INV/26-27/0001"><Input value={s.invoice_prefix} onChange={set("invoice_prefix")} /></Field>
              <Field label="Voucher"><Input value={s.voucher_prefix} onChange={set("voucher_prefix")} /></Field>
              <Field label="Receipt"><Input value={s.receipt_prefix} onChange={set("receipt_prefix")} /></Field>
            </div>
          </Card>
          <Card title="Invoice terms"><Textarea rows={6} value={s.invoice_terms ?? ""} onChange={set("invoice_terms")} /></Card>
        </div>
      )}

      {tab === "docs" && (
        <div className="grid gap-5 lg:grid-cols-2">
          <Card title="Package terms & conditions (## heading, - bullet)"><Textarea rows={8} value={s.itinerary_terms ?? ""} onChange={set("itinerary_terms")} /></Card>
          <Card title="Voucher notes (printed on every voucher)"><Textarea rows={8} value={s.voucher_notes ?? ""} onChange={set("voucher_notes")} /></Card>
          <p className="text-xs text-slate-500 lg:col-span-2">Inclusion / exclusion / cancellation templates and WhatsApp / email messages are in Masters → Text &amp; message templates.</p>
        </div>
      )}

      {tab === "capture" && <Capture s={s} setS={setS} save={save} busy={busy} />}
    </>
  );
}

function Capture({ s, setS, save, busy }: { s: Settings; setS: (s: Settings) => void; save: () => void; busy: boolean }) {
  const { role, sources } = useAuth();
  const isAdmin = !!role?.is_admin;
  const secrets = useLoad(async () => {
    if (!isAdmin) return null;
    const { data } = await sb().from("app_secrets").select("*").eq("id", 1).single();
    return data as { lead_webhook_key: string; cron_secret: string } | null;
  }, [isAdmin]);
  const sheets = useLoad(async () => (await sb().from("lead_integrations").select("*").order("created_at")).data ?? [], []);
  const [ns, setNs] = useState({ name: "Facebook lead form", sheet_url: "", default_source: "Facebook" });
  const [syncing, setSyncing] = useState<string | null>(null);

  const base = appUrl();
  const key = secrets.data?.lead_webhook_key ?? "<admin only>";
  const endpoint = `${base}/api/public/lead?key=${key}`;
  const copy = async (t: string) => { await navigator.clipboard.writeText(t); toast.success("Copied"); };

  const formSnippet = `<form action="${endpoint}&source=Website" method="POST">
  <input name="name" placeholder="Your name" required>
  <input name="phone" placeholder="Mobile number" required>
  <input name="email" type="email" placeholder="Email">
  <input name="destination" placeholder="Where do you want to go?">
  <input name="travel_date" type="date">
  <input name="adults" type="number" value="2">
  <textarea name="message" placeholder="Anything else?"></textarea>
  <input name="website_url" style="display:none">  <!-- spam trap, keep hidden -->
  <input type="hidden" name="_redirect" value="https://your-website.com/thank-you">
  <button type="submit">Get my quote</button>
</form>`;

  const appsScript = `// Google Sheet → Extensions → Apps Script → paste → Save
// Triggers (clock icon) → Add trigger → onNewRow → From spreadsheet → On change
function onNewRow() {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
  var props = PropertiesService.getScriptProperties();
  var last = Number(props.getProperty('lastRow') || 1);
  var rows = sh.getDataRange().getValues();
  if (rows.length <= last) return;
  var head = rows[0], out = [];
  for (var i = last; i < rows.length; i++) {
    var o = {}; head.forEach(function (h, j) { o[h] = rows[i][j]; }); out.push(o);
  }
  UrlFetchApp.fetch('${endpoint}&source=Facebook', {
    method: 'post', contentType: 'application/json', payload: JSON.stringify(out), muteHttpExceptions: true
  });
  props.setProperty('lastRow', String(rows.length));
}`;

  return (
    <div className="space-y-5">
      <Card title="Lead assignment & alerts" action={<Button size="sm" loading={busy} onClick={save}>Save</Button>}>
        <div className="grid gap-3 md:grid-cols-3">
          <Field label="New leads from website / Facebook / import go to">
            <Select value={s.auto_assign} onChange={(e) => setS({ ...s, auto_assign: e.target.value as Settings["auto_assign"] })}>
              <option value="none">Nobody (admin assigns manually)</option>
              <option value="round_robin">Round-robin between active staff</option>
            </Select>
          </Field>
          <Field label="Alert if a new lead is untouched for (hours)"><Input type="number" value={s.unattended_hours} onChange={(e) => setS({ ...s, unattended_hours: Number(e.target.value) })} /></Field>
          <p className="self-end text-xs text-slate-500">Turn &quot;Include in lead auto-assign&quot; on/off per user in Users &amp; team.</p>
        </div>
      </Card>

      <Card title="1 · Facebook & Instagram lead ads via Google Sheet (auto-sync)">
        <ol className="mb-4 list-decimal space-y-1 pl-5 text-sm text-slate-600">
          <li>Send your Meta lead-form leads into a Google Sheet (Meta Leads Center → Google Sheets, or Zapier / Pabbly / LeadsBridge).</li>
          <li>In the sheet: <b>Share → Anyone with the link → Viewer</b>, copy the link and add it below.</li>
          <li>The CRM pulls new rows when you click Sync, and automatically once a day (Vercel cron). For instant leads, also add the Apps Script below.</li>
          <li>Columns like <code>full_name, phone_number, email, city, platform (fb/ig), campaign_name, id</code> are mapped automatically; any extra questions go into the lead notes. Rows are never imported twice.</li>
        </ol>
        <div className="mb-4 grid gap-2 md:grid-cols-[1fr_2fr_160px_auto]">
          <Input value={ns.name} onChange={(e) => setNs({ ...ns, name: e.target.value })} placeholder="Name" />
          <Input value={ns.sheet_url} onChange={(e) => setNs({ ...ns, sheet_url: e.target.value })} placeholder="https://docs.google.com/spreadsheets/d/…/edit#gid=0" />
          <Select value={ns.default_source} onChange={(e) => setNs({ ...ns, default_source: e.target.value })}>{sources.map((x) => <option key={x}>{x}</option>)}</Select>
          <Button onClick={async () => {
            if (!/docs\.google\.com\/spreadsheets/.test(ns.sheet_url)) return toast.error("Paste a Google Sheets link");
            const { error } = await sb().from("lead_integrations").insert(ns);
            if (error) return toast.error(error.message);
            setNs({ ...ns, sheet_url: "" });
            sheets.reload();
          }}><Plus className="h-4 w-4" /> Add sheet</Button>
        </div>
        <Table>
          <thead><tr><Th>Name</Th><Th>Source</Th><Th>Last sync</Th><Th>Result</Th><Th /></tr></thead>
          <tbody>
            {(sheets.data ?? []).map((x: any) => (
              <tr key={x.id}>
                <Td className="font-medium">{x.name}<div className="max-w-xs truncate text-xs text-slate-400">{x.sheet_url}</div></Td>
                <Td>{x.default_source}</Td>
                <Td className="text-xs">{x.last_synced_at ? fmtDateTime(x.last_synced_at) : "never"}</Td>
                <Td className="text-xs"><Badge className={x.last_result?.startsWith("Error") ? "bg-rose-100 text-rose-700" : "bg-emerald-50 text-emerald-700"}>{x.last_result ?? "—"}</Badge></Td>
                <Td>
                  <div className="flex gap-1">
                    <Button size="sm" variant="secondary" loading={syncing === x.id} onClick={async () => {
                      setSyncing(x.id);
                      const r = await fetch("/api/leads/sync", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: x.id }) });
                      const d = await r.json().catch(() => ({}));
                      setSyncing(null);
                      if (!r.ok) toast.error(d.error ?? "Sync failed"); else toast.success(`${d.inserted} new lead(s)`);
                      sheets.reload();
                    }}><RefreshCw className="h-3.5 w-3.5" /> Sync now</Button>
                    <ConfirmButton size="icon" label="?" onConfirm={async () => { await sb().from("lead_integrations").delete().eq("id", x.id); sheets.reload(); }}><Trash2 className="h-4 w-4" /></ConfirmButton>
                  </div>
                </Td>
              </tr>
            ))}
            {!(sheets.data ?? []).length && <tr><Td colSpan={5} className="text-slate-400">No sheets connected yet.</Td></tr>}
          </tbody>
        </Table>
      </Card>

      {isAdmin ? (
        <>
          <Card title="2 · Website enquiry form / any webhook" action={
            <ConfirmButton size="sm" variant="secondary" label="Old forms will stop working — sure?" onConfirm={async () => {
              const k = Array.from(crypto.getRandomValues(new Uint8Array(18))).map((b) => b.toString(16).padStart(2, "0")).join("");
              const { error } = await sb().from("app_secrets").update({ lead_webhook_key: k }).eq("id", 1);
              if (error) toast.error(error.message); else { toast.success("New key generated"); secrets.reload(); }
            }}><RefreshCw className="h-3.5 w-3.5" /> New key</ConfirmButton>
          }>
            <p className="mb-2 text-sm text-slate-600">POST JSON or a normal HTML form to this URL. Works with WordPress (Contact Form 7 / Elementor webhooks), Wix, landing pages, Zapier, Pabbly, IndiaMART exports, etc.</p>
            <div className="mb-3 flex gap-2"><Input readOnly value={endpoint} className="font-mono text-xs" /><Button variant="secondary" onClick={() => copy(endpoint)}><Copy className="h-4 w-4" /></Button></div>
            <p className="mb-1 text-xs font-medium text-slate-600">Ready-made hosted form (share on Instagram bio / WhatsApp):</p>
            <div className="mb-3 flex gap-2"><Input readOnly value={`${base}/enquiry?key=${key}`} className="font-mono text-xs" /><Button variant="secondary" onClick={() => copy(`${base}/enquiry?key=${key}`)}><Copy className="h-4 w-4" /></Button></div>
            <p className="mb-1 text-xs font-medium text-slate-600">HTML form for your website:</p>
            <div className="relative">
              <pre className="max-h-64 overflow-auto rounded-lg bg-slate-900 p-3 text-[11px] text-slate-100">{formSnippet}</pre>
              <Button size="sm" variant="secondary" className="absolute right-2 top-2" onClick={() => copy(formSnippet)}><Copy className="h-3.5 w-3.5" /></Button>
            </div>
            <p className="mt-2 text-xs text-slate-500">JSON example: <code>{`{"name":"Ravi","phone":"9876543210","destination":"Goa","source":"Website"}`}</code></p>
          </Card>
          <Card title="3 · Instant push from Google Sheet (optional, Apps Script)">
            <div className="relative">
              <pre className="max-h-72 overflow-auto rounded-lg bg-slate-900 p-3 text-[11px] text-slate-100">{appsScript}</pre>
              <Button size="sm" variant="secondary" className="absolute right-2 top-2" onClick={() => copy(appsScript)}><Copy className="h-3.5 w-3.5" /></Button>
            </div>
            <p className="mt-2 text-xs text-slate-500">
              Scheduled sync URL (use with cron-job.org or UptimeRobot to sync every 15 min on free hosting):<br />
              <code className="break-all">{`${base}/api/cron/sync-sheets?secret=${secrets.data?.cron_secret ?? "…"}`}</code>
            </p>
          </Card>
        </>
      ) : <p className="text-sm text-slate-500">Webhook keys are visible to admins only.</p>}
    </div>
  );
}

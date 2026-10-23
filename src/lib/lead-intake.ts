import "server-only";
import { createHash } from "crypto";
import { adminClient } from "@/lib/supabase/admin";
import { parseCsv } from "@/lib/utils";

/** Header synonyms used by website forms, Facebook / Instagram lead-form sheets, Zapier, Pabbly etc. */
const SYN: Record<string, string[]> = {
  name: ["name", "full_name", "full name", "fullname", "your name", "customer name", "first_name"],
  last_name: ["last_name", "last name", "surname"],
  phone: ["phone", "phone_number", "phone number", "mobile", "mobile number", "mobile_number", "whatsapp", "whatsapp number", "contact", "contact number", "tel"],
  email: ["email", "email address", "e-mail", "your email"],
  city: ["city", "location", "your city"],
  destination: ["destination", "where do you want to go?", "where_do_you_want_to_go?", "package", "tour", "place", "trip"],
  travel_date: ["travel date", "travel_date", "date of travel", "when do you want to travel?", "when_do_you_want_to_travel?", "departure date", "date"],
  nights: ["nights", "no of nights", "duration"],
  adults: ["adults", "no of adults", "pax", "number of travellers", "travellers", "how many people?", "how_many_people?", "persons"],
  children: ["children", "kids", "no of children"],
  budget: ["budget", "your budget"],
  message: ["message", "notes", "requirements", "comments", "query", "enquiry", "your message"],
  source: ["source", "lead_source", "utm_source"],
  platform: ["platform"],
  campaign: ["campaign", "campaign_name", "utm_campaign", "ad_name", "adset_name", "form_name"],
  external_id: ["id", "lead_id", "leadgen_id", "external_id"],
};
const IGNORE = new Set(["created_time", "ad_id", "adset_id", "campaign_id", "form_id", "is_organic", "key", "api_key", "_redirect", "website_url", "inbox_url"]);

function norm(k: string) {
  return k.toLowerCase().trim().replace(/\s+/g, " ");
}

function pick(row: Record<string, string>, field: string) {
  for (const [k, v] of Object.entries(row)) {
    if (SYN[field].includes(norm(k)) && String(v ?? "").trim()) return String(v).trim();
  }
  return "";
}

function toDate(v: string): string | null {
  if (!v) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10);
  const m = v.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (m) return `${m[3].length === 2 ? "20" + m[3] : m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return null;
}

export type IntakeLead = Record<string, unknown>;

/** Turn any loosely-named key/value record into a leads row. */
export function rowToLead(row: Record<string, string>, defaultSource: string, idPrefix?: string): IntakeLead | null {
  let name = pick(row, "name");
  const last = pick(row, "last_name");
  if (last && !name.includes(last)) name = `${name} ${last}`.trim();
  const phone = pick(row, "phone").replace(/^p:/i, "").trim();
  const email = pick(row, "email");
  if (!phone && !email) return null;

  const platform = pick(row, "platform").toLowerCase();
  let source = pick(row, "source") || defaultSource;
  if (platform === "fb" || platform === "facebook") source = "Facebook";
  if (platform === "ig" || platform === "instagram") source = "Instagram";

  const known = new Set(Object.values(SYN).flat());
  const extras = Object.entries(row)
    .filter(([k, v]) => v && !known.has(norm(k)) && !IGNORE.has(norm(k)))
    .map(([k, v]) => `${k.replace(/_/g, " ")}: ${v}`);
  const message = [pick(row, "message"), ...extras].filter(Boolean).join("\n");

  const ext = pick(row, "external_id");
  let external_id: string | null = null;
  if (ext) external_id = `${idPrefix ?? "ext"}:${ext}`;
  else if (idPrefix) external_id = `${idPrefix}:` + createHash("sha1").update(JSON.stringify(row)).digest("hex").slice(0, 20);

  return {
    name: name || phone || email,
    phone: phone || null,
    email: email || null,
    city: pick(row, "city") || null,
    destination: pick(row, "destination") || null,
    travel_date: toDate(pick(row, "travel_date")),
    nights: parseInt(pick(row, "nights")) || null,
    adults: parseInt(pick(row, "adults")) || 2,
    children: parseInt(pick(row, "children")) || 0,
    budget: parseFloat(pick(row, "budget").replace(/[^\d.]/g, "")) || null,
    source,
    campaign: pick(row, "campaign") || null,
    requirements: message || null,
    external_id,
  };
}

/** Insert leads, silently skipping ones whose external_id already exists. */
export async function insertLeads(leads: IntakeLead[]) {
  const supa = adminClient();
  let inserted = 0;
  const withId = leads.filter((l) => l.external_id);
  const withoutId = leads.filter((l) => !l.external_id);
  for (let i = 0; i < withId.length; i += 200) {
    const batch = withId.slice(i, i + 200);
    const { data: existing } = await supa.from("leads").select("external_id").in("external_id", batch.map((b) => b.external_id as string));
    const have = new Set((existing ?? []).map((e) => e.external_id));
    const fresh = batch.filter((b) => !have.has(b.external_id as string));
    if (fresh.length) {
      const { data, error } = await supa.from("leads").insert(fresh).select("id");
      if (error) throw new Error(error.message);
      inserted += data?.length ?? 0;
    }
  }
  if (withoutId.length) {
    const { data, error } = await supa.from("leads").insert(withoutId).select("id");
    if (error) throw new Error(error.message);
    inserted += data?.length ?? 0;
  }
  return inserted;
}

/** https://docs.google.com/spreadsheets/d/<id>/edit#gid=<gid>  →  CSV export URL */
export function sheetCsvUrl(url: string) {
  const id = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/)?.[1];
  if (!id) {
    if (/output=csv|format=csv/.test(url)) return url; // already a published CSV link
    throw new Error("Not a Google Sheets link");
  }
  const gid = url.match(/[#&?]gid=(\d+)/)?.[1] ?? "0";
  return `https://docs.google.com/spreadsheets/d/${id}/export?format=csv&gid=${gid}`;
}

export async function syncSheet(integration: { id: string; sheet_url: string; default_source: string }) {
  const supa = adminClient();
  try {
    const res = await fetch(sheetCsvUrl(integration.sheet_url), { redirect: "follow", cache: "no-store" });
    const text = await res.text();
    if (!res.ok || text.trim().startsWith("<")) throw new Error("Sheet is not shared. Set sharing to 'Anyone with the link → Viewer'.");
    const table = parseCsv(text);
    if (table.length < 2) {
      await supa.from("lead_integrations").update({ last_synced_at: new Date().toISOString(), last_result: "Sheet is empty" }).eq("id", integration.id);
      return { inserted: 0, rows: 0 };
    }
    const hdr = table[0].map((h) => h.trim());
    const leads = table.slice(1)
      .map((r) => rowToLead(Object.fromEntries(hdr.map((h, i) => [h, r[i] ?? ""])), integration.default_source, `sheet-${integration.id.slice(0, 8)}`))
      .filter(Boolean) as IntakeLead[];
    const inserted = await insertLeads(leads);
    const msg = `OK · ${table.length - 1} rows · ${inserted} new`;
    await supa.from("lead_integrations").update({ last_synced_at: new Date().toISOString(), last_result: msg }).eq("id", integration.id);
    return { inserted, rows: table.length - 1 };
  } catch (e: any) {
    await supa.from("lead_integrations").update({ last_synced_at: new Date().toISOString(), last_result: "Error: " + e.message }).eq("id", integration.id);
    throw e;
  }
}

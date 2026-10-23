import { NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { insertLeads, rowToLead } from "@/lib/lead-intake";

export const dynamic = "force-dynamic";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type, x-api-key",
};

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

/**
 * Public lead capture — website forms, Google Apps Script, Zapier/Pabbly, landing pages.
 * Auth: ?key=<webhook key> or header x-api-key (Settings → Lead capture).
 * Body: JSON object, JSON array, or a normal HTML form post. Field names are flexible (name, phone, email, destination…).
 */
export async function POST(req: Request) {
  const url = new URL(req.url);
  let body: Record<string, string>[] = [];
  const ct = req.headers.get("content-type") ?? "";
  try {
    if (ct.includes("application/json")) {
      const j = await req.json();
      body = (Array.isArray(j) ? j : [j]).map((o) => Object.fromEntries(Object.entries(o ?? {}).map(([k, v]) => [k, v == null ? "" : String(v)])));
    } else {
      const fd = await req.formData();
      const o: Record<string, string> = {};
      fd.forEach((v, k) => { o[k] = typeof v === "string" ? v : ""; });
      body = [o];
    }
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400, headers: CORS });
  }

  const key = req.headers.get("x-api-key") || url.searchParams.get("key") || body[0]?.key || body[0]?.api_key;
  const { data: sec } = await adminClient().from("app_secrets").select("lead_webhook_key").eq("id", 1).single();
  if (!key || !sec || key !== sec.lead_webhook_key) return NextResponse.json({ error: "Invalid key" }, { status: 401, headers: CORS });

  const source = url.searchParams.get("source") || body[0]?.source || "Website";
  // honeypot: bots fill hidden "website_url"
  const rows = body.filter((r) => !r.website_url);
  const leads = rows.map((r) => rowToLead(r, source, r.id || r.lead_id ? "api" : undefined)).filter(Boolean) as Record<string, unknown>[];
  if (!leads.length) return NextResponse.json({ error: "Name and phone or email required" }, { status: 400, headers: CORS });

  try {
    const inserted = await insertLeads(leads);
    const redirect = body[0]?._redirect;
    if (redirect && /^https?:\/\//.test(redirect)) return NextResponse.redirect(redirect, { status: 303, headers: CORS });
    return NextResponse.json({ ok: true, inserted }, { headers: CORS });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500, headers: CORS });
  }
}

import { NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { syncSheet } from "@/lib/lead-intake";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Pulls new rows from every active Google Sheet integration. Called by Vercel Cron or any uptime pinger. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const auth = req.headers.get("authorization")?.replace("Bearer ", "") || url.searchParams.get("secret");
  const supa = adminClient();
  const { data: sec } = await supa.from("app_secrets").select("cron_secret").eq("id", 1).single();
  const ok = (process.env.CRON_SECRET && auth === process.env.CRON_SECRET) || (sec && auth === sec.cron_secret);
  if (!ok) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: list } = await supa.from("lead_integrations").select("*").eq("is_active", true);
  const results: Record<string, unknown>[] = [];
  for (const it of list ?? []) {
    try {
      results.push({ name: it.name, ...(await syncSheet(it)) });
    } catch (e: any) {
      results.push({ name: it.name, error: e.message });
    }
  }
  return NextResponse.json({ ok: true, results });
}

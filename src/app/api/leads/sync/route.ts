import { NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { can, getCaller } from "@/lib/supabase/guard";
import { syncSheet } from "@/lib/lead-intake";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** "Sync now" button in Settings → Lead capture */
export async function POST(req: Request) {
  const caller = await getCaller();
  if (!caller || !(can(caller, "leads", "import") || can(caller, "settings", "edit")))
    return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  const { id } = await req.json().catch(() => ({}));
  const supa = adminClient();
  let q = supa.from("lead_integrations").select("*").eq("is_active", true);
  if (id) q = q.eq("id", id);
  const { data } = await q;
  let inserted = 0;
  const errors: string[] = [];
  for (const it of data ?? []) {
    try { inserted += (await syncSheet(it)).inserted; } catch (e: any) { errors.push(`${it.name}: ${e.message}`); }
  }
  if (errors.length && !inserted) return NextResponse.json({ error: errors.join("; ") }, { status: 400 });
  return NextResponse.json({ ok: true, inserted, errors });
}

import { NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { isUuid } from "@/lib/share";

export const dynamic = "force-dynamic";

/** Customer clicked "I want to book this" on a shared itinerary. */
export async function POST(req: Request) {
  const { token } = await req.json().catch(() => ({}));
  if (!token || !isUuid(token)) return NextResponse.json({ error: "bad token" }, { status: 400 });
  const supa = adminClient();
  const { data: it } = await supa.from("itineraries").select("id, lead_id, quote_no, status, created_by").eq("share_token", token).single();
  if (!it) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (it.status !== "accepted") await supa.from("itineraries").update({ status: "accepted" }).eq("id", it.id);
  if (it.lead_id) {
    await supa.from("lead_activities").insert({ lead_id: it.lead_id, kind: "system", body: `🎉 Customer accepted quote ${it.quote_no} from the shared link — call to confirm & collect advance.` });
    await supa.from("leads").update({ status: "negotiation", priority: "hot" }).eq("id", it.lead_id).neq("status", "won");
    const { data: lead } = await supa.from("leads").select("assigned_to").eq("id", it.lead_id).single();
    await supa.from("followups").insert({
      lead_id: it.lead_id, kind: "call", title: `Customer accepted ${it.quote_no} – confirm booking`, due_at: new Date().toISOString(),
      assigned_to: lead?.assigned_to ?? it.created_by, created_by: it.created_by,
    });
  }
  return NextResponse.json({ ok: true });
}

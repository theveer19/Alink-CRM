import { NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

async function needsSetup() {
  const { count, error } = await adminClient().from("profiles").select("id", { count: "exact", head: true });
  if (error) throw new Error(error.message);
  return (count ?? 0) === 0;
}

export async function GET() {
  try {
    return NextResponse.json({ needsSetup: await needsSetup() });
  } catch (e: any) {
    return NextResponse.json({ needsSetup: false, error: e.message }, { status: 500 });
  }
}

/** Creates the very first (admin) user. Refuses once any user exists. */
export async function POST(req: Request) {
  try {
    if (!(await needsSetup())) return NextResponse.json({ error: "Setup already done" }, { status: 403 });
    const { company, name, email, password } = await req.json();
    if (!email || !password || String(password).length < 8) return NextResponse.json({ error: "Email and 8+ character password required" }, { status: 400 });
    const admin = adminClient();
    const { data, error } = await admin.auth.admin.createUser({
      email, password, email_confirm: true, user_metadata: { full_name: name || email.split("@")[0] },
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    // the DB trigger made this first user an active Admin; make sure of it
    const { data: role } = await admin.from("roles").select("id").eq("is_admin", true).limit(1).single();
    await admin.from("profiles").update({ is_active: true, role_id: role?.id, full_name: name || email }).eq("id", data.user.id);
    if (company) await admin.from("settings").update({ company_name: company }).eq("id", 1);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

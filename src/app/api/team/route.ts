import { NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { getCaller } from "@/lib/supabase/guard";

export const dynamic = "force-dynamic";

/**
 * Admin-only user management.
 * POST   { action: "create", email, password, full_name, phone, role_id }
 * POST   { action: "update", id, full_name, phone, role_id, is_active, receives_leads, monthly_target }
 * POST   { action: "password", id, password }
 */
export async function POST(req: Request) {
  const caller = await getCaller();
  if (!caller?.isAdmin) return NextResponse.json({ error: "Only admins can manage users" }, { status: 403 });
  const body = await req.json();
  const supa = adminClient();

  if (body.action === "create") {
    const { email, password, full_name, phone, role_id } = body;
    if (!email || !password || String(password).length < 8) return NextResponse.json({ error: "Email and 8+ character password required" }, { status: 400 });
    const { data, error } = await supa.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name, phone } });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    const { error: e2 } = await supa.from("profiles").update({ full_name, phone, role_id, is_active: true }).eq("id", data.user.id);
    if (e2) return NextResponse.json({ error: e2.message }, { status: 400 });
    return NextResponse.json({ ok: true, id: data.user.id });
  }

  if (body.action === "update") {
    const { id, full_name, phone, role_id, is_active, receives_leads, monthly_target } = body;
    if (id === caller.id && is_active === false) return NextResponse.json({ error: "You cannot deactivate yourself" }, { status: 400 });
    if (id === caller.id && role_id) {
      const { data: r } = await supa.from("roles").select("is_admin").eq("id", role_id).single();
      if (!r?.is_admin) return NextResponse.json({ error: "You cannot remove your own admin role" }, { status: 400 });
    }
    const patch: Record<string, unknown> = {};
    for (const [k, v] of Object.entries({ full_name, phone, role_id, is_active, receives_leads, monthly_target })) if (v !== undefined) patch[k] = v;
    const { error } = await supa.from("profiles").update(patch).eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  }

  if (body.action === "password") {
    if (!body.password || String(body.password).length < 8) return NextResponse.json({ error: "Password must be 8+ characters" }, { status: 400 });
    const { error } = await supa.auth.admin.updateUserById(body.id, { password: body.password });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}

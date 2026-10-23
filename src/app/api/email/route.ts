import { NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { getCaller } from "@/lib/supabase/guard";

export const dynamic = "force-dynamic";

/** Sends an email through Resend (optional). Reply-To is the company email from Settings. */
export async function POST(req: Request) {
  const caller = await getCaller();
  if (!caller) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const key = process.env.RESEND_API_KEY;
  if (!key) return NextResponse.json({ error: "Email sending is not configured (RESEND_API_KEY). Use 'Open in mail app'." }, { status: 400 });
  const { to, subject, text } = await req.json();
  if (!to || !subject || !text) return NextResponse.json({ error: "to, subject and text are required" }, { status: 400 });
  const { data: s } = await adminClient().from("settings").select("company_name, email").eq("id", 1).single();
  const from = process.env.EMAIL_FROM || `${s?.company_name ?? "Travel CRM"} <onboarding@resend.dev>`;
  const html = `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.6;color:#111">${String(text)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/(https?:\/\/[^\s]+)/g, '<a href="$1">$1</a>')
    .replace(/\n/g, "<br>")}</div>`;
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: String(to).split(/[,;]\s*/), subject, text, html, reply_to: s?.email || undefined }),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) return NextResponse.json({ error: d?.message ?? "Email failed" }, { status: 400 });
  return NextResponse.json({ ok: true, id: d.id });
}

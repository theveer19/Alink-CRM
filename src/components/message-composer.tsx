"use client";
import { useEffect, useState } from "react";
import { MessageCircle, Mail, Send } from "lucide-react";
import { toast } from "sonner";
import { sb } from "@/lib/supabase/client";
import { fillTemplate, waLink } from "@/lib/utils";
import { useAuth } from "./auth";
import { Button, Field, Input, Modal, Select, Textarea } from "./ui";

export type ComposeTarget = {
  channel: "whatsapp" | "email";
  name: string;
  phone?: string | null;
  email?: string | null;
  vars?: Record<string, string | number | null | undefined>;
  subject?: string;
  body?: string;
  leadId?: string | null;
};

/** WhatsApp (wa.me) / email composer with templates. Logs the message on the lead timeline. */
export function MessageComposer({ target, onClose }: { target: ComposeTarget | null; onClose: () => void }) {
  const { templates, settings, profile } = useAuth();
  const [body, setBody] = useState("");
  const [subject, setSubject] = useState("");
  const [to, setTo] = useState("");
  const [sending, setSending] = useState(false);
  const list = templates.filter((t) => t.category === target?.channel);

  const vars = {
    name: target?.name, company: settings.company_name, user: profile.full_name, phone: settings.phone, ...(target?.vars ?? {}),
  };

  useEffect(() => {
    if (!target) return;
    setBody(target.body ?? (list[0] ? fillTemplate(list[0].body, vars) : `Hi ${target.name}, `));
    setSubject(target.subject ?? `${settings.company_name}`);
    setTo((target.channel === "whatsapp" ? target.phone : target.email) ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  if (!target) return null;

  async function log() {
    if (target?.leadId)
      await sb().from("lead_activities").insert({ lead_id: target.leadId, kind: target.channel, body: (target.channel === "email" ? `Email: ${subject}\n` : "WhatsApp: ") + body.slice(0, 500) });
  }

  async function sendWhatsapp() {
    window.open(waLink(to, body), "_blank");
    await log();
    onClose();
  }

  async function sendEmail(viaServer: boolean) {
    if (!to) return toast.error("Email address missing");
    if (!viaServer) {
      window.location.href = `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
      await log();
      return onClose();
    }
    setSending(true);
    const r = await fetch("/api/email", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ to, subject, text: body }) });
    const d = await r.json().catch(() => ({}));
    setSending(false);
    if (!r.ok) return toast.error(d.error ?? "Email failed — use 'Open in mail app' instead");
    toast.success("Email sent");
    await log();
    onClose();
  }

  return (
    <Modal open onClose={onClose} title={target.channel === "whatsapp" ? "Send WhatsApp" : "Send email"} size="md"
      footer={target.channel === "whatsapp" ? (
        <Button variant="success" onClick={sendWhatsapp}><MessageCircle className="h-4 w-4" /> Open in WhatsApp</Button>
      ) : (
        <>
          <Button variant="secondary" onClick={() => sendEmail(false)}><Mail className="h-4 w-4" /> Open in mail app</Button>
          <Button loading={sending} onClick={() => sendEmail(true)}><Send className="h-4 w-4" /> Send now</Button>
        </>
      )}>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label={target.channel === "whatsapp" ? "WhatsApp number" : "To"}><Input value={to} onChange={(e) => setTo(e.target.value)} /></Field>
          <Field label="Template">
            <Select defaultValue="" onChange={(e) => { const t = list.find((x) => x.id === e.target.value); if (t) setBody(fillTemplate(t.body, vars)); }}>
              <option value="">Choose…</option>
              {list.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
            </Select>
          </Field>
        </div>
        {target.channel === "email" && <Field label="Subject"><Input value={subject} onChange={(e) => setSubject(e.target.value)} /></Field>}
        <Field label="Message"><Textarea rows={8} value={body} onChange={(e) => setBody(e.target.value)} /></Field>
        <p className="text-[11px] text-slate-400">Templates are managed in Masters → Message templates. Variables: {"{name} {company} {user} {destination} {link} {amount} {booking}"}</p>
      </div>
    </Modal>
  );
}

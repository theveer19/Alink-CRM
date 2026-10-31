"use client";
import { Headphones, Mail, MessageCircle, Phone } from "lucide-react";
import { useAuth } from "@/components/auth";
import { Card } from "@/components/ui";

export default function CustomerCarePage() {
  const { settings: s, team } = useAuth();
  const phones = [s.phone, s.phone2].filter(Boolean) as string[];
  const staff = team.filter((t) => t.is_active && t.phone);
  const wa = (s.whatsapp || s.phone || "").replace(/\D/g, "");
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <h1 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-slate-700"><Headphones className="h-4 w-4" /> Customer Care</h1>
      <Card title="Contact Numbers">
        <div className="space-y-2">
          {phones.map((p) => <a key={p} href={`tel:${p}`} className="flex items-center gap-2 text-sm font-medium text-slate-800 hover:text-brand-700"><Phone className="h-4 w-4 text-brand-600" /> Call: {p}</a>)}
          {staff.map((t) => <a key={t.id} href={`tel:${t.phone}`} className="flex items-center gap-2 text-sm text-slate-700 hover:text-brand-700"><Phone className="h-4 w-4 text-slate-400" /> {t.full_name}: {t.phone}</a>)}
          {wa && <a href={`https://wa.me/${wa.length === 10 ? "91" + wa : wa}`} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"><MessageCircle className="h-4 w-4" /> Message on WhatsApp</a>}
          {!phones.length && !wa && <p className="text-sm text-slate-500">Add phone numbers in Settings → Company.</p>}
        </div>
      </Card>
      <Card title="Email">
        <div className="space-y-2 text-sm">
          {s.support_email && <p className="flex items-center gap-2"><Mail className="h-4 w-4 text-brand-600" /> Support Email: <a className="text-brand-700" href={`mailto:${s.support_email}`}>{s.support_email}</a></p>}
          {s.sales_email && <p className="flex items-center gap-2"><Mail className="h-4 w-4 text-brand-600" /> Sales Email: <a className="text-brand-700" href={`mailto:${s.sales_email}`}>{s.sales_email}</a></p>}
          {s.email && <p className="flex items-center gap-2"><Mail className="h-4 w-4 text-brand-600" /> Office: <a className="text-brand-700" href={`mailto:${s.email}`}>{s.email}</a></p>}
        </div>
      </Card>
      {s.address && <Card title="Office"><p className="text-sm text-slate-700">{[s.address, s.city, s.state].filter(Boolean).join(", ")}</p></Card>}
    </div>
  );
}

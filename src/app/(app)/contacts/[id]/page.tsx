"use client";
import { useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, Mail, MessageCircle, Pencil, Phone, Plus, Trash2, Map } from "lucide-react";
import { sb } from "@/lib/supabase/client";
import { BOOKING_STATUSES, INVOICE_STATUSES, LEAD_STATUSES, statusMeta } from "@/lib/constants";
import type { Contact, Lead } from "@/lib/types";
import { fmtDate, inr } from "@/lib/utils";
import { useLoad } from "@/lib/hooks";
import { Guard, useAuth } from "@/components/auth";
import { ContactForm } from "@/components/contact-form";
import { LeadForm } from "@/components/lead-form";
import { DocumentsCard } from "@/components/documents-card";
import { MessageComposer, type ComposeTarget } from "@/components/message-composer";
import { Badge, Button, Card, ConfirmButton, Spinner, Stat, Table, Td, Th } from "@/components/ui";

export default function ContactPage() {
  return <Guard module="contacts"><ContactDetail /></Guard>;
}

function ContactDetail() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { can, settings } = useAuth();
  const [edit, setEdit] = useState(false);
  const [newLead, setNewLead] = useState(false);
  const [compose, setCompose] = useState<ComposeTarget | null>(null);

  const c = useLoad(async () => {
    const { data, error } = await sb().from("contacts").select("*").eq("id", id).single();
    if (error) throw error;
    return data as Contact;
  }, [id]);

  const rel = useLoad(async () => {
    const supa = sb();
    const [leads, bookings, invoices, payments] = await Promise.all([
      supa.from("leads").select("*").eq("contact_id", id).order("created_at", { ascending: false }),
      supa.from("booking_summary").select("*").eq("contact_id", id).order("start_date", { ascending: false }),
      can("invoices") ? supa.from("invoices").select("id, invoice_no, invoice_date, total, amount_paid, status").eq("contact_id", id).order("invoice_date", { ascending: false }) : Promise.resolve({ data: [] }),
      can("payments") ? supa.from("payments").select("id, payment_no, payment_date, amount, mode").eq("contact_id", id).eq("direction", "in").order("payment_date", { ascending: false }) : Promise.resolve({ data: [] }),
    ]);
    return { leads: (leads.data ?? []) as Lead[], bookings: bookings.data ?? [], invoices: invoices.data ?? [], payments: payments.data ?? [] };
  }, [id]);

  if (c.loading && !c.data) return <Spinner />;
  if (!c.data) return <p className="text-sm text-slate-500">Customer not found.</p>;
  const ct = c.data;
  const bookings = rel.data?.bookings ?? [];
  const lifetime = bookings.filter((b: any) => b.status !== "cancelled").reduce((a: number, b: any) => a + Number(b.sell_amount), 0);
  const due = bookings.filter((b: any) => b.status !== "cancelled").reduce((a: number, b: any) => a + Math.max(0, Number(b.balance_due)), 0);

  return (
    <>
      <Link href="/contacts" className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800"><ArrowLeft className="h-4 w-4" /> Contacts</Link>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold">{ct.name}</h1>
            <Badge>{ct.customer_type}</Badge>
            <Badge className={ct.segment === "VIP" ? "bg-amber-100 text-amber-700" : ""}>{ct.segment}</Badge>
          </div>
          <p className="text-sm text-slate-500">{[ct.phone, ct.email, ct.city].filter(Boolean).join(" · ")}</p>
          <div className="mt-1 flex flex-wrap gap-1">{ct.tags.map((t) => <Badge key={t} className="bg-brand-50 text-brand-700">{t}</Badge>)}</div>
        </div>
        <div className="flex flex-wrap gap-2">
          {ct.phone && <a href={`tel:${ct.phone}`}><Button variant="secondary"><Phone className="h-4 w-4" /> Call</Button></a>}
          {ct.phone && <Button variant="secondary" onClick={() => setCompose({ channel: "whatsapp", name: ct.name, phone: ct.phone })}><MessageCircle className="h-4 w-4 text-emerald-600" /> WhatsApp</Button>}
          {ct.email && <Button variant="secondary" onClick={() => setCompose({ channel: "email", name: ct.name, email: ct.email })}><Mail className="h-4 w-4" /> Email</Button>}
          {can("contacts", "edit") && <Button variant="secondary" onClick={() => setEdit(true)}><Pencil className="h-4 w-4" /> Edit</Button>}
          {can("leads", "create") && <Button variant="secondary" onClick={() => setNewLead(true)}><Plus className="h-4 w-4" /> New enquiry</Button>}
          {can("itineraries", "create") && <Button onClick={() => router.push(`/compose?contact=${ct.id}`)}><Map className="h-4 w-4" /> Compose package</Button>}
        </div>
      </div>

      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Trips" value={bookings.filter((b: any) => b.status !== "cancelled").length} />
        <Stat label="Lifetime value" value={inr(lifetime)} tone="emerald" />
        <Stat label="Balance due" value={inr(due)} tone={due > 0 ? "rose" : "brand"} />
        <Stat label="Enquiries" value={rel.data?.leads.length ?? 0} tone="sky" />
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card title="Travel history" bodyClass="p-0">
            {bookings.length === 0 ? <p className="p-4 text-sm text-slate-400">No trips yet.</p> : (
              <Table>
                <thead><tr><Th>Booking</Th><Th>Dates</Th><Th>Status</Th><Th className="text-right">Amount</Th><Th className="text-right">Due</Th></tr></thead>
                <tbody>
                  {bookings.map((b: any) => (
                    <tr key={b.id}>
                      <Td><Link href={`/bookings/${b.id}`} className="font-medium hover:text-brand-700">{b.title}</Link><div className="text-xs text-slate-500">{b.booking_no} · {b.destination}</div></Td>
                      <Td className="text-xs">{fmtDate(b.start_date)} – {fmtDate(b.end_date)}</Td>
                      <Td><Badge className={statusMeta(BOOKING_STATUSES, b.status)?.color}>{statusMeta(BOOKING_STATUSES, b.status)?.label}</Badge></Td>
                      <Td className="text-right">{inr(b.sell_amount)}</Td>
                      <Td className="text-right">{Number(b.balance_due) > 0 ? <span className="text-rose-600">{inr(b.balance_due)}</span> : "—"}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>
          <Card title="Enquiries" bodyClass="p-0">
            {(rel.data?.leads ?? []).length === 0 ? <p className="p-4 text-sm text-slate-400">No enquiries.</p> : (
              <Table>
                <thead><tr><Th>Lead</Th><Th>Destination</Th><Th>Source</Th><Th>Status</Th><Th>Date</Th></tr></thead>
                <tbody>
                  {(rel.data?.leads ?? []).map((l) => (
                    <tr key={l.id}>
                      <Td><Link href={`/leads/${l.id}`} className="font-medium hover:text-brand-700">{l.lead_no}</Link></Td>
                      <Td>{l.destination ?? "—"}</Td><Td>{l.source}</Td>
                      <Td><Badge className={statusMeta(LEAD_STATUSES, l.status)?.color}>{statusMeta(LEAD_STATUSES, l.status)?.label}</Badge></Td>
                      <Td className="text-xs">{fmtDate(l.created_at)}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>
          {can("invoices") && (
            <Card title="Invoices & payments" bodyClass="p-0">
              <Table>
                <thead><tr><Th>Invoice</Th><Th>Date</Th><Th>Status</Th><Th className="text-right">Total</Th><Th className="text-right">Paid</Th></tr></thead>
                <tbody>
                  {(rel.data?.invoices ?? []).map((i: any) => (
                    <tr key={i.id}>
                      <Td><Link href={`/invoices/${i.id}`} className="font-medium hover:text-brand-700">{i.invoice_no}</Link></Td>
                      <Td className="text-xs">{fmtDate(i.invoice_date)}</Td>
                      <Td><Badge className={statusMeta(INVOICE_STATUSES, i.status)?.color}>{statusMeta(INVOICE_STATUSES, i.status)?.label}</Badge></Td>
                      <Td className="text-right">{inr(i.total)}</Td><Td className="text-right">{inr(i.amount_paid)}</Td>
                    </tr>
                  ))}
                  {(rel.data?.payments ?? []).map((p: any) => (
                    <tr key={p.id} className="bg-emerald-50/40">
                      <Td className="text-xs">Receipt {p.payment_no}</Td><Td className="text-xs">{fmtDate(p.payment_date)}</Td><Td className="text-xs">{p.mode}</Td>
                      <Td /><Td className="text-right text-emerald-700">{inr(p.amount)}</Td>
                    </tr>
                  ))}
                  {!(rel.data?.invoices ?? []).length && !(rel.data?.payments ?? []).length && <tr><Td colSpan={5} className="text-slate-400">Nothing yet.</Td></tr>}
                </tbody>
              </Table>
            </Card>
          )}
        </div>
        <div className="space-y-5">
          <Card title="Profile">
            <dl className="space-y-2 text-sm">
              {[
                ["Address", [ct.address, ct.city, ct.state].filter(Boolean).join(", ")],
                ["Alt phone", ct.alt_phone], ["Birthday", ct.dob && fmtDate(ct.dob)], ["Anniversary", ct.anniversary && fmtDate(ct.anniversary)],
                ["Passport", ct.passport_no && `${ct.passport_no}${ct.passport_expiry ? ` (exp ${fmtDate(ct.passport_expiry)})` : ""}`],
                ["Company", ct.company_name], ["GSTIN", ct.gstin],
              ].filter(([, v]) => v).map(([k, v]) => (
                <div key={k as string} className="flex justify-between gap-3"><dt className="text-slate-500">{k}</dt><dd className="text-right font-medium">{v}</dd></div>
              ))}
            </dl>
          </Card>
          <Card title="Preferences">
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between"><dt className="text-slate-500">Hotel</dt><dd className="font-medium">{ct.pref_hotel_category ?? "—"}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-500">Meal</dt><dd className="font-medium">{ct.pref_meal ?? "—"}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-500">Budget</dt><dd className="font-medium">{ct.pref_budget ?? "—"}</dd></div>
            </dl>
            {ct.pref_notes && <p className="mt-2 rounded bg-slate-50 p-2 text-xs text-slate-600">{ct.pref_notes}</p>}
            {ct.notes && <p className="mt-2 whitespace-pre-wrap rounded bg-amber-50 p-2 text-xs text-amber-800">{ct.notes}</p>}
          </Card>
          <DocumentsCard contactId={ct.id} />
          {can("contacts", "delete") && (
            <ConfirmButton className="w-full text-rose-600" label="Delete customer & documents?" onConfirm={async () => {
              const { error } = await sb().from("contacts").delete().eq("id", ct.id);
              if (error) { toast.error(error.message); return; }
              router.replace("/contacts");
            }}><Trash2 className="h-4 w-4" /> Delete customer</ConfirmButton>
          )}
        </div>
      </div>

      <ContactForm open={edit} onClose={() => setEdit(false)} contact={ct} onSaved={() => c.reload()} />
      <LeadForm open={newLead} onClose={() => setNewLead(false)} contactId={ct.id} onSaved={(l) => router.push(`/leads/${l.id}`)} />
      <MessageComposer target={compose} onClose={() => setCompose(null)} />
    </>
  );
}

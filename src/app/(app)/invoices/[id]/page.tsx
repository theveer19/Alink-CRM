"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, ArrowDownLeft, Eye, FileDown, Link2, Mail, MessageCircle, Plus, Save, Trash2, Ban } from "lucide-react";
import { sb } from "@/lib/supabase/client";
import { INVOICE_STATUSES, statusMeta } from "@/lib/constants";
import type { Invoice, InvoiceItem } from "@/lib/types";
import { invoiceTotals } from "@/lib/pricing";
import { appUrl, cn, fmtDate, inr } from "@/lib/utils";
import { Guard, useAuth } from "@/components/auth";
import { PaymentForm } from "@/components/payment-form";
import { MessageComposer, type ComposeTarget } from "@/components/message-composer";
import { Badge, Button, Card, ConfirmButton, Field, Input, Select, Spinner, Table, Td, Textarea, Th } from "@/components/ui";

export default function InvoicePage() {
  return <Guard module="invoices"><Editor /></Guard>;
}

function Editor() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { can, settings } = useAuth();
  const [inv, setInv] = useState<Invoice | null>(null);
  const [items, setItems] = useState<InvoiceItem[]>([]);
  const [pays, setPays] = useState<any[]>([]);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [compose, setCompose] = useState<ComposeTarget | null>(null);
  const editable = can("invoices", "edit") || (can("invoices", "create") && inv?.status === "draft");

  async function load() {
    const supa = sb();
    const [i, it, p] = await Promise.all([
      supa.from("invoices").select("*").eq("id", id).single(),
      supa.from("invoice_items").select("*").eq("invoice_id", id).order("sort"),
      supa.from("payments").select("*").eq("invoice_id", id).order("payment_date"),
    ]);
    if (i.error) return toast.error(i.error.message);
    setInv(i.data as Invoice);
    setItems((it.data ?? []) as InvoiceItem[]);
    setPays(p.data ?? []);
    setDirty(false);
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [id]);

  const t = useMemo(() => (inv ? invoiceTotals(items, inv) : null), [inv, items]);
  if (!inv || !t) return <Spinner />;

  const set = <K extends keyof Invoice>(k: K, v: Invoice[K]) => { setInv({ ...inv, [k]: v }); setDirty(true); };
  const setItem = (i: number, p: Partial<InvoiceItem>) => { setItems(items.map((x, j) => (j === i ? { ...x, ...p } : x))); setDirty(true); };

  async function save(status?: string) {
    setSaving(true);
    const supa = sb();
    const tt = invoiceTotals(items, inv!);
    const { error } = await supa.from("invoices").update({
      bill_to_name: inv!.bill_to_name, bill_to_address: inv!.bill_to_address, bill_to_gstin: inv!.bill_to_gstin, bill_to_phone: inv!.bill_to_phone,
      bill_to_email: inv!.bill_to_email, place_of_supply: inv!.place_of_supply, invoice_date: inv!.invoice_date, due_date: inv!.due_date || null,
      tax_type: inv!.tax_type, gst_percent: inv!.gst_percent, gst_mode: inv!.gst_mode, service_charge: inv!.service_charge, tcs_percent: inv!.tcs_percent,
      discount: inv!.discount, notes: inv!.notes, terms: inv!.terms, status: status ?? inv!.status,
      subtotal: tt.subtotal, taxable_value: tt.taxable_value, cgst: tt.cgst, sgst: tt.sgst, igst: tt.igst, tcs: tt.tcs, total: tt.total,
    }).eq("id", inv!.id);
    if (error) { setSaving(false); toast.error(error.message); return false; }
    await supa.from("invoice_items").delete().eq("invoice_id", inv!.id);
    if (items.length) {
      const r = await supa.from("invoice_items").insert(items.map((x, i) => ({ invoice_id: inv!.id, description: x.description, sac: x.sac, qty: x.qty, rate: x.rate, amount: tt.amounts[i], sort: i })));
      if (r.error) { setSaving(false); toast.error(r.error.message); return false; }
    }
    setSaving(false);
    toast.success(status === "unpaid" ? "Invoice issued" : "Saved");
    await load();
    return true;
  }

  const link = `${appUrl()}/share/invoice/${inv.share_token}`;
  const balance = Math.max(0, Number(inv.total) - Number(inv.amount_paid));

  return (
    <>
      <Link href={inv.booking_id ? `/bookings/${inv.booking_id}` : "/invoices"} className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
        <ArrowLeft className="h-4 w-4" /> {inv.booking_id ? "Back to booking" : "Invoices"}
      </Link>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold">Invoice {inv.invoice_no}</h1>
            <Badge className={statusMeta(INVOICE_STATUSES, inv.status)?.color}>{statusMeta(INVOICE_STATUSES, inv.status)?.label}</Badge>
          </div>
          <p className="text-sm text-slate-500">{inv.bill_to_name} · {fmtDate(inv.invoice_date)}{dirty && <span className="ml-2 text-amber-600">● unsaved</span>}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {editable && <Button variant={dirty ? "primary" : "secondary"} loading={saving} onClick={() => save()}><Save className="h-4 w-4" /> Save</Button>}
          {editable && inv.status === "draft" && <Button variant="success" loading={saving} onClick={() => save("unpaid")}>Issue invoice</Button>}
          <Button variant="secondary" onClick={async () => { if (dirty) await save(); window.open(`/share/invoice/${inv.share_token}`, "_blank"); }}><Eye className="h-4 w-4" /> Preview</Button>
          <Button variant="secondary" onClick={async () => { if (dirty) await save(); window.open(`/share/invoice/${inv.share_token}?print=1`, "_blank"); }}><FileDown className="h-4 w-4" /> PDF</Button>
          <Button variant="secondary" onClick={async () => { await navigator.clipboard.writeText(link); toast.success("Invoice link copied"); }}><Link2 className="h-4 w-4" /> Link</Button>
          {inv.bill_to_phone && <Button variant="secondary" onClick={() => setCompose({ channel: "whatsapp", name: inv.bill_to_name, phone: inv.bill_to_phone, body: `Dear ${inv.bill_to_name},\nPlease find invoice ${inv.invoice_no} for ${inr(inv.total)}${balance > 0 ? ` (balance ${inr(balance)})` : ""}.\n${link}\n\nThank you,\n${settings.company_name}` })}><MessageCircle className="h-4 w-4 text-emerald-600" /> WhatsApp</Button>}
          {inv.bill_to_email && <Button variant="secondary" onClick={() => setCompose({ channel: "email", name: inv.bill_to_name, email: inv.bill_to_email, subject: `Invoice ${inv.invoice_no} – ${settings.company_name}`, body: `Dear ${inv.bill_to_name},\n\nPlease find your invoice ${inv.invoice_no} for ${inr(inv.total)} here:\n${link}\n\nRegards,\n${settings.company_name}` })}><Mail className="h-4 w-4" /> Email</Button>}
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-3">
        <div className="space-y-5 xl:col-span-2">
          <Card title="Bill to">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Field label="Name / company" required><Input value={inv.bill_to_name} onChange={(e) => set("bill_to_name", e.target.value)} disabled={!editable} /></Field>
              <Field label="Phone"><Input value={inv.bill_to_phone ?? ""} onChange={(e) => set("bill_to_phone", e.target.value)} disabled={!editable} /></Field>
              <Field label="Email"><Input value={inv.bill_to_email ?? ""} onChange={(e) => set("bill_to_email", e.target.value)} disabled={!editable} /></Field>
              <Field label="Address" className="col-span-2"><Input value={inv.bill_to_address ?? ""} onChange={(e) => set("bill_to_address", e.target.value)} disabled={!editable} /></Field>
              <Field label="Customer GSTIN"><Input value={inv.bill_to_gstin ?? ""} onChange={(e) => set("bill_to_gstin", e.target.value.toUpperCase())} disabled={!editable} /></Field>
              <Field label="Invoice date"><Input type="date" value={inv.invoice_date} onChange={(e) => set("invoice_date", e.target.value)} disabled={!editable} /></Field>
              <Field label="Due date"><Input type="date" value={inv.due_date ?? ""} onChange={(e) => set("due_date", e.target.value || null)} disabled={!editable} /></Field>
              <Field label="Place of supply (state)"><Input value={inv.place_of_supply ?? ""} onChange={(e) => {
                const pos = e.target.value;
                const inter = pos && settings.state && pos.trim().toLowerCase() !== settings.state.trim().toLowerCase();
                setInv({ ...inv, place_of_supply: pos, tax_type: inv.tax_type === "none" ? "none" : inter ? "igst" : "cgst_sgst" }); setDirty(true);
              }} disabled={!editable} /></Field>
            </div>
          </Card>

          <Card title="Items" bodyClass="p-0" action={editable && <Button size="sm" variant="secondary" onClick={() => { setItems([...items, { description: "", sac: settings.sac_code, qty: 1, rate: 0, amount: 0, sort: items.length }]); setDirty(true); }}><Plus className="h-3.5 w-3.5" /> Line</Button>}>
            <Table>
              <thead><tr><Th>Description</Th><Th className="w-24">SAC</Th><Th className="w-20">Qty</Th><Th className="w-32">Rate ₹</Th><Th className="w-32 text-right">Amount</Th><Th className="w-8" /></tr></thead>
              <tbody>
                {items.map((x, i) => (
                  <tr key={i}>
                    <Td><Input value={x.description} onChange={(e) => setItem(i, { description: e.target.value })} disabled={!editable} /></Td>
                    <Td><Input value={x.sac ?? ""} onChange={(e) => setItem(i, { sac: e.target.value })} disabled={!editable} /></Td>
                    <Td><Input type="number" value={x.qty} onChange={(e) => setItem(i, { qty: Number(e.target.value) })} disabled={!editable} /></Td>
                    <Td><Input type="number" step="0.01" value={x.rate} onChange={(e) => setItem(i, { rate: Number(e.target.value) })} disabled={!editable} /></Td>
                    <Td className="text-right font-medium">{inr(t.amounts[i], 2)}</Td>
                    <Td>{editable && <button onClick={() => { setItems(items.filter((_, j) => j !== i)); setDirty(true); }} className="p-1 text-slate-400 hover:text-rose-600"><Trash2 className="h-4 w-4" /></button>}</Td>
                  </tr>
                ))}
                {items.length === 0 && <tr><Td colSpan={6} className="text-slate-400">Add at least one line.</Td></tr>}
              </tbody>
            </Table>
          </Card>

          <Card title="Notes & terms">
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Notes (shown on invoice)"><Textarea rows={4} value={inv.notes ?? ""} onChange={(e) => set("notes", e.target.value)} disabled={!editable} /></Field>
              <Field label="Terms"><Textarea rows={4} value={inv.terms ?? ""} onChange={(e) => set("terms", e.target.value)} disabled={!editable} /></Field>
            </div>
          </Card>
        </div>

        <div className="space-y-5">
          <Card title="Tax & total">
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-2">
                <Field label="Tax type">
                  <Select value={inv.tax_type} onChange={(e) => set("tax_type", e.target.value as Invoice["tax_type"])} disabled={!editable}>
                    <option value="cgst_sgst">CGST + SGST</option><option value="igst">IGST (other state)</option><option value="none">No GST</option>
                  </Select>
                </Field>
                <Field label="GST %">
                  <Select value={inv.gst_percent} onChange={(e) => set("gst_percent", Number(e.target.value))} disabled={!editable}>
                    {[0, 5, 12, 18].map((g) => <option key={g} value={g}>{g}%</option>)}
                  </Select>
                </Field>
              </div>
              <Field label="GST charged on" hint={inv.gst_mode === "markup" ? "Items = pure-agent reimbursement (no GST). GST only on service charge." : "GST on full taxable value (e.g. 5% tour operator)"}>
                <Select value={inv.gst_mode} onChange={(e) => set("gst_mode", e.target.value as Invoice["gst_mode"])} disabled={!editable}>
                  <option value="total">Whole invoice</option><option value="markup">Service charge only</option>
                </Select>
              </Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Service charge ₹"><Input type="number" value={inv.service_charge} onChange={(e) => set("service_charge", Number(e.target.value))} disabled={!editable} /></Field>
                <Field label="Discount ₹"><Input type="number" value={inv.discount} onChange={(e) => set("discount", Number(e.target.value))} disabled={!editable} /></Field>
              </div>
              <Field label="TCS %"><Select value={inv.tcs_percent} onChange={(e) => set("tcs_percent", Number(e.target.value))} disabled={!editable}>{[0, 2, 5, 20].map((g) => <option key={g} value={g}>{g}%</option>)}</Select></Field>
              <div className="space-y-1.5 rounded-lg bg-slate-50 p-3">
                <L k="Subtotal" v={inr(t.subtotal, 2)} />
                {t.discount > 0 && <L k="Discount" v={`− ${inr(t.discount, 2)}`} />}
                {Number(inv.service_charge) > 0 && <L k="Service charge" v={inr(inv.service_charge, 2)} />}
                <L k="Taxable value" v={inr(t.taxable_value, 2)} />
                {inv.tax_type === "cgst_sgst" && <><L k={`CGST ${inv.gst_percent / 2}%`} v={inr(t.cgst, 2)} /><L k={`SGST ${inv.gst_percent / 2}%`} v={inr(t.sgst, 2)} /></>}
                {inv.tax_type === "igst" && <L k={`IGST ${inv.gst_percent}%`} v={inr(t.igst, 2)} />}
                {t.tcs > 0 && <L k={`TCS ${inv.tcs_percent}%`} v={inr(t.tcs, 2)} />}
                <div className="border-t border-slate-200 pt-1.5"><L k="Total" v={inr(t.total, 2)} strong /></div>
              </div>
            </div>
          </Card>

          <Card title="Payments" action={can("payments", "create") && inv.status !== "cancelled" && <Button size="sm" onClick={() => setPayOpen(true)}><ArrowDownLeft className="h-3.5 w-3.5" /> Receive</Button>}>
            <div className="space-y-1.5 text-sm">
              {pays.map((p) => <L key={p.id} k={`${fmtDate(p.payment_date)} · ${p.mode}`} v={inr(p.amount, 2)} />)}
              {!pays.length && <p className="text-slate-400">No payment yet.</p>}
              <div className="border-t border-slate-100 pt-1.5"><L k="Balance due" v={inr(balance, 2)} strong /></div>
              {settings.upi_id && balance > 0 && <p className="text-xs text-slate-500">Customer can pay by UPI QR on the shared invoice page.</p>}
            </div>
          </Card>

          <Card title="Status">
            <div className="space-y-2">
              <p className="text-xs text-slate-500">Paid / partly paid is set automatically from payments.</p>
              {can("invoices", "edit") && inv.status !== "cancelled" && (
                <ConfirmButton className="w-full" label="Cancel invoice? (number is kept)" onConfirm={async () => { await save("cancelled"); }}><Ban className="h-4 w-4" /> Cancel invoice</ConfirmButton>
              )}
              {can("invoices", "edit") && inv.status === "cancelled" && <Button variant="secondary" className="w-full" onClick={() => save("unpaid")}>Restore invoice</Button>}
              {can("invoices", "delete") && (inv.status === "draft" || inv.status === "cancelled") && !pays.length && (
                <ConfirmButton className={cn("w-full text-rose-600")} label="Delete permanently?" onConfirm={async () => {
                  const { error } = await sb().from("invoices").delete().eq("id", inv.id);
                  if (error) { toast.error(error.message); return; }
                  router.replace("/invoices");
                }}><Trash2 className="h-4 w-4" /> Delete</ConfirmButton>
              )}
              {inv.status !== "draft" && <p className="text-[11px] text-slate-400">Issued invoices should be cancelled, not deleted, to keep GST numbering continuous.</p>}
            </div>
          </Card>
        </div>
      </div>

      <PaymentForm open={payOpen} onClose={() => setPayOpen(false)} onSaved={load} direction="in" invoiceId={inv.id} bookingId={inv.booking_id} contactId={inv.contact_id} amount={balance} />
      <MessageComposer target={compose} onClose={() => setCompose(null)} />
    </>
  );
}

function L({ k, v, strong }: { k: string; v: string; strong?: boolean }) {
  return <div className={cn("flex justify-between", strong && "font-semibold text-slate-900")}><span className="text-slate-600">{k}</span><span>{v}</span></div>;
}

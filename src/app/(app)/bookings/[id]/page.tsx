"use client";
import { useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, FileText, MessageCircle, Pencil, Plus, Ticket, Trash2, Wallet, ArrowUpRight, ArrowDownLeft, Eye } from "lucide-react";
import { sb } from "@/lib/supabase/client";
import { BOOKING_STATUSES, INVOICE_STATUSES, SERVICE_TYPES, statusMeta } from "@/lib/constants";
import type { Booking, BookingService, Hotel, Supplier } from "@/lib/types";
import { appUrl, cn, fmtDate, inr } from "@/lib/utils";
import { useLoad } from "@/lib/hooks";
import { createInvoiceForBooking, createVoucher } from "@/lib/actions";
import { Guard, useAuth } from "@/components/auth";
import { BookingForm } from "@/components/booking-form";
import { ServiceForm } from "@/components/service-form";
import { PaymentForm } from "@/components/payment-form";
import { DocumentsCard } from "@/components/documents-card";
import { MessageComposer, type ComposeTarget } from "@/components/message-composer";
import { Badge, Button, Card, ConfirmButton, Modal, Select, Spinner, Stat, Table, Td, Th } from "@/components/ui";

export default function BookingPage() {
  return <Guard module="bookings"><BookingDetail /></Guard>;
}

function BookingDetail() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { can, settings } = useAuth();
  const [edit, setEdit] = useState(false);
  const [svc, setSvc] = useState<{ s: BookingService | null } | null>(null);
  const [pay, setPay] = useState<{ dir: "in" | "out"; supplierId?: string | null; amount?: number } | null>(null);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [invChoice, setInvChoice] = useState(false);
  const [compose, setCompose] = useState<ComposeTarget | null>(null);
  const [busy, setBusy] = useState(false);

  const b = useLoad(async () => {
    const { data, error } = await sb().from("booking_summary").select("*").eq("id", id).single();
    if (error) throw error;
    return data as Booking;
  }, [id]);

  const rel = useLoad(async () => {
    const supa = sb();
    const [svcs, pays, invs, vchs, sups, hot] = await Promise.all([
      supa.from("booking_services").select("*, suppliers(name, phone)").eq("booking_id", id).order("start_date", { nullsFirst: false }).order("sort"),
      can("payments") ? supa.from("payments").select("*, suppliers(name)").eq("booking_id", id).order("payment_date") : Promise.resolve({ data: [] }),
      can("invoices") ? supa.from("invoices").select("id, invoice_no, invoice_date, total, amount_paid, status, share_token").eq("booking_id", id).order("created_at") : Promise.resolve({ data: [] }),
      can("vouchers") ? supa.from("vouchers").select("id, voucher_no, voucher_type, created_at, share_token").eq("booking_id", id).order("created_at") : Promise.resolve({ data: [] }),
      supa.from("suppliers").select("*").eq("is_active", true).order("name"),
      supa.from("hotels").select("*").order("name"),
    ]);
    return { svcs: (svcs.data ?? []) as BookingService[], pays: pays.data ?? [], invs: invs.data ?? [], vchs: vchs.data ?? [], sups: (sups.data ?? []) as Supplier[], hotels: (hot.data ?? []) as Hotel[] };
  }, [id]);

  const reload = () => { b.reload(); rel.reload(); };

  if (b.loading && !b.data) return <Spinner />;
  if (!b.data) return <p className="text-sm text-slate-500">Booking not found.</p>;
  const bk = b.data;
  const svcs = rel.data?.svcs ?? [];
  const payIn = (rel.data?.pays ?? []).filter((p: any) => p.direction === "in");
  const payOut = (rel.data?.pays ?? []).filter((p: any) => p.direction === "out");

  // supplier payables
  const bySupplier: Record<string, { name: string; cost: number; paid: number }> = {};
  svcs.filter((s) => s.status !== "cancelled" && s.supplier_id).forEach((s) => {
    const k = s.supplier_id!;
    bySupplier[k] ??= { name: s.suppliers?.name ?? "Supplier", cost: 0, paid: 0 };
    bySupplier[k].cost += Number(s.cost);
  });
  payOut.forEach((p: any) => { if (p.supplier_id) { bySupplier[p.supplier_id] ??= { name: p.suppliers?.name ?? "Supplier", cost: 0, paid: 0 }; bySupplier[p.supplier_id].paid += Number(p.amount); } });

  async function setStatus(status: string) {
    const { error } = await sb().from("bookings").update({ status }).eq("id", bk.id);
    if (error) return toast.error(error.message);
    reload();
  }

  async function makeInvoice(itemized: boolean) {
    setBusy(true);
    try {
      const invId = await createInvoiceForBooking(bk, settings, itemized);
      router.push(`/invoices/${invId}`);
    } catch (e: any) { toast.error(e.message); setBusy(false); }
  }

  async function makeVoucher(ids: string[], combined: boolean) {
    setBusy(true);
    try {
      const v = await createVoucher(bk.id, ids, combined, settings.voucher_notes ?? undefined);
      toast.success("Voucher issued");
      window.open(`/share/voucher/${v.share_token}`, "_blank");
      setSel(new Set());
      rel.reload();
    } catch (e: any) { toast.error(e.message); }
    setBusy(false);
  }

  const payLink = rel.data?.invs?.[0] ? `${appUrl()}/share/invoice/${(rel.data.invs[0] as any).share_token}` : "";

  return (
    <>
      <Link href="/bookings" className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800"><ArrowLeft className="h-4 w-4" /> Bookings</Link>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold">{bk.title}</h1>
            <Badge className={statusMeta(BOOKING_STATUSES, bk.status)?.color}>{statusMeta(BOOKING_STATUSES, bk.status)?.label}</Badge>
          </div>
          <p className="text-sm text-slate-500">
            {bk.booking_no} · {fmtDate(bk.start_date)} → {fmtDate(bk.end_date)} · {bk.adults} Adults{bk.children ? `, ${bk.children} Children` : ""}
            {bk.contact_id && <> · <Link href={`/contacts/${bk.contact_id}`} className="text-brand-700 hover:underline">{bk.contact_name}</Link></>}
            {bk.itinerary_id && <> · <Link href={`/itineraries/${bk.itinerary_id}`} className="text-brand-700 hover:underline">quote</Link></>}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {can("bookings", "edit") && (
            <Select value={bk.status} onChange={(e) => setStatus(e.target.value)} className="w-36">
              {BOOKING_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </Select>
          )}
          {bk.contact_phone && Number(bk.balance_due) > 0 && (
            <Button variant="secondary" onClick={() => setCompose({ channel: "whatsapp", name: bk.contact_name ?? "", phone: bk.contact_phone, leadId: bk.lead_id, vars: { amount: Number(bk.balance_due).toLocaleString("en-IN"), booking: bk.booking_no, link: payLink, destination: bk.destination } })}>
              <MessageCircle className="h-4 w-4 text-emerald-600" /> Payment reminder
            </Button>
          )}
          {can("bookings", "edit") && <Button variant="secondary" onClick={() => setEdit(true)}><Pencil className="h-4 w-4" /> Edit</Button>}
          {can("invoices", "create") && <Button loading={busy} onClick={() => setInvChoice(true)}><FileText className="h-4 w-4" /> Create invoice</Button>}
        </div>
      </div>

      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Stat label="Package price" value={inr(bk.sell_amount)} />
        <Stat label="Supplier cost" value={inr(bk.cost_amount)} tone="amber" />
        <Stat label="Profit" value={inr(bk.profit)} tone={Number(bk.profit) < 0 ? "rose" : "emerald"} sub={Number(bk.sell_amount) ? `${Math.round((Number(bk.profit) / Number(bk.sell_amount)) * 100)}% margin` : undefined} />
        <Stat label="Received" value={inr(bk.received)} tone="sky" />
        <Stat label="Customer due" value={inr(Math.max(0, Number(bk.balance_due)))} tone={Number(bk.balance_due) > 0 ? "rose" : "brand"} />
        <Stat label="Paid to suppliers" value={inr(bk.paid_to_suppliers)} tone="violet" />
      </div>

      <div className="grid gap-5 xl:grid-cols-3">
        <div className="space-y-5 xl:col-span-2">
          <Card title="Services (hotel, flight, cab, tours)" bodyClass="p-0" action={
            <div className="flex gap-2">
              {can("vouchers", "create") && sel.size > 0 && <Button size="sm" variant="secondary" loading={busy} onClick={() => makeVoucher([...sel], sel.size > 1)}><Ticket className="h-3.5 w-3.5" /> Voucher for {sel.size}</Button>}
              {can("vouchers", "create") && svcs.length > 0 && <Button size="sm" variant="secondary" loading={busy} onClick={() => makeVoucher(svcs.filter((s) => s.status !== "cancelled").map((s) => s.id), true)}><Ticket className="h-3.5 w-3.5" /> Combined voucher</Button>}
              {can("bookings", "edit") && <Button size="sm" onClick={() => setSvc({ s: null })}><Plus className="h-3.5 w-3.5" /> Add</Button>}
            </div>
          }>
            {svcs.length === 0 ? <p className="p-4 text-sm text-slate-400">No services yet.</p> : (
              <Table>
                <thead><tr><Th className="w-8" /><Th>Service</Th><Th>Date</Th><Th>Supplier / conf.</Th><Th>Status</Th><Th className="text-right">Cost</Th><Th className="text-right">Sell</Th><Th /></tr></thead>
                <tbody>
                  {svcs.map((s) => (
                    <tr key={s.id} className={cn(s.status === "cancelled" && "opacity-50")}>
                      <Td><input type="checkbox" checked={sel.has(s.id)} onChange={() => { const n = new Set(sel); n.has(s.id) ? n.delete(s.id) : n.add(s.id); setSel(n); }} /></Td>
                      <Td>
                        <p className="font-medium">{s.title}</p>
                        <p className="text-xs text-slate-500">{statusMeta(SERVICE_TYPES, s.service_type)?.label}
                          {s.details?.room_type ? ` · ${s.details.room_type}` : ""}{s.details?.meal_plan ? ` · ${s.details.meal_plan}` : ""}
                          {s.details?.number ? ` · ${s.details.carrier ?? ""} ${s.details.number}` : ""}{s.details?.pnr ? ` · PNR ${s.details.pnr}` : ""}
                          {s.details?.driver_name ? ` · ${s.details.driver_name} ${s.details.driver_phone ?? ""}` : ""}
                        </p>
                      </Td>
                      <Td className="text-xs">{fmtDate(s.start_date)}{s.end_date && s.end_date !== s.start_date ? ` → ${fmtDate(s.end_date)}` : ""}</Td>
                      <Td className="text-xs">{s.suppliers?.name ?? "—"}{s.confirmation_no && <div className="text-slate-500">#{s.confirmation_no}</div>}</Td>
                      <Td>
                        <Badge className={s.status === "confirmed" ? "bg-emerald-100 text-emerald-700" : s.status === "cancelled" ? "bg-slate-200" : "bg-amber-100 text-amber-700"}>{s.status}</Badge>
                      </Td>
                      <Td className="text-right">{inr(s.cost)}</Td>
                      <Td className="text-right">{inr(s.sell)}</Td>
                      <Td>
                        <div className="flex gap-0.5">
                          {can("vouchers", "create") && s.status !== "cancelled" && <button title="Voucher" onClick={() => makeVoucher([s.id], false)} className="rounded p-1 text-slate-400 hover:bg-slate-100"><Ticket className="h-3.5 w-3.5" /></button>}
                          {can("bookings", "edit") && <button title="Edit" onClick={() => setSvc({ s })} className="rounded p-1 text-slate-400 hover:bg-slate-100"><Pencil className="h-3.5 w-3.5" /></button>}
                          {can("bookings", "edit") && <ConfirmButton size="icon" label="?" onConfirm={async () => { const { error } = await sb().from("booking_services").delete().eq("id", s.id); if (error) toast.error(error.message); else reload(); }}><Trash2 className="h-3.5 w-3.5" /></ConfirmButton>}
                        </div>
                      </Td>
                    </tr>
                  ))}
                  <tr className="bg-slate-50 font-medium">
                    <Td colSpan={5}>Total (excl. cancelled)</Td>
                    <Td className="text-right">{inr(svcs.filter((s) => s.status !== "cancelled").reduce((a, s) => a + Number(s.cost), 0))}</Td>
                    <Td className="text-right">{inr(svcs.filter((s) => s.status !== "cancelled").reduce((a, s) => a + Number(s.sell), 0))}</Td>
                    <Td />
                  </tr>
                </tbody>
              </Table>
            )}
          </Card>

          {can("payments") && (
            <Card title="Payments" bodyClass="p-0" action={
              <div className="flex gap-2">
                {can("payments", "create") && <Button size="sm" variant="secondary" onClick={() => setPay({ dir: "out" })}><ArrowUpRight className="h-3.5 w-3.5 text-rose-600" /> Pay supplier</Button>}
                {can("payments", "create") && <Button size="sm" onClick={() => setPay({ dir: "in", amount: Math.max(0, Number(bk.balance_due)) })}><ArrowDownLeft className="h-3.5 w-3.5" /> Receive</Button>}
              </div>
            }>
              <Table>
                <thead><tr><Th>No.</Th><Th>Date</Th><Th>Type</Th><Th>Mode / ref</Th><Th className="text-right">Amount</Th></tr></thead>
                <tbody>
                  {[...payIn, ...payOut].sort((a: any, c: any) => a.payment_date.localeCompare(c.payment_date)).map((p: any) => (
                    <tr key={p.id}>
                      <Td className="text-xs">{p.payment_no}</Td>
                      <Td className="text-xs">{fmtDate(p.payment_date)}</Td>
                      <Td>{p.direction === "in" ? <Badge className="bg-emerald-100 text-emerald-700">Received</Badge> : <Badge className="bg-rose-100 text-rose-700">Paid · {p.suppliers?.name ?? "supplier"}</Badge>}</Td>
                      <Td className="text-xs">{p.mode}{p.reference ? ` · ${p.reference}` : ""}</Td>
                      <Td className={cn("text-right font-medium", p.direction === "in" ? "text-emerald-700" : "text-rose-600")}>{p.direction === "in" ? "+" : "−"}{inr(p.amount)}</Td>
                    </tr>
                  ))}
                  {!payIn.length && !payOut.length && <tr><Td colSpan={5} className="text-slate-400">No payments recorded.</Td></tr>}
                </tbody>
              </Table>
              {Object.keys(bySupplier).length > 0 && (
                <div className="border-t border-slate-100 p-4">
                  <p className="mb-2 text-xs font-semibold uppercase text-slate-400">Supplier payables</p>
                  <div className="space-y-1.5">
                    {Object.entries(bySupplier).map(([sid, v]) => (
                      <div key={sid} className="flex items-center justify-between text-sm">
                        <span>{v.name}</span>
                        <span className="flex items-center gap-3">
                          <span className="text-xs text-slate-500">cost {inr(v.cost)} · paid {inr(v.paid)}</span>
                          {v.cost - v.paid > 0 ? (
                            <button className="text-xs font-medium text-rose-600 hover:underline" onClick={() => setPay({ dir: "out", supplierId: sid, amount: v.cost - v.paid })}>pay {inr(v.cost - v.paid)}</button>
                          ) : <span className="text-xs text-emerald-600">settled</span>}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </Card>
          )}
        </div>

        <div className="space-y-5">
          {can("invoices") && (
            <Card title="Invoices">
              {(rel.data?.invs ?? []).length === 0 && <p className="text-sm text-slate-400">No invoice yet.</p>}
              {(rel.data?.invs ?? []).map((i: any) => (
                <Link key={i.id} href={`/invoices/${i.id}`} className="flex items-center justify-between border-b border-slate-50 py-2 text-sm last:border-0 hover:text-brand-700">
                  <span><b>{i.invoice_no}</b><span className="block text-xs text-slate-500">{fmtDate(i.invoice_date)} · {inr(i.total)}</span></span>
                  <Badge className={statusMeta(INVOICE_STATUSES, i.status)?.color}>{statusMeta(INVOICE_STATUSES, i.status)?.label}</Badge>
                </Link>
              ))}
            </Card>
          )}
          {can("vouchers") && (
            <Card title="Vouchers">
              {(rel.data?.vchs ?? []).length === 0 && <p className="text-sm text-slate-400">Tick services and issue hotel / flight / cab / tour vouchers, or one combined voucher.</p>}
              {(rel.data?.vchs ?? []).map((v: any) => (
                <div key={v.id} className="flex items-center justify-between border-b border-slate-50 py-2 text-sm last:border-0">
                  <span><b>{v.voucher_no}</b> <Badge className="ml-1 capitalize">{v.voucher_type}</Badge><span className="block text-xs text-slate-500">{fmtDate(v.created_at)}</span></span>
                  <a href={`/share/voucher/${v.share_token}`} target="_blank" rel="noreferrer" className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-brand-700"><Eye className="h-4 w-4" /></a>
                </div>
              ))}
            </Card>
          )}
          {bk.notes && <Card title="Notes"><p className="whitespace-pre-wrap text-sm text-slate-700">{bk.notes}</p></Card>}
          <DocumentsCard bookingId={bk.id} contactId={bk.contact_id} />
          {can("bookings", "delete") && (
            <ConfirmButton className="w-full text-rose-600" label="Delete booking, services & vouchers?" onConfirm={async () => {
              const { error } = await sb().from("bookings").delete().eq("id", bk.id);
              if (error) { toast.error(error.message); return; }
              router.replace("/bookings");
            }}><Trash2 className="h-4 w-4" /> Delete booking</ConfirmButton>
          )}
        </div>
      </div>

      <BookingForm open={edit} onClose={() => setEdit(false)} booking={bk} onSaved={reload} />
      {rel.data && <ServiceForm open={!!svc} onClose={() => setSvc(null)} bookingId={bk.id} service={svc?.s} onSaved={reload} suppliers={rel.data.sups} hotels={rel.data.hotels} />}
      <PaymentForm open={!!pay} onClose={() => setPay(null)} onSaved={reload} direction={pay?.dir ?? "in"} bookingId={bk.id} contactId={bk.contact_id}
        supplierId={pay?.supplierId} amount={pay?.amount} invoiceId={pay?.dir === "in" ? (rel.data?.invs?.find((i: any) => i.status !== "paid" && i.status !== "cancelled") as any)?.id : null} />
      <MessageComposer target={compose} onClose={() => setCompose(null)} />
      <Modal open={invChoice} onClose={() => setInvChoice(false)} title="Create invoice" size="sm">
        <div className="space-y-2">
          <button onClick={() => { setInvChoice(false); makeInvoice(false); }} className="w-full rounded-lg border border-slate-200 p-3 text-left hover:border-brand-400 hover:bg-brand-50">
            <p className="text-sm font-medium">Package invoice <Wallet className="ml-1 inline h-3.5 w-3.5" /></p>
            <p className="text-xs text-slate-500">One line &quot;Tour package&quot; for {inr(bk.sell_amount)} incl. GST (most common)</p>
          </button>
          <button onClick={() => { setInvChoice(false); makeInvoice(true); }} className="w-full rounded-lg border border-slate-200 p-3 text-left hover:border-brand-400 hover:bg-brand-50">
            <p className="text-sm font-medium">Itemized invoice</p>
            <p className="text-xs text-slate-500">One line per service at its sell price (GST added on top)</p>
          </button>
        </div>
      </Modal>
    </>
  );
}

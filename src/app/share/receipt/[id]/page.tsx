import { adminClient } from "@/lib/supabase/admin";
import { getSettings, isUuid } from "@/lib/share";
import { amountInWords, fmtDate, inr } from "@/lib/utils";
import { DocHeader, DocShell, NotFound } from "@/components/doc-parts";

export const dynamic = "force-dynamic";

export default async function Receipt({ params }: { params: { id: string } }) {
  if (!isUuid(params.id)) return <NotFound what="receipt" />;
  const { data: p } = await adminClient().from("payments").select("*, contacts(name, phone), bookings(booking_no, title), invoices(invoice_no)").eq("id", params.id).eq("direction", "in").single();
  if (!p) return <NotFound what="receipt" />;
  const s = await getSettings();
  return (
    <DocShell s={s} title={`Receipt ${p.payment_no}`}>
      <DocHeader s={s} right={<><p className="text-lg font-bold uppercase" style={{ color: s.brand_color }}>Payment Receipt</p><p className="text-sm font-semibold">{p.payment_no}</p><p className="text-xs text-slate-500">{fmtDate(p.payment_date)}</p></>} />
      <div className="mt-8 space-y-3 text-[15px] leading-relaxed text-slate-800">
        <p>Received with thanks from <b>{p.contacts?.name ?? "—"}</b> the sum of <b>{inr(p.amount, 2)}</b> ({amountInWords(Number(p.amount))}) by <b>{p.mode}</b>{p.reference ? ` (ref: ${p.reference})` : ""}.</p>
        {(p.bookings || p.invoices) && <p className="text-sm text-slate-600">Towards {p.bookings ? `booking ${p.bookings.booking_no} – ${p.bookings.title}` : ""}{p.invoices ? ` · invoice ${p.invoices.invoice_no}` : ""}</p>}
        {p.notes && <p className="text-sm text-slate-600">{p.notes}</p>}
      </div>
      <div className="mt-8 inline-block rounded-xl px-6 py-3 text-2xl font-bold text-white" style={{ background: s.brand_color }}>{inr(p.amount, 2)}</div>
      <div className="mt-16 flex justify-end text-right text-[12px]"><div><p>For {s.company_name}</p><p className="mt-10 border-t pt-1 text-slate-500">Authorised signatory</p></div></div>
    </DocShell>
  );
}

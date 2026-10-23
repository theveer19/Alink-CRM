import QRCode from "qrcode";
import { adminClient } from "@/lib/supabase/admin";
import { getSettings, isUuid } from "@/lib/share";
import { amountInWords, fmtDate, inr } from "@/lib/utils";
import { DocHeader, DocShell, NotFound } from "@/components/doc-parts";

export const dynamic = "force-dynamic";

export default async function SharedInvoice({ params }: { params: { token: string } }) {
  if (!isUuid(params.token)) return <NotFound what="invoice" />;
  const supa = adminClient();
  const { data: inv } = await supa.from("invoices").select("*").eq("share_token", params.token).single();
  if (!inv || inv.status === "draft") return <NotFound what="invoice" />;
  const [s, items, pays, booking] = await Promise.all([
    getSettings(),
    supa.from("invoice_items").select("*").eq("invoice_id", inv.id).order("sort"),
    supa.from("payments").select("payment_date, amount, mode, reference").eq("invoice_id", inv.id).order("payment_date"),
    inv.booking_id ? supa.from("bookings").select("booking_no, title, start_date, end_date, adults, children").eq("id", inv.booking_id).single() : Promise.resolve({ data: null }),
  ]);
  const c = s.brand_color;
  const balance = Math.max(0, Number(inv.total) - Number(inv.amount_paid));
  let qr: string | null = null;
  if (s.upi_id && balance > 0 && inv.status !== "cancelled") {
    const upi = `upi://pay?pa=${encodeURIComponent(s.upi_id)}&pn=${encodeURIComponent(s.company_name)}&am=${balance.toFixed(2)}&cu=INR&tn=${encodeURIComponent(inv.invoice_no)}`;
    qr = await QRCode.toDataURL(upi, { margin: 1, width: 180 });
  }
  const gst = Number(inv.cgst) + Number(inv.sgst) + Number(inv.igst);

  return (
    <DocShell s={s} title={`Invoice ${inv.invoice_no} – ${s.company_name}`}>
      <DocHeader s={s} right={
        <>
          <p className="text-lg font-bold uppercase" style={{ color: c }}>{inv.tax_type === "none" ? "Invoice" : "Tax Invoice"}</p>
          <p className="text-sm font-semibold">{inv.invoice_no}</p>
          <p className="text-xs text-slate-500">Date: {fmtDate(inv.invoice_date)}</p>
          {inv.due_date && <p className="text-xs text-slate-500">Due: {fmtDate(inv.due_date)}</p>}
        </>
      } />
      {inv.status === "cancelled" && <p className="mt-4 rounded bg-rose-50 p-2 text-center text-sm font-bold uppercase text-rose-600">Cancelled</p>}

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <div className="rounded-lg bg-slate-50 p-3 text-[13px]">
          <p className="text-xs font-semibold uppercase text-slate-400">Bill to</p>
          <p className="font-semibold text-slate-900">{inv.bill_to_name}</p>
          {inv.bill_to_address && <p className="text-slate-600">{inv.bill_to_address}</p>}
          <p className="text-slate-600">{[inv.bill_to_phone, inv.bill_to_email].filter(Boolean).join(" · ")}</p>
          {inv.bill_to_gstin && <p className="text-slate-600">GSTIN: {inv.bill_to_gstin}</p>}
        </div>
        <div className="rounded-lg bg-slate-50 p-3 text-[13px]">
          <p className="text-xs font-semibold uppercase text-slate-400">Details</p>
          {inv.place_of_supply && <p>Place of supply: {inv.place_of_supply}{s.state_code && inv.place_of_supply === s.state ? ` (${s.state_code})` : ""}</p>}
          {booking.data && <p>Booking: {booking.data.booking_no} · {booking.data.title}</p>}
          {booking.data?.start_date && <p>Travel: {fmtDate(booking.data.start_date)} – {fmtDate(booking.data.end_date)}</p>}
          {s.pan && <p>PAN: {s.pan}</p>}
        </div>
      </div>

      <table className="mt-5 w-full text-[13px]">
        <thead>
          <tr className="text-left text-xs uppercase text-white" style={{ background: c }}>
            <th className="px-2 py-2">#</th><th className="px-2">Description</th><th className="px-2">SAC</th><th className="px-2 text-right">Qty</th><th className="px-2 text-right">Rate</th><th className="px-2 text-right">Amount</th>
          </tr>
        </thead>
        <tbody>
          {(items.data ?? []).map((x: any, i: number) => (
            <tr key={x.id} className="border-b border-slate-100">
              <td className="px-2 py-2">{i + 1}</td><td className="px-2">{x.description}</td><td className="px-2">{x.sac}</td>
              <td className="px-2 text-right">{Number(x.qty)}</td><td className="px-2 text-right">{inr(x.rate, 2)}</td><td className="px-2 text-right">{inr(x.amount, 2)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-4 flex flex-col-reverse gap-6 sm:flex-row sm:justify-between">
        <div className="max-w-sm text-[12px] text-slate-600">
          <p className="font-medium text-slate-800">{amountInWords(Number(inv.total))}</p>
          {(s.bank_account_no || s.upi_id) && (
            <div className="mt-3">
              <p className="text-xs font-semibold uppercase text-slate-400">Bank details</p>
              {s.bank_account_no && <p>{s.bank_name && <>{s.bank_name}<br /></>}{s.bank_account_name && <>A/c name: {s.bank_account_name}<br /></>}A/c no: {s.bank_account_no}{s.bank_ifsc ? ` · IFSC: ${s.bank_ifsc}` : ""}</p>}
              {s.upi_id && <p>UPI: {s.upi_id}</p>}
            </div>
          )}
          {qr && (
            <div className="mt-3 flex items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qr} alt="UPI QR" className="h-28 w-28" />
              <p>Scan with any UPI app to pay<br /><b className="text-base text-slate-900">{inr(balance, 2)}</b></p>
            </div>
          )}
        </div>
        <div className="w-full space-y-1 text-[13px] sm:w-72">
          <Row k="Subtotal" v={inr(inv.subtotal, 2)} />
          {Number(inv.discount) > 0 && <Row k="Discount" v={`− ${inr(inv.discount, 2)}`} />}
          {Number(inv.service_charge) > 0 && <Row k="Service charge" v={inr(inv.service_charge, 2)} />}
          {inv.tax_type !== "none" && <Row k="Taxable value" v={inr(inv.taxable_value, 2)} />}
          {inv.tax_type === "cgst_sgst" && <><Row k={`CGST @ ${Number(inv.gst_percent) / 2}%`} v={inr(inv.cgst, 2)} /><Row k={`SGST @ ${Number(inv.gst_percent) / 2}%`} v={inr(inv.sgst, 2)} /></>}
          {inv.tax_type === "igst" && <Row k={`IGST @ ${Number(inv.gst_percent)}%`} v={inr(inv.igst, 2)} />}
          {Number(inv.tcs) > 0 && <Row k={`TCS @ ${Number(inv.tcs_percent)}%`} v={inr(inv.tcs, 2)} />}
          <div className="flex justify-between border-t-2 pt-1.5 text-base font-bold" style={{ borderColor: c }}><span>Total</span><span>{inr(inv.total, 2)}</span></div>
          {Number(inv.amount_paid) > 0 && <Row k="Paid" v={inr(inv.amount_paid, 2)} />}
          {Number(inv.amount_paid) > 0 && <div className="flex justify-between font-semibold text-rose-600"><span>Balance due</span><span>{inr(balance, 2)}</span></div>}
          {gst > 0 && <p className="pt-1 text-[11px] text-slate-400">Total GST: {inr(gst, 2)}</p>}
        </div>
      </div>

      {inv.status === "paid" && <p className="mt-4 inline-block -rotate-6 rounded border-4 border-emerald-500 px-4 py-1 text-xl font-black uppercase text-emerald-500">Paid</p>}

      {(pays.data ?? []).length > 0 && (
        <div className="mt-5 text-[12px]">
          <p className="text-xs font-semibold uppercase text-slate-400">Payments received</p>
          {(pays.data ?? []).map((p: any, i: number) => <p key={i}>{fmtDate(p.payment_date)} · {p.mode}{p.reference ? ` (${p.reference})` : ""} · {inr(p.amount, 2)}</p>)}
        </div>
      )}
      {inv.notes && <p className="mt-4 whitespace-pre-wrap text-[12px] text-slate-700">{inv.notes}</p>}
      {inv.terms && <div className="mt-4 border-t pt-3 text-[11px] text-slate-500"><p className="font-semibold uppercase">Terms</p><p className="whitespace-pre-wrap">{inv.terms}</p></div>}
      <div className="mt-10 flex justify-end text-right text-[12px]">
        <div><p>For {s.company_name}</p><p className="mt-10 border-t pt-1 text-slate-500">Authorised signatory</p></div>
      </div>
      <p className="mt-4 text-center text-[10px] text-slate-400">This is a computer generated invoice.</p>
    </DocShell>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return <div className="flex justify-between"><span className="text-slate-600">{k}</span><span>{v}</span></div>;
}

"use client";
import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { toast } from "sonner";
import { Copy, Landmark } from "lucide-react";
import { useAuth } from "@/components/auth";
import { Card } from "@/components/ui";

export default function MakePaymentPage() {
  const { settings: s } = useAuth();
  const [qr, setQr] = useState("");
  useEffect(() => {
    if (!s.upi_id) return;
    QRCode.toDataURL(`upi://pay?pa=${encodeURIComponent(s.upi_id)}&pn=${encodeURIComponent(s.company_name)}&cu=INR`, { margin: 1, width: 240 }).then(setQr).catch(() => setQr(""));
  }, [s.upi_id, s.company_name]);
  const rows: [string, string | null][] = [["Bank", s.bank_name], ["Account Name", s.bank_account_name], ["Account No", s.bank_account_no], ["IFSC Code", s.bank_ifsc], ["UPI", s.upi_id]];
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <h1 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-slate-700"><Landmark className="h-4 w-4" /> Payment</h1>
      <Card title="Bank Details">
        <div className="grid gap-5 sm:grid-cols-[1fr_auto]">
          <table className="text-sm">
            <tbody>
              {rows.filter(([, v]) => v).map(([k, v]) => (
                <tr key={k} className="border-b border-slate-100 last:border-0">
                  <td className="py-2 pr-4 text-slate-500">{k}:</td>
                  <td className="py-2 font-semibold text-slate-900">{v}</td>
                  <td><button onClick={() => { navigator.clipboard.writeText(v!); toast.success("Copied"); }} className="p-1 text-slate-400 hover:text-slate-700" aria-label={`Copy ${k}`}><Copy className="h-3.5 w-3.5" /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
          {qr && (
            <div className="text-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qr} alt="UPI QR" className="mx-auto h-44 w-44" />
              <p className="text-xs text-slate-500">Scan to pay by UPI</p>
            </div>
          )}
        </div>
        {!rows.some(([, v]) => v) && <p className="text-sm text-slate-500">Add bank details in Settings → Invoice, GST &amp; bank.</p>}
      </Card>
    </div>
  );
}

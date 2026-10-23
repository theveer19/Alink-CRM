"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Eye, Link2, MessageCircle, Trash2 } from "lucide-react";
import { sb } from "@/lib/supabase/client";
import { appUrl, fmtDate, waLink } from "@/lib/utils";
import { useDebounced } from "@/lib/hooks";
import { Guard, useAuth } from "@/components/auth";
import { Badge, Card, ConfirmButton, Empty, Input, PageHeader, Select, Spinner, Table, Td, Th } from "@/components/ui";

export default function VouchersPage() {
  return <Guard module="vouchers"><Vouchers /></Guard>;
}

function Vouchers() {
  const { can, settings } = useAuth();
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const dq = useDebounced(q);
  const [type, setType] = useState("");

  async function load() {
    setLoading(true);
    let qb = sb().from("vouchers").select("*, bookings(booking_no, title)").order("created_at", { ascending: false }).limit(300);
    if (type) qb = qb.eq("voucher_type", type);
    const t = dq.trim().replace(/[%,()]/g, "");
    if (t) qb = qb.ilike("voucher_no", `%${t}%`);
    const { data, error } = await qb;
    setLoading(false);
    if (error) return toast.error(error.message);
    setRows(data ?? []);
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [dq, type]);

  return (
    <>
      <PageHeader title="Vouchers" subtitle="Hotel, flight, cab and tour vouchers — issue them from a booking" />
      <Card bodyClass="p-3" className="mb-4">
        <div className="flex flex-wrap gap-2">
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Voucher no." className="w-56" />
          <Select value={type} onChange={(e) => setType(e.target.value)} className="w-40">
            <option value="">All types</option><option value="hotel">Hotel</option><option value="flight">Flight</option><option value="cab">Cab</option><option value="tour">Tour</option><option value="combined">Combined</option>
          </Select>
        </div>
      </Card>
      {loading ? <Spinner /> : (
        <Card bodyClass="p-0">
          {rows.length === 0 ? <Empty title="No vouchers yet" text="Open a booking → tick services → Voucher." /> : (
            <Table>
              <thead><tr><Th>Voucher</Th><Th>Type</Th><Th>Guest</Th><Th>Booking</Th><Th>Issued</Th><Th /></tr></thead>
              <tbody>
                {rows.map((v) => {
                  const url = `${appUrl()}/share/voucher/${v.share_token}`;
                  return (
                    <tr key={v.id}>
                      <Td className="font-medium">{v.voucher_no}</Td>
                      <Td><Badge className="capitalize">{v.voucher_type}</Badge></Td>
                      <Td>{v.data?.guest?.name}<div className="text-xs text-slate-500">{v.data?.services?.length} service(s)</div></Td>
                      <Td className="text-xs"><Link href={`/bookings/${v.booking_id}`} className="text-brand-700 hover:underline">{v.bookings?.booking_no}</Link> · {v.bookings?.title}</Td>
                      <Td className="text-xs">{fmtDate(v.created_at)}</Td>
                      <Td>
                        <div className="flex gap-1">
                          <a href={`/share/voucher/${v.share_token}`} target="_blank" rel="noreferrer" className="rounded p-1.5 text-slate-400 hover:bg-slate-100" title="View / PDF"><Eye className="h-4 w-4" /></a>
                          <button onClick={async () => { await navigator.clipboard.writeText(url); toast.success("Link copied"); }} className="rounded p-1.5 text-slate-400 hover:bg-slate-100" title="Copy link"><Link2 className="h-4 w-4" /></button>
                          {v.data?.guest?.phone && <a href={waLink(v.data.guest.phone, `Dear ${v.data.guest.name}, here is your ${v.voucher_type} voucher ${v.voucher_no} from ${settings.company_name}:\n${url}\nHave a great trip!`)} target="_blank" rel="noreferrer" className="rounded p-1.5 text-slate-400 hover:bg-emerald-50 hover:text-emerald-600" title="WhatsApp"><MessageCircle className="h-4 w-4" /></a>}
                          {can("vouchers", "delete") && <ConfirmButton size="icon" label="?" onConfirm={async () => { const { error } = await sb().from("vouchers").delete().eq("id", v.id); if (error) toast.error(error.message); else load(); }}><Trash2 className="h-4 w-4" /></ConfirmButton>}
                        </div>
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          )}
        </Card>
      )}
    </>
  );
}

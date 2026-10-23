"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { sb } from "@/lib/supabase/client";
import { QUOTE_STATUSES, statusMeta } from "@/lib/constants";
import { fmtDate, inr } from "@/lib/utils";
import { useDebounced } from "@/lib/hooks";
import { createItinerary } from "@/lib/actions";
import { Guard, useAuth } from "@/components/auth";
import { Badge, Button, Card, Empty, Input, PageHeader, Select, Spinner, Table, Td, Th } from "@/components/ui";

export default function ItinerariesPage() {
  return <Guard module="itineraries"><List /></Guard>;
}

function List() {
  const { can, settings, userName } = useAuth();
  const router = useRouter();
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const dq = useDebounced(q);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      let qb = sb().from("itineraries").select("id, quote_no, version, title, destination, start_date, nights, adults, children, status, grand_total, cost_total, created_at, created_by, contacts(name, phone), leads(lead_no)").order("created_at", { ascending: false }).limit(300);
      const t = dq.trim().replace(/[%,()]/g, "");
      if (t) qb = qb.or(`title.ilike.%${t}%,quote_no.ilike.%${t}%,destination.ilike.%${t}%`);
      if (status) qb = qb.eq("status", status);
      const { data, error } = await qb;
      setLoading(false);
      if (error) return toast.error(error.message);
      setRows(data ?? []);
    })();
  }, [dq, status]);

  return (
    <>
      <PageHeader title="Itineraries & quotations" subtitle="Day-wise plans with auto costing, markup and GST" actions={
        can("itineraries", "create") && <Button loading={busy} onClick={async () => { setBusy(true); try { router.push(`/itineraries/${await createItinerary(settings)}`); } catch (e: any) { toast.error(e.message); setBusy(false); } }}><Plus className="h-4 w-4" /> New itinerary</Button>
      } />
      <Card bodyClass="p-3" className="mb-4">
        <div className="flex flex-wrap gap-2">
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search title, quote no, destination" className="w-72" />
          <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-40"><option value="">All statuses</option>{QUOTE_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}</Select>
        </div>
      </Card>
      {loading ? <Spinner /> : (
        <Card bodyClass="p-0">
          {rows.length === 0 ? <Empty title="No itineraries yet" text="Open a lead and click 'Create itinerary', or start a blank one." /> : (
            <Table>
              <thead><tr><Th>Quote</Th><Th>Customer</Th><Th>Travel</Th><Th>Status</Th><Th className="text-right">Cost</Th><Th className="text-right">Quote total</Th><Th>By</Th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50">
                    <Td><Link href={`/itineraries/${r.id}`} className="font-medium hover:text-brand-700">{r.title}</Link><div className="text-xs text-slate-500">{r.quote_no} v{r.version}{r.leads?.lead_no ? ` · ${r.leads.lead_no}` : ""}</div></Td>
                    <Td>{r.contacts?.name ?? "—"}<div className="text-xs text-slate-500">{r.contacts?.phone}</div></Td>
                    <Td className="text-xs">{r.start_date ? fmtDate(r.start_date) : "Dates TBD"} · {r.nights}N · {r.adults}A{r.children ? ` ${r.children}C` : ""}</Td>
                    <Td><Badge className={statusMeta(QUOTE_STATUSES, r.status)?.color}>{statusMeta(QUOTE_STATUSES, r.status)?.label}</Badge></Td>
                    <Td className="text-right text-slate-500">{inr(r.cost_total)}</Td>
                    <Td className="text-right font-medium">{inr(r.grand_total)}</Td>
                    <Td className="text-xs">{userName(r.created_by)}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      )}
    </>
  );
}

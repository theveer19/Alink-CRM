"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Download, Plus, Cake } from "lucide-react";
import { sb } from "@/lib/supabase/client";
import { SEGMENTS } from "@/lib/constants";
import type { Contact } from "@/lib/types";
import { downloadCsv, fmtDate, isoDate } from "@/lib/utils";
import { useDebounced } from "@/lib/hooks";
import { Guard, useAuth } from "@/components/auth";
import { ContactForm } from "@/components/contact-form";
import { Badge, Button, Card, Empty, Input, PageHeader, Select, Spinner, Table, Td, Th } from "@/components/ui";

const PAGE = 50;
type Row = Contact & { leads: { count: number }[]; bookings: { count: number }[] };

export default function ContactsPage() {
  return <Guard module="contacts"><Contacts /></Guard>;
}

function Contacts() {
  const { can } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const dq = useDebounced(q);
  const [seg, setSeg] = useState("");
  const [type, setType] = useState("");
  const [tag, setTag] = useState("");
  const [special, setSpecial] = useState("");
  const [open, setOpen] = useState(false);

  function query() {
    let qb = sb().from("contacts").select("*, leads(count), bookings(count)", { count: "exact" });
    const t = dq.trim().replace(/[%,()]/g, "");
    if (t) qb = qb.or(`name.ilike.%${t}%,phone.ilike.%${t}%,email.ilike.%${t}%,city.ilike.%${t}%,company_name.ilike.%${t}%`);
    if (seg) qb = qb.eq("segment", seg);
    if (type) qb = qb.eq("customer_type", type);
    if (tag) qb = qb.contains("tags", [tag.trim()]);
    if (special === "passport") qb = qb.not("passport_expiry", "is", null).lte("passport_expiry", isoDate(new Date(Date.now() + 180 * 86400000)));
    if (special === "dob" || special === "anniv") qb = qb.not(special === "dob" ? "dob" : "anniversary", "is", null);
    return qb;
  }

  async function load() {
    setLoading(true);
    const base = query().order("created_at", { ascending: false });
    const { data, count: c, error } = await (special === "dob" || special === "anniv" ? base.limit(3000) : base.range(page * PAGE, page * PAGE + PAGE - 1));
    setLoading(false);
    if (error) return toast.error(error.message);
    let list = (data ?? []) as Row[];
    if (special === "dob" || special === "anniv") {
      // upcoming in the next 30 days (by month/day)
      const key = special === "dob" ? "dob" : "anniversary";
      const today = new Date();
      list = list.filter((r) => {
        const d = (r as any)[key] as string;
        const next = new Date(today.getFullYear(), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10)));
        if (next < new Date(today.toDateString())) next.setFullYear(today.getFullYear() + 1);
        return (next.getTime() - today.getTime()) / 86400000 <= 30;
      });
    }
    setRows(list);
    setCount(c ?? 0);
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [dq, seg, type, tag, special, page]);
  useEffect(() => setPage(0), [dq, seg, type, tag, special]);

  async function exportCsv() {
    const { data } = await query().order("name").limit(10000);
    downloadCsv(`customers-${isoDate()}.csv`, [
      ["Name", "Phone", "Email", "City", "State", "Type", "Segment", "Tags", "DOB", "Anniversary", "Passport", "Passport expiry", "GSTIN"],
      ...(data ?? []).map((c: Contact) => [c.name, c.phone, c.email, c.city, c.state, c.customer_type, c.segment, c.tags.join("; "), c.dob, c.anniversary, c.passport_no, c.passport_expiry, c.gstin]),
    ]);
  }

  return (
    <>
      <PageHeader title="Contacts" subtitle={`${count} customers`} actions={
        <>
          <Button variant="secondary" onClick={exportCsv}><Download className="h-4 w-4" /> Export</Button>
          {can("contacts", "create") && <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> New customer</Button>}
        </>
      } />
      <Card bodyClass="p-3" className="mb-4">
        <div className="flex flex-wrap gap-2">
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, phone, email, city…" className="w-64" />
          <Select value={seg} onChange={(e) => setSeg(e.target.value)} className="w-36"><option value="">All segments</option>{SEGMENTS.map((s) => <option key={s}>{s}</option>)}</Select>
          <Select value={type} onChange={(e) => setType(e.target.value)} className="w-32"><option value="">All types</option><option>B2C</option><option>B2B</option><option>Corporate</option></Select>
          <Input value={tag} onChange={(e) => setTag(e.target.value)} placeholder="Tag" className="w-32" />
          <Select value={special} onChange={(e) => setSpecial(e.target.value)} className="w-52">
            <option value="">—</option>
            <option value="dob">🎂 Birthdays in next 30 days</option>
            <option value="anniv">💍 Anniversaries in next 30 days</option>
            <option value="passport">🛂 Passport expiring ≤ 6 months</option>
          </Select>
        </div>
      </Card>
      {loading ? <Spinner /> : (
        <Card bodyClass="p-0">
          {rows.length === 0 ? <Empty title="No customers" text="Customers are created automatically from leads, or add one manually." /> : (
            <Table>
              <thead><tr><Th>Customer</Th><Th>City</Th><Th>Type / segment</Th><Th>Tags</Th><Th>Leads</Th><Th>Trips</Th><Th>Since</Th></tr></thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50">
                    <Td>
                      <Link href={`/contacts/${c.id}`} className="font-medium text-slate-900 hover:text-brand-700">{c.name}</Link>
                      <div className="text-xs text-slate-500">{c.phone} {c.email ? `· ${c.email}` : ""}</div>
                      {special === "dob" && c.dob && <div className="flex items-center gap-1 text-xs text-pink-600"><Cake className="h-3 w-3" /> {fmtDate(c.dob)}</div>}
                      {special === "anniv" && c.anniversary && <div className="text-xs text-pink-600">💍 {fmtDate(c.anniversary)}</div>}
                      {special === "passport" && <div className="text-xs text-rose-600">Passport exp {fmtDate(c.passport_expiry)}</div>}
                    </Td>
                    <Td>{c.city ?? "—"}</Td>
                    <Td><Badge>{c.customer_type}</Badge> <Badge className={c.segment === "VIP" ? "bg-amber-100 text-amber-700" : ""}>{c.segment}</Badge></Td>
                    <Td><div className="flex flex-wrap gap-1">{c.tags.map((t) => <Badge key={t} className="bg-brand-50 text-brand-700">{t}</Badge>)}</div></Td>
                    <Td>{c.leads?.[0]?.count ?? 0}</Td>
                    <Td>{c.bookings?.[0]?.count ?? 0}</Td>
                    <Td className="text-xs text-slate-500">{fmtDate(c.created_at)}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
          {count > PAGE && !special.match(/dob|anniv/) && (
            <div className="flex items-center justify-between border-t border-slate-100 px-4 py-2 text-xs text-slate-500">
              <span>{page * PAGE + 1}–{Math.min(count, page * PAGE + PAGE)} of {count}</span>
              <div className="flex gap-2">
                <Button size="sm" variant="secondary" disabled={page === 0} onClick={() => setPage(page - 1)}>Previous</Button>
                <Button size="sm" variant="secondary" disabled={(page + 1) * PAGE >= count} onClick={() => setPage(page + 1)}>Next</Button>
              </div>
            </div>
          )}
        </Card>
      )}
      <ContactForm open={open} onClose={() => setOpen(false)} onSaved={() => load()} />
    </>
  );
}

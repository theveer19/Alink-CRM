"use client";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { KeyRound, Pencil, Plus, Shield, Trash2 } from "lucide-react";
import { sb } from "@/lib/supabase/client";
import { ACTION_LABELS, MODULES } from "@/lib/constants";
import type { Profile, Role } from "@/lib/types";
import { cn, fmtDateTime, inr } from "@/lib/utils";
import { useLoad } from "@/lib/hooks";
import { Guard, useAuth } from "@/components/auth";
import { Badge, Button, Card, ConfirmButton, Field, Input, Modal, PageHeader, Select, Spinner, Table, Tabs, Td, Th } from "@/components/ui";

export default function TeamPage() {
  return <Guard module="team"><Team /></Guard>;
}

async function teamApi(body: Record<string, unknown>) {
  const r = await fetch("/api/team", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error ?? "Request failed");
  return d;
}

function Team() {
  const [tab, setTab] = useState("users");
  return (
    <>
      <PageHeader title="Users & team" subtitle="Staff logins, roles & permissions, and a full activity log" />
      <Tabs value={tab} onChange={setTab} tabs={[{ value: "users", label: "Users" }, { value: "roles", label: "Roles & permissions" }, { value: "log", label: "Activity log" }]} />
      {tab === "users" && <Users />}
      {tab === "roles" && <Roles />}
      {tab === "log" && <ActivityLog />}
    </>
  );
}

function Users() {
  const { role: myRole, reload: reloadAuth, userId } = useAuth();
  const isAdmin = !!myRole?.is_admin;
  const { data, loading, reload } = useLoad(async () => {
    const [p, r] = await Promise.all([sb().from("profiles").select("*, roles(name, is_admin)").order("created_at"), sb().from("roles").select("*").order("name")]);
    return { users: (p.data ?? []) as (Profile & { roles: { name: string; is_admin: boolean } | null })[], roles: (r.data ?? []) as Role[] };
  }, []);
  const [edit, setEdit] = useState<any | null>(null);
  const [pw, setPw] = useState<{ id: string; name: string } | null>(null);
  const [newPw, setNewPw] = useState("");
  const [busy, setBusy] = useState(false);

  if (loading || !data) return <Spinner />;

  async function save() {
    setBusy(true);
    try {
      if (edit.id) await teamApi({ action: "update", id: edit.id, full_name: edit.full_name, phone: edit.phone, role_id: edit.role_id, is_active: edit.is_active, receives_leads: edit.receives_leads, monthly_target: Number(edit.monthly_target || 0) });
      else await teamApi({ action: "create", email: edit.email, password: edit.password, full_name: edit.full_name, phone: edit.phone, role_id: edit.role_id });
      toast.success("Saved");
      setEdit(null);
      reload();
      reloadAuth();
    } catch (e: any) { toast.error(e.message); }
    setBusy(false);
  }

  return (
    <Card bodyClass="p-0" title={`${data.users.length} users`} action={isAdmin && <Button size="sm" onClick={() => setEdit({ email: "", password: "", full_name: "", phone: "", role_id: data.roles.find((r) => r.name === "Sales Executive")?.id ?? data.roles[0]?.id, is_active: true, receives_leads: true })}><Plus className="h-3.5 w-3.5" /> Add user</Button>}>
      <Table>
        <thead><tr><Th>Name</Th><Th>Role</Th><Th>Status</Th><Th>Gets new leads</Th><Th className="text-right">Monthly target</Th><Th>Joined</Th><Th /></tr></thead>
        <tbody>
          {data.users.map((u) => (
            <tr key={u.id}>
              <Td><p className="font-medium">{u.full_name}{u.id === userId && <span className="text-xs text-slate-400"> (you)</span>}</p><p className="text-xs text-slate-500">{u.email} {u.phone ? `· ${u.phone}` : ""}</p></Td>
              <Td><Badge className={u.roles?.is_admin ? "bg-brand-100 text-brand-800" : ""}>{u.roles?.name ?? "—"}</Badge></Td>
              <Td>{u.is_active ? <Badge className="bg-emerald-100 text-emerald-700">Active</Badge> : <Badge className="bg-rose-100 text-rose-700">Inactive</Badge>}</Td>
              <Td>{u.receives_leads ? "Yes" : "No"}</Td>
              <Td className="text-right">{Number(u.monthly_target) ? inr(u.monthly_target) : "—"}</Td>
              <Td className="text-xs">{fmtDateTime(u.created_at)}</Td>
              <Td>
                {isAdmin && (
                  <div className="flex gap-1">
                    <button title="Edit" onClick={() => setEdit({ ...u })} className="rounded p-1 text-slate-400 hover:bg-slate-100"><Pencil className="h-4 w-4" /></button>
                    <button title="Reset password" onClick={() => setPw({ id: u.id, name: u.full_name })} className="rounded p-1 text-slate-400 hover:bg-slate-100"><KeyRound className="h-4 w-4" /></button>
                  </div>
                )}
              </Td>
            </tr>
          ))}
        </tbody>
      </Table>
      {!isAdmin && <p className="p-4 text-xs text-slate-500">Only admins can add or change users.</p>}

      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? `Edit ${edit.full_name}` : "Add user"} size="md"
        footer={<><Button variant="secondary" onClick={() => setEdit(null)}>Cancel</Button><Button loading={busy} onClick={save}>Save</Button></>}>
        {edit && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Full name" required><Input value={edit.full_name ?? ""} onChange={(e) => setEdit({ ...edit, full_name: e.target.value })} /></Field>
            <Field label="Phone"><Input value={edit.phone ?? ""} onChange={(e) => setEdit({ ...edit, phone: e.target.value })} /></Field>
            {!edit.id && <Field label="Login email" required><Input type="email" value={edit.email} onChange={(e) => setEdit({ ...edit, email: e.target.value })} /></Field>}
            {!edit.id && <Field label="Password" hint="8+ characters — share it with the user" required><Input value={edit.password} onChange={(e) => setEdit({ ...edit, password: e.target.value })} /></Field>}
            <Field label="Role"><Select value={edit.role_id ?? ""} onChange={(e) => setEdit({ ...edit, role_id: e.target.value })}>{data.roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</Select></Field>
            {edit.id && <Field label="Monthly sales target ₹"><Input type="number" value={edit.monthly_target ?? 0} onChange={(e) => setEdit({ ...edit, monthly_target: e.target.value })} /></Field>}
            {edit.id && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={edit.is_active} onChange={(e) => setEdit({ ...edit, is_active: e.target.checked })} /> Active (can log in)</label>}
            {edit.id && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={edit.receives_leads} onChange={(e) => setEdit({ ...edit, receives_leads: e.target.checked })} /> Include in lead auto-assign</label>}
          </div>
        )}
      </Modal>
      <Modal open={!!pw} onClose={() => setPw(null)} title={`New password for ${pw?.name}`} size="sm"
        footer={<Button onClick={async () => { try { await teamApi({ action: "password", id: pw!.id, password: newPw }); toast.success("Password changed"); setPw(null); setNewPw(""); } catch (e: any) { toast.error(e.message); } }}>Set password</Button>}>
        <Input value={newPw} onChange={(e) => setNewPw(e.target.value)} placeholder="8+ characters" />
      </Modal>
    </Card>
  );
}

function Roles() {
  const { role: myRole, reload: reloadAuth } = useAuth();
  const isAdmin = !!myRole?.is_admin;
  const { data, loading, reload } = useLoad(async () => {
    const [r, p] = await Promise.all([sb().from("roles").select("*").order("created_at"), sb().from("profiles").select("role_id")]);
    return { roles: (r.data ?? []) as Role[], used: (p.data ?? []).map((x) => x.role_id) };
  }, []);
  const [sel, setSel] = useState<Role | null>(null);
  const [perm, setPerm] = useState<Record<string, string[]>>({});
  const [name, setName] = useState("");

  useEffect(() => { if (sel) { setPerm(JSON.parse(JSON.stringify(sel.permissions ?? {}))); setName(sel.name); } }, [sel]);
  useEffect(() => { if (data && !sel) setSel(data.roles.find((r) => !r.is_admin) ?? data.roles[0] ?? null); }, [data, sel]);

  if (loading || !data) return <Spinner />;

  function toggle(m: string, a: string) {
    const cur = new Set(perm[m] ?? []);
    if (cur.has(a)) { cur.delete(a); if (a === "view") cur.clear(); } else { cur.add(a); if (a !== "view" && m !== "settings") cur.add("view"); }
    setPerm({ ...perm, [m]: [...cur] });
  }

  async function save() {
    if (!sel) return;
    const { error } = await sb().from("roles").update({ name, permissions: perm }).eq("id", sel.id);
    if (error) return toast.error(error.message);
    toast.success("Role saved — users get it on next page load");
    await reload();
    reloadAuth();
  }

  async function add() {
    const { data: r, error } = await sb().from("roles").insert({ name: `New role ${data!.roles.length + 1}`, permissions: { dashboard: ["view"] } }).select().single();
    if (error) return toast.error(error.message);
    await reload();
    setSel(r as Role);
  }

  return (
    <div className="grid gap-5 lg:grid-cols-4">
      <Card title="Roles" bodyClass="p-2" action={isAdmin && <Button size="sm" variant="secondary" onClick={add}><Plus className="h-3.5 w-3.5" /></Button>}>
        {data.roles.map((r) => (
          <button key={r.id} onClick={() => setSel(r)} className={cn("flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm", sel?.id === r.id ? "bg-brand-50 text-brand-800" : "hover:bg-slate-50")}>
            <span>{r.name}</span>
            <span className="text-xs text-slate-400">{data.used.filter((u) => u === r.id).length} users</span>
          </button>
        ))}
      </Card>
      <Card className="lg:col-span-3" title={sel ? <span className="flex items-center gap-2"><Shield className="h-4 w-4 text-brand-600" /> {sel.name}</span> : "Select a role"}
        action={sel && isAdmin && !sel.is_admin && (
          <div className="flex gap-2">
            {!data.used.includes(sel.id) && <ConfirmButton size="sm" label="Delete role?" onConfirm={async () => { const { error } = await sb().from("roles").delete().eq("id", sel.id); if (error) toast.error(error.message); else { setSel(null); reload(); } }}><Trash2 className="h-3.5 w-3.5" /></ConfirmButton>}
            <Button size="sm" onClick={save}>Save role</Button>
          </div>
        )}>
        {sel?.is_admin ? <p className="text-sm text-slate-600">Admin has full access to everything, including users and settings. This role can&apos;t be restricted.</p> : sel && (
          <>
            <Field label="Role name" className="mb-4 max-w-xs"><Input value={name} onChange={(e) => setName(e.target.value)} disabled={!isAdmin} /></Field>
            <Table>
              <thead><tr><Th>Module</Th>{Object.keys(ACTION_LABELS).map((a) => <Th key={a} className="text-center">{ACTION_LABELS[a]}</Th>)}</tr></thead>
              <tbody>
                {MODULES.map((m) => (
                  <tr key={m.key}>
                    <Td className="font-medium">{m.label}</Td>
                    {Object.keys(ACTION_LABELS).map((a) => (
                      <Td key={a} className="text-center">
                        {m.actions.includes(a) ? <input type="checkbox" disabled={!isAdmin} checked={(perm[m.key] ?? []).includes(a)} onChange={() => toggle(m.key, a)} className="h-4 w-4 accent-brand-700" /> : <span className="text-slate-200">—</span>}
                      </Td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </Table>
            <p className="mt-3 text-xs text-slate-500"><b>See everyone&apos;s</b> = see all leads / follow-ups, not just the ones assigned to this user. Permissions are enforced in the database (row-level security), not only in the menu.</p>
          </>
        )}
      </Card>
    </div>
  );
}

function ActivityLog() {
  const { team } = useAuth();
  const [who, setWho] = useState("");
  const [entity, setEntity] = useState("");
  const [page, setPage] = useState(0);
  const { data, loading } = useLoad(async () => {
    let q = sb().from("activity_log").select("*").order("id", { ascending: false }).range(page * 100, page * 100 + 99);
    if (who) q = q.eq("actor_id", who);
    if (entity) q = q.eq("entity", entity);
    const { data, error } = await q;
    if (error) throw error;
    return data ?? [];
  }, [who, entity, page]);
  const ENT = ["leads", "contacts", "followups", "itineraries", "bookings", "booking_services", "invoices", "payments", "expenses", "vouchers", "documents", "hotels", "hotel_rates", "suppliers", "activities", "transfers", "destinations", "settings", "roles", "profiles"];
  return (
    <Card bodyClass="p-0" title="Who did what" action={
      <div className="flex gap-2">
        <Select value={who} onChange={(e) => { setWho(e.target.value); setPage(0); }} className="h-8 w-40 text-xs"><option value="">Everyone</option>{team.map((t) => <option key={t.id} value={t.id}>{t.full_name}</option>)}</Select>
        <Select value={entity} onChange={(e) => { setEntity(e.target.value); setPage(0); }} className="h-8 w-40 text-xs"><option value="">All records</option>{ENT.map((e) => <option key={e}>{e}</option>)}</Select>
      </div>
    }>
      {loading || !data ? <Spinner /> : (
        <>
          <Table>
            <thead><tr><Th>When</Th><Th>User</Th><Th>Action</Th><Th>Record</Th><Th>Changed fields</Th></tr></thead>
            <tbody>
              {data.map((a: any) => (
                <tr key={a.id}>
                  <Td className="whitespace-nowrap text-xs">{fmtDateTime(a.created_at)}</Td>
                  <Td className="text-xs">{a.actor_name ?? (a.actor_id ? "—" : "System / website")}</Td>
                  <Td><Badge className={a.action === "insert" ? "bg-emerald-100 text-emerald-700" : a.action === "delete" ? "bg-rose-100 text-rose-700" : "bg-sky-100 text-sky-700"}>{a.action === "insert" ? "created" : a.action === "delete" ? "deleted" : "updated"}</Badge></Td>
                  <Td className="text-xs"><span className="text-slate-400">{a.entity}</span> {a.label}</Td>
                  <Td className="max-w-xs truncate text-xs text-slate-500">{(a.changes ?? []).join(", ")}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
          <div className="flex justify-end gap-2 border-t border-slate-100 p-2">
            <Button size="sm" variant="secondary" disabled={page === 0} onClick={() => setPage(page - 1)}>Newer</Button>
            <Button size="sm" variant="secondary" disabled={data.length < 100} onClick={() => setPage(page + 1)}>Older</Button>
          </div>
        </>
      )}
    </Card>
  );
}

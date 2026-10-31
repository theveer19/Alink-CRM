"use client";
import { useState } from "react";
import { toast } from "sonner";
import { KeyRound, UserRound } from "lucide-react";
import { sb } from "@/lib/supabase/client";
import { useAuth } from "@/components/auth";
import { Button, Card, Field, Input } from "@/components/ui";

export default function ProfilePage() {
  const { profile, role, reload } = useAuth();
  const [name, setName] = useState(profile.full_name);
  const [phone, setPhone] = useState(profile.phone ?? "");
  const [pw, setPw] = useState({ a: "", b: "" });
  const [busy, setBusy] = useState("");

  async function save() {
    if (!name.trim()) return toast.error("Name is required");
    setBusy("p");
    const { error } = await sb().rpc("update_my_profile", { p_name: name.trim(), p_phone: phone.trim() });
    setBusy("");
    if (error) return toast.error(error.message);
    toast.success("Profile updated");
    reload();
  }
  async function changePw() {
    if (pw.a.length < 8) return toast.error("Password must be at least 8 characters");
    if (pw.a !== pw.b) return toast.error("Passwords do not match");
    setBusy("w");
    const { error } = await sb().auth.updateUser({ password: pw.a });
    setBusy("");
    if (error) return toast.error(error.message);
    setPw({ a: "", b: "" });
    toast.success("Password changed");
  }
  return (
    <div className="mx-auto grid max-w-4xl gap-5 md:grid-cols-2">
      <Card title={<span className="flex items-center gap-2"><UserRound className="h-4 w-4" /> My Profile</span>}>
        <div className="space-y-3">
          <Field label="Login email"><Input value={profile.email ?? ""} disabled /></Field>
          <Field label="Full name" required><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
          <Field label="Mobile"><Input value={phone} onChange={(e) => setPhone(e.target.value)} /></Field>
          <p className="text-xs text-slate-500">Role: <b>{role?.name ?? "—"}</b>. Company, logo, GST and bank details are in Settings (admin).</p>
          <Button loading={busy === "p"} onClick={save}>Update</Button>
        </div>
      </Card>
      <Card title={<span className="flex items-center gap-2"><KeyRound className="h-4 w-4" /> Change Password</span>}>
        <div className="space-y-3">
          <Field label="New password"><Input type="password" autoComplete="new-password" value={pw.a} onChange={(e) => setPw({ ...pw, a: e.target.value })} /></Field>
          <Field label="Confirm new password"><Input type="password" autoComplete="new-password" value={pw.b} onChange={(e) => setPw({ ...pw, b: e.target.value })} /></Field>
          <Button loading={busy === "w"} onClick={changePw}>Change Password</Button>
        </div>
      </Card>
    </div>
  );
}

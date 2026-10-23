"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { sb } from "@/lib/supabase/client";
import { Button, Field, Input, Spinner } from "@/components/ui";

export default function SetupPage() {
  const router = useRouter();
  const [state, setState] = useState<"loading" | "open" | "done">("loading");
  const [f, setF] = useState({ company: "A Link Tours & Travels", name: "", email: "", password: "" });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/setup").then((r) => r.json()).then((d) => setState(d.needsSetup ? "open" : "done")).catch(() => setState("open"));
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (f.password.length < 8) return toast.error("Password must be at least 8 characters");
    setBusy(true);
    const r = await fetch("/api/setup", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(f) });
    const d = await r.json();
    if (!r.ok) { setBusy(false); return toast.error(d.error ?? "Setup failed"); }
    const { error } = await sb().auth.signInWithPassword({ email: f.email, password: f.password });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Admin created. Welcome!");
    router.replace("/settings");
  }

  if (state === "loading") return <Spinner className="min-h-screen" />;
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-7 shadow-xl">
        <h1 className="text-xl font-semibold">A Link CRM — first time setup</h1>
        {state === "done" ? (
          <p className="mt-3 text-sm text-slate-600">Setup is already complete. <a href="/login" className="text-brand-700 underline">Go to login</a></p>
        ) : (
          <form onSubmit={submit} className="mt-5 space-y-4">
            <Field label="Company name"><Input required value={f.company} onChange={(e) => setF({ ...f, company: e.target.value })} /></Field>
            <Field label="Your name"><Input required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
            <Field label="Admin email"><Input type="email" required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
            <Field label="Password" hint="Minimum 8 characters"><Input type="password" required value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></Field>
            <Button className="w-full" loading={busy}>Create admin account</Button>
          </form>
        )}
      </div>
    </div>
  );
}

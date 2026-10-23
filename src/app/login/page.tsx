"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { sb } from "@/lib/supabase/client";
import { Button, Field, Input } from "@/components/ui";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [mode, setMode] = useState<"login" | "reset">("login");

  useEffect(() => {
    fetch("/api/setup").then((r) => r.json()).then((d) => setNeedsSetup(!!d.needsSetup)).catch(() => {});
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    if (mode === "reset") {
      const { error } = await sb().auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/login` });
      setBusy(false);
      if (error) return toast.error(error.message);
      toast.success("Password reset link sent to your email");
      return setMode("login");
    }
    const { error } = await sb().auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) return toast.error(error.message);
    router.replace("/dashboard");
    router.refresh();
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-brand-900 via-brand-800 to-slate-900 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-7 shadow-2xl">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-brand-700 text-xl font-bold text-white">A</div>
          <h1 className="text-xl font-semibold">A Link CRM</h1>
          <p className="text-sm text-slate-500">{mode === "login" ? "Sign in to continue" : "Reset your password"}</p>
        </div>
        {needsSetup && (
          <div className="mb-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
            First time here? <Link href="/setup" className="font-semibold underline">Create the admin account</Link>
          </div>
        )}
        <form onSubmit={submit} className="space-y-4">
          <Field label="Email">
            <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
          </Field>
          {mode === "login" && (
            <Field label="Password">
              <Input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
            </Field>
          )}
          <Button className="w-full" loading={busy}>{mode === "login" ? "Sign in" : "Send reset link"}</Button>
        </form>
        <button onClick={() => setMode(mode === "login" ? "reset" : "login")} className="mt-4 w-full text-center text-xs text-slate-500 hover:text-brand-700">
          {mode === "login" ? "Forgot password?" : "Back to sign in"}
        </button>
      </div>
    </div>
  );
}

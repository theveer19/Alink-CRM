"use client";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { sb } from "@/lib/supabase/client";
import type { Profile, Role, Settings, TextTemplate } from "@/lib/types";
import { Spinner, Button } from "./ui";

type Ctx = {
  userId: string;
  profile: Profile;
  role: Role | null;
  settings: Settings;
  team: Profile[];
  sources: string[];
  templates: TextTemplate[];
  can: (module: string, action?: string) => boolean;
  userName: (id: string | null | undefined) => string;
  reload: () => Promise<void>;
};

const AuthCtx = createContext<Ctx | null>(null);

export function useAuth() {
  const c = useContext(AuthCtx);
  if (!c) throw new Error("useAuth outside provider");
  return c;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [state, setState] = useState<Omit<Ctx, "can" | "userName" | "reload"> | null>(null);
  const [inactive, setInactive] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const supa = sb();
    const { data: { user } } = await supa.auth.getUser();
    if (!user) {
      router.replace("/login");
      return;
    }
    const { data: profile, error: pe } = await supa.from("profiles").select("*, roles(*)").eq("id", user.id).single();
    if (pe || !profile) {
      setError(pe?.message ?? "Profile not found. Did you run supabase/001_schema.sql?");
      return;
    }
    if (!profile.is_active) {
      setInactive(true);
      return;
    }
    const [st, tm, src, tpl] = await Promise.all([
      supa.from("settings").select("*").eq("id", 1).single(),
      supa.from("profiles").select("*, roles(name)").order("full_name"),
      supa.from("lead_sources").select("name").eq("is_active", true).order("name"),
      supa.from("text_templates").select("*").order("title"),
    ]);
    setState({
      userId: user.id,
      profile: profile as Profile,
      role: (profile as any).roles ?? null,
      settings: st.data as Settings,
      team: (tm.data ?? []) as Profile[],
      sources: (src.data ?? []).map((s: { name: string }) => s.name),
      templates: (tpl.data ?? []) as TextTemplate[],
    });
  }, [router]);

  useEffect(() => {
    load();
    const { data: sub } = sb().auth.onAuthStateChange((evt) => {
      if (evt === "SIGNED_OUT") router.replace("/login");
    });
    return () => sub.subscription.unsubscribe();
  }, [load, router]);

  if (error)
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="max-w-md rounded-xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-700">{error}</div>
      </div>
    );

  if (inactive)
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="max-w-md rounded-xl border bg-white p-6 text-center shadow-card">
          <h2 className="text-lg font-semibold">Account not active</h2>
          <p className="mt-2 text-sm text-slate-500">Your login works, but an admin has not activated your account yet (or it was deactivated). Please contact your admin.</p>
          <Button className="mt-4" variant="secondary" onClick={async () => { await sb().auth.signOut(); router.replace("/login"); }}>Sign out</Button>
        </div>
      </div>
    );

  if (!state) return <Spinner className="min-h-screen" />;

  const can = (module: string, action = "view") =>
    !!state.role && (state.role.is_admin || (state.role.permissions?.[module] ?? []).includes(action));
  const userName = (id: string | null | undefined) => state.team.find((t) => t.id === id)?.full_name ?? (id ? "—" : "Unassigned");

  return <AuthCtx.Provider value={{ ...state, can, userName, reload: load }}>{children}</AuthCtx.Provider>;
}

export function Guard({ module, action = "view", children }: { module: string; action?: string; children: ReactNode }) {
  const { can } = useAuth();
  if (!can(module, action))
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-800">
        You don&apos;t have permission to open this page. Ask your admin to enable <b>{module}</b> → <b>{action}</b> for your role.
      </div>
    );
  return <>{children}</>;
}

import "server-only";
import { serverClient } from "./server";
import { adminClient } from "./admin";

export type Caller = { id: string; isAdmin: boolean; perms: Record<string, string[]>; name: string };

/** Returns the logged-in, active user with role permissions, or null. */
export async function getCaller(): Promise<Caller | null> {
  const supa = serverClient();
  const { data: { user } } = await supa.auth.getUser();
  if (!user) return null;
  const { data } = await adminClient()
    .from("profiles")
    .select("id, full_name, is_active, roles(is_admin, permissions)")
    .eq("id", user.id)
    .single();
  if (!data || !data.is_active) return null;
  const role = (Array.isArray(data.roles) ? data.roles[0] : data.roles) as { is_admin: boolean; permissions: Record<string, string[]> } | null;
  return { id: data.id, name: data.full_name, isAdmin: !!role?.is_admin, perms: role?.permissions ?? {} };
}

export function can(c: Caller, module: string, action: string) {
  return c.isAdmin || (c.perms[module] ?? []).includes(action);
}

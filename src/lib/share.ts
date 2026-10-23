import "server-only";
import { adminClient } from "@/lib/supabase/admin";
import type { Settings } from "@/lib/types";

export async function getSettings() {
  const { data } = await adminClient().from("settings").select("*").eq("id", 1).single();
  return data as Settings;
}

export const isUuid = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

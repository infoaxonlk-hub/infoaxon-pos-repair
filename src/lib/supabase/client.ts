import { createBrowserClient } from "@supabase/ssr";
import { publicSupabaseEnv } from "@/lib/env";

export function createClient() {
  const { url, publishableKey } = publicSupabaseEnv();
  return createBrowserClient(
    url,
    publishableKey,
  );
}

import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { BusinessBrand } from "@/lib/branding";

// Request-local deduplication, never a shared cross-tenant cache.
export const getBusinessBrand = cache(async (): Promise<BusinessBrand | null> => {
  const client = await createClient();
  const { data: { user }, error } = await client.auth.getUser();
  if (error || !user) return null;
  const result = await client.rpc("my_business_branding");
  if (result.error || !result.data) return null;
  return result.data as BusinessBrand;
});

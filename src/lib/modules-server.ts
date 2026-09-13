import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { isModuleList } from "./modules";

export const getBusinessModules = cache(async () => {
  const client = await createClient();
  const { data, error } = await client.rpc("my_business_modules");
  if (error || !isModuleList(data)) {
    throw new Error("Unable to load module access. Confirm migration 020 was applied.");
  }
  return data;
});

import "server-only";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function requirePlatformAccess() {
  const client = await createClient();
  const { data: { user }, error } = await client.auth.getUser();
  if (error || !user) redirect("/login");
  const role = await client.rpc("is_platform_admin");
  if (role.error) throw new Error("Unable to verify platform access.");
  if (role.data !== true) notFound();
  return client;
}

"use server";

import { redirect } from "next/navigation";
import { requirePlatformAccess } from "@/lib/platform/access";

type Admin = { id: string; email: string; active: boolean };

export async function switchToClientLogin(form: FormData) {
  const businessId = String(form.get("businessId") ?? "");
  const adminId = String(form.get("adminId") ?? "");
  const businessName = String(form.get("businessName") ?? "").slice(0, 120);
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuid.test(businessId) || !uuid.test(adminId)) redirect("/platform/admins?result=invalid");
  const client = await requirePlatformAccess();
  const result = await client.rpc("platform_list_client_admins", { p_business: businessId });
  const admin = ((result.data ?? []) as Admin[]).find((item) => item.id === adminId && item.active);
  if (result.error || !admin) redirect(`/platform/admins?business=${encodeURIComponent(businessId)}&result=failed`);
  await client.auth.signOut({ scope: "local" });
  const query = new URLSearchParams({ portal: "business", email: admin.email, business: businessName });
  redirect(`/login?${query.toString()}`);
}

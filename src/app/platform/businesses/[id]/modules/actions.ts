"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePlatformAccess } from "@/lib/platform/access";
import { UUID } from "@/lib/branding";
import { isModuleList, MODULE_IDS } from "@/lib/modules";

export async function saveModules(_state: { error: string }, form: FormData) {
  const client = await requirePlatformAccess();
  const id = String(form.get("id") ?? "");
  const revision = Number(form.get("revision"));
  const modules = form.getAll("modules");
  if (!UUID.test(id) || !Number.isSafeInteger(revision) || revision < 0 || !isModuleList(modules)) {
    return { error: "Invalid module selection. Refresh and try again." };
  }
  if (modules.length < MODULE_IDS.length && form.get("confirmed") !== "yes") {
    return { error: "Confirm that disabled modules will stop new operations, including open jobs and sessions." };
  }
  const { error } = await client.rpc("platform_set_business_modules", {
    p_id: id, p_expected_revision: revision, p_modules: modules,
  });
  if (error) return { error: error.code === "40001"
    ? "Another administrator changed these modules. Refresh before saving again."
    : "Could not save modules. Confirm migration 020 is applied and try again." };
  revalidatePath("/", "layout");
  redirect(`/platform/businesses/${id}/modules?saved=1`);
}

"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { requirePlatformAccess } from "@/lib/platform/access";
import { normalizeLogo } from "@/lib/platform/logo";
import { UUID, HEX, LOGO_BUCKET, themeText, type BusinessDetails } from "@/lib/branding";

export type FormState = { error: string };
const read = (form: FormData, key: string) => String(form.get(key) ?? "").trim();
const errorMessage = (code?: string) => code === "40001"
  ? "This business changed in another tab. Reload the page before saving."
  : code === "42501" ? "Platform access is no longer available."
  : "Save could not be confirmed. Reload and check the values before retrying.";

function finish(id: string, saved: string): never {
  revalidatePath("/", "layout");
  redirect("/platform/businesses/" + id + "?saved=" + saved);
}

export async function saveDetails(_previous: FormState, form: FormData): Promise<FormState> {
  const client = await requirePlatformAccess();
  const id = read(form, "id"), version = read(form, "version");
  const name = read(form, "name"), phone = read(form, "phone");
  const email = read(form, "email"), address = read(form, "address");
  const primary = read(form, "primary_color"), accent = read(form, "accent_color");
  const active = form.get("active") === "on";
  if (!UUID.test(id) || !version || version.length > 64 || Number.isNaN(Date.parse(version)) ||
      name.length < 2 || name.length > 120 || phone.length > 30 || address.length > 500 ||
      email.length > 254 || (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) ||
      !HEX.test(primary) || !HEX.test(accent)) {
    return { error: "Check name, contact details and the two six-digit hex colors." };
  }
  if (!themeText(primary, accent)) {
    return { error: "Choose two darker colors or two lighter colors so the same text color stays readable on both." };
  }
  if (!active && form.get("confirmInactive") !== "yes") {
    return { error: "Confirm that this business should lose access before deactivating it." };
  }
  try {
    const result = await client.rpc("platform_update_business", {
      p_id: id, p_expected_updated_at: version, p_name: name,
      p_phone: phone, p_email: email, p_address: address,
      p_primary_color: primary, p_accent_color: accent, p_active: active,
    });
    if (result.error) return { error: errorMessage(result.error.code) };
  } catch { return { error: errorMessage() }; }
  finish(id, "details");
}

export async function saveLogo(_previous: FormState, form: FormData): Promise<FormState> {
  const client = await requirePlatformAccess();
  const id = read(form, "id"), version = read(form, "version");
  if (!UUID.test(id) || !version || version.length > 64) return { error: "Reload the business page." };
  const remove = form.get("removeLogo") === "yes";
  let nextPath: string | null = null;
  try {
    const current = await client.rpc("platform_get_business", { p_id: id });
    if (current.error || !current.data) return { error: "Could not verify this business." };
    const business = current.data as BusinessDetails;
    if (business.updated_at !== version) return { error: errorMessage("40001") };
    if (!remove) {
      const file = form.get("logo");
      if (!(file instanceof File)) return { error: "Choose a logo file." };
      let bytes: Buffer;
      try { bytes = await normalizeLogo(file); }
      catch { return { error: "Use a valid non-animated PNG, JPEG or WebP: maximum 512 KB and 16 megapixels." }; }
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL, secret = process.env.SUPABASE_SECRET_KEY;
      if (!url || !secret) return { error: "Server logo upload service is not configured." };
      const admin = createAdminClient(url, secret, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      nextPath = id + "/" + randomUUID() + ".webp";
      const upload = await admin.storage.from(LOGO_BUCKET).upload(nextPath, bytes, {
        contentType: "image/webp", upsert: false, cacheControl: "3600",
      });
      if (upload.error) return { error: "Logo upload failed. Check the logo bucket configuration." };
    }
    const saved = await client.rpc("platform_set_business_logo", {
      p_id: id, p_expected_updated_at: version, p_logo_path: nextPath,
    });
    // Old/unreferenced objects are retained, never deleted on an uncertain save.
    if (saved.error) return { error: errorMessage(saved.error.code) };
  } catch { return { error: errorMessage() }; }
  finish(id, remove ? "removed" : "logo");
}

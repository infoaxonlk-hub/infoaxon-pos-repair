type RequiredPublicEnv =
  | "NEXT_PUBLIC_SUPABASE_URL"
  | "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY";

function required(name: RequiredPublicEnv) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export function publicSupabaseEnv() {
  const url = required("NEXT_PUBLIC_SUPABASE_URL");
  const publishableKey = required("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");

  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" && parsed.hostname !== "localhost") {
      throw new Error("Production Supabase URL must use HTTPS");
    }
  } catch (error) {
    if (error instanceof Error && error.message === "Production Supabase URL must use HTTPS") throw error;
    throw new Error("NEXT_PUBLIC_SUPABASE_URL must be a valid URL");
  }

  return { url, publishableKey };
}

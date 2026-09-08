type RequiredPublicEnv =
  | "NEXT_PUBLIC_SUPABASE_URL"
  | "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY";

function required(name: RequiredPublicEnv, rawValue: string | undefined) {
  const value = rawValue?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export function publicSupabaseEnv() {
  // NEXT_PUBLIC variables must be referenced statically so Next.js can inline
  // them into Client Component bundles at build time.
  const url = required(
    "NEXT_PUBLIC_SUPABASE_URL",
    process.env.NEXT_PUBLIC_SUPABASE_URL,
  );
  const publishableKey = required(
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );

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

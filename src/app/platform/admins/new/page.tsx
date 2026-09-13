import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  createClient as createAdminClient,
} from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Create Client Admin | InfoAxon",
};

const path = "/platform/admins/new";

async function requirePlatformAdmin() {
  const client = await createClient();
  const {
    data: { user },
    error,
  } = await client.auth.getUser();

  if (error || !user) redirect("/login");

  const role = await client.rpc("is_platform_admin");

  if (role.error) {
    throw new Error("Cannot verify platform access.");
  }
  if (role.data !== true) notFound();

  return client;
}

async function provision(form: FormData): Promise<string> {
  const read = (name: string) =>
    String(form.get(name) ?? "");

  const businessId = read("businessId");
  const fullName = read("fullName").trim();
  const email = read("email").trim().toLowerCase();
  const password = read("password");

  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(businessId) ||
    fullName.length < 2 ||
    fullName.length > 120 ||
    email.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    password.length < 12 ||
    password.length > 128 ||
    password !== read("confirmPassword") ||
    read("verified") !== "yes"
  ) {
    return "invalid";
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;

  if (!url || !secret) return "config";

  const admin = createAdminClient(url, secret, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  const business = await admin
    .from("businesses")
    .select("id")
    .eq("id", businessId)
    .eq("active", true)
    .maybeSingle();

  if (business.error) return "unavailable";
  if (!business.data) return "business";

  const branch = await admin
    .from("branches")
    .select("id")
    .eq("business_id", businessId)
    .eq("code", "MAIN")
    .eq("active", true)
    .maybeSingle();

  if (branch.error) return "unavailable";
  if (!branch.data) return "branch";

  const { data, error } =
    await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    });

  if (error) {
    if (
      ["email_exists", "user_already_exists"].includes(
        error.code ?? "",
      )
    ) {
      return "duplicate";
    }
    if (error.code === "weak_password") return "password";
    if (error.status === 429) return "limit";
    return "review";
  }

  if (!data.user) return "review";

  const id = data.user.id;
  let insertFailed = false;

  try {
    const saved = await admin.from("profiles").insert({
      id,
      business_id: businessId,
      branch_id: branch.data.id,
      full_name: fullName,
      role: "admin",
      active: true,
    });

    insertFailed = !!saved.error;
  } catch {
    insertFailed = true;
  }

  if (!insertFailed) return "created";

  // A lost response may hide a successful insert.
  // Check before removing a newly created account.
  const check = await admin
    .from("profiles")
    .select("id,business_id,role,active,branch_id")
    .eq("id", id)
    .maybeSingle();

  if (check.error) return "review";

  if (check.data) {
    return (
      check.data.business_id === businessId &&
      check.data.role === "admin" &&
      check.data.active === true &&
      check.data.branch_id === branch.data.id
    )
      ? "created"
      : "review";
  }

  // Only remove this newly created, unlinked account.
  const cleanup = await admin.auth.admin.deleteUser(id);
  return cleanup.error ? "review" : "rolledback";
}

async function createAccount(form: FormData) {
  "use server";

  await requirePlatformAdmin();

  let result: string;
  try {
    result = await provision(form);
  } catch {
    result = "review";
  }

  redirect(`${path}?result=${result}`);
}

type Business = {
  id: string;
  name: string;
  code: string;
  active: boolean;
};

export default async function NewClientAdmin({
  searchParams,
}: {
  searchParams: Promise<{ result?: string }>;
}) {
  const client = await requirePlatformAdmin();
  const query = await searchParams;

  const { data, error } = await client.rpc(
    "platform_list_businesses",
  );

  const businesses = ((data ?? []) as Business[])
    .filter((b) => b.active);

  const messages: Record<string, string> = {
    created:
      "Client Admin created. They can sign in using the email and password you entered.",
    invalid:
      "Check all fields. Passwords must match and contain 12–128 characters. Confirm the email ownership checkbox.",
    config:
      "Server configuration is missing SUPABASE_SECRET_KEY. Do not paste the key into chat.",
    duplicate:
      "This email already has an account. It was not changed. Use a separate client email.",
    password:
      "Supabase rejected this password. Choose a stronger password.",
    business:
      "Select an active business.",
    branch:
      "This business needs an active branch with code MAIN.",
    unavailable:
      "Cannot check business details. Try again later.",
    limit:
      "Too many requests. Wait before retrying.",
    review:
      "Setup could not be confirmed. Do not retry yet. Check Supabase Authentication and profiles; manual review is required.",
    rolledback:
      "Profile creation failed. The newly created login was removed. Investigate the profile setup before retrying.",
  };

  const input =
    "mt-2 w-full rounded-xl border border-slate-300 bg-white p-3 text-slate-900";

  return (
    <main className="min-h-screen bg-slate-100 px-5 py-8 text-slate-900">
      <div className="mx-auto max-w-2xl">
        <a
          href="/platform"
          className="font-semibold text-indigo-700"
        >
          ← Back to businesses
        </a>

        <h1 className="mt-5 text-3xl font-bold">
          Create Client Admin
        </h1>

        <p className="mt-3 text-slate-600">
          Creates a Business Admin, not a Platform Admin.
          Existing accounts are never reassigned.
        </p>

        {query.result && (
          <p
            role="status"
            className="mt-5 rounded-xl bg-white p-4"
          >
            {messages[query.result] ?? messages.review}
          </p>
        )}

        {error ? (
          <p role="alert" className="mt-5 text-red-700">
            Could not load businesses. Refresh and try again.
          </p>
        ) : businesses.length === 0 ? (
          <p className="mt-5">
            Create an active business first.
          </p>
        ) : (
          <form
            action={createAccount}
            className="mt-6 grid gap-5 rounded-2xl bg-white p-6 shadow-sm"
          >
            <label>
              Business
              <select
                name="businessId"
                required
                defaultValue=""
                className={input}
              >
                <option value="" disabled>
                  Select a business
                </option>
                {businesses.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name} ({b.code})
                  </option>
                ))}
              </select>
            </label>

            <label>
              Admin full name
              <input
                name="fullName"
                required
                minLength={2}
                maxLength={120}
                className={input}
                autoComplete="name"
              />
            </label>

            <label>
              Admin email
              <input
                name="email"
                type="email"
                required
                maxLength={254}
                className={input}
                autoComplete="off"
              />
            </label>

            <label>
              Password
              <input
                name="password"
                type="password"
                required
                minLength={12}
                maxLength={128}
                className={input}
                autoComplete="new-password"
              />
            </label>

            <label>
              Confirm password
              <input
                name="confirmPassword"
                type="password"
                required
                minLength={12}
                maxLength={128}
                className={input}
                autoComplete="new-password"
              />
            </label>

            <label className="flex items-start gap-3 text-sm">
              <input
                type="checkbox"
                name="verified"
                value="yes"
                required
                className="mt-1"
              />
              I verified this email belongs to the client.
              This creates an email-confirmed account.
            </label>

            <p className="text-sm text-slate-600">
              No invitation email is sent. Share the login
              details privately. Do not include passwords
              in screenshots.
            </p>

            <button className="rounded-xl bg-indigo-700 px-5 py-3 font-semibold text-white">
              Create Client Admin
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
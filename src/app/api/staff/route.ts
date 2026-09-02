import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

const allowedRoles = ["admin", "manager", "cashier", "technician"] as const;
type StaffRole = (typeof allowedRoles)[number];

type CreateStaffBody = {
  fullName?: string;
  email?: string;
  password?: string;
  phone?: string;
  role?: string;
  branchId?: string | null;
};

export async function POST(request: Request) {
  const cookieStore = await cookies();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // Cookie updates may be unavailable in some server contexts.
          }
        },
      },
    },
  );

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json(
      { error: "You must sign in again." },
      { status: 401 },
    );
  }

  const { data: administrator, error: administratorError } = await supabase
    .from("profiles")
    .select("business_id, role, active")
    .eq("id", user.id)
    .single();

  if (
    administratorError ||
    !administrator ||
    administrator.role !== "admin" ||
    administrator.active !== true
  ) {
    return NextResponse.json(
      { error: "Only an active administrator can create staff accounts." },
      { status: 403 },
    );
  }

  let body: CreateStaffBody;

  try {
    body = (await request.json()) as CreateStaffBody;
  } catch {
    return NextResponse.json(
      { error: "Invalid request." },
      { status: 400 },
    );
  }

  const fullName = body.fullName?.trim() ?? "";
  const email = body.email?.trim().toLowerCase() ?? "";
  const password = body.password ?? "";
  const phone = body.phone?.trim() || null;
  const branchId = body.branchId?.trim() || null;
  const role = body.role as StaffRole;

  if (!fullName || !email || !password || !allowedRoles.includes(role)) {
    return NextResponse.json(
      { error: "Name, email, password and a valid role are required." },
      { status: 400 },
    );
  }

  if (password.length < 8) {
    return NextResponse.json(
      { error: "Password must contain at least 8 characters." },
      { status: 400 },
    );
  }

  if (branchId) {
    const { data: branch, error: branchError } = await supabase
      .from("branches")
      .select("id")
      .eq("id", branchId)
      .eq("business_id", administrator.business_id)
      .eq("active", true)
      .maybeSingle();

    if (branchError || !branch) {
      return NextResponse.json(
        { error: "Select a valid active branch." },
        { status: 400 },
      );
    }
  }

  const secretKey = process.env.SUPABASE_SECRET_KEY;

  if (!secretKey) {
    return NextResponse.json(
      { error: "Staff account service is not configured." },
      { status: 503 },
    );
  }

  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    secretKey,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );

  const { data: newAccount, error: accountError } =
    await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: fullName,
      },
    });

  if (accountError || !newAccount.user) {
    return NextResponse.json(
      { error: accountError?.message ?? "Could not create login account." },
      { status: 400 },
    );
  }

  const { error: profileError } = await supabaseAdmin
    .from("profiles")
    .insert({
      id: newAccount.user.id,
      business_id: administrator.business_id,
      branch_id: branchId,
      full_name: fullName,
      role,
      phone,
      active: true,
    });

  if (profileError) {
    await supabaseAdmin.auth.admin.deleteUser(newAccount.user.id);

    return NextResponse.json(
      { error: `Could not create staff profile: ${profileError.message}` },
      { status: 400 },
    );
  }

  return NextResponse.json(
    {
      message: "Staff account created successfully.",
      userId: newAccount.user.id,
    },
    { status: 201 },
  );
}
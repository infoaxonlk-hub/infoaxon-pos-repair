import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

const roles = ["admin", "manager", "cashier", "technician"];

const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function reply(error: string, status: number) {
  return NextResponse.json(
    { error },
    {
      status,
      headers: { "Cache-Control": "private, no-store" },
    },
  );
}

export async function POST(request: Request) {
  try {
    if (request.headers.get("sec-fetch-site") === "cross-site") {
      return reply("Cross-site requests are not allowed.", 403);
    }

    const contentType = request.headers
      .get("content-type")
      ?.split(";")[0]
      .trim();

    if (contentType !== "application/json") {
      return reply("JSON request required.", 415);
    }

    const reader = request.body?.getReader();

    if (!reader) {
      return reply("Request body required.", 400);
    }

    const chunks: Uint8Array[] = [];
    let size = 0;

    while (true) {
      const { value, done } = await reader.read();

      if (done) break;

      size += value.byteLength;

      if (size > 8192) {
        await reader.cancel();
        return reply("Request is too large.", 413);
      }

      chunks.push(value);
    }

    const bytes = new Uint8Array(size);
    let offset = 0;

    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }

    let raw: unknown;

    try {
      raw = JSON.parse(new TextDecoder().decode(bytes));
    } catch {
      return reply("Invalid JSON request.", 400);
    }

    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      return reply("Invalid staff details.", 400);
    }

    const body = raw as Record<string, unknown>;

    for (const key of ["fullName", "email", "password", "role"]) {
      if (typeof body[key] !== "string") {
        return reply("Invalid required fields.", 400);
      }
    }

    for (const key of ["phone", "branchId"]) {
      if (body[key] != null && typeof body[key] !== "string") {
        return reply("Invalid optional fields.", 400);
      }
    }

    const fullName = (body.fullName as string).trim();
    const email = (body.email as string).trim().toLowerCase();
    const password = body.password as string;
    const role = body.role as string;
    const phone = (body.phone as string | undefined)?.trim() || null;
    const branchId =
      (body.branchId as string | undefined)?.trim() || null;

    if (!fullName || fullName.length > 120) {
      return reply("Name must contain 1–120 characters.", 400);
    }

    if (
      email.length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    ) {
      return reply("Enter a valid email address.", 400);
    }

    if (password.length < 8 || password.length > 128) {
      return reply("Password must contain 8–128 characters.", 400);
    }

    if (!roles.includes(role)) {
      return reply("Select a valid role.", 400);
    }

    if (phone && phone.length > 30) {
      return reply("Phone must be at most 30 characters.", 400);
    }

    if (branchId && !uuid.test(branchId)) {
      return reply("Select a valid branch.", 400);
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const publicKey =
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    const secret = process.env.SUPABASE_SECRET_KEY;

    if (!url || !publicKey || !secret) {
      return reply("Staff service is not configured.", 503);
    }

    const jar = await cookies();

    const client = createServerClient(url, publicKey, {
      cookies: {
        getAll: () => jar.getAll(),
        setAll: (items) => {
          items.forEach(({ name, value, options }) => {
            jar.set(name, value, options);
          });
        },
      },
    });

    const { data: auth, error: authError } =
      await client.auth.getUser();

    if (authError || !auth.user) {
      return reply("Please sign in again.", 401);
    }

    const { data: actor, error: actorError } = await client
      .from("profiles")
      .select("business_id,role,active")
      .eq("id", auth.user.id)
      .single();

    if (actorError) {
      return reply(
        "Could not verify staff permissions.",
        actorError.code === "42501" ? 403 : 503,
      );
    }

    if (
      !actor ||
      actor.role !== "admin" ||
      actor.active !== true
    ) {
      return reply(
        "Only active administrators can add staff.",
        403,
      );
    }

    if (branchId) {
      const { data: branch, error } = await client
        .from("branches")
        .select("id")
        .eq("id", branchId)
        .eq("business_id", actor.business_id)
        .eq("active", true)
        .maybeSingle();

      if (error) {
        return reply(
          "Could not verify the branch. Try again later.",
          503,
        );
      }

      if (!branch) {
        return reply(
          "Select an active branch in your business.",
          400,
        );
      }
    }

    const admin = createClient(url, secret, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    const { data: created, error: createError } =
      await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: fullName },
      });

    if (createError) {
      if (
        ["email_exists", "user_already_exists"].includes(
          createError.code ?? "",
        )
      ) {
        return reply(
          "That email is already registered. Use another email.",
          409,
        );
      }

      if (createError.code === "weak_password") {
        return reply("Choose a stronger password.", 400);
      }

      if (createError.status === 429) {
        return reply(
          "Too many requests. Please wait before retrying.",
          429,
        );
      }

      return reply(
        "Account creation failed. Check Staff and Authentication before retrying.",
        503,
      );
    }

    if (!created.user) {
      return reply(
        "Account creation was not confirmed. Contact your administrator.",
        503,
      );
    }

    const newId = created.user.id;
    let saved = false;

    try {
      const { error } = await admin.from("profiles").insert({
        id: newId,
        business_id: actor.business_id,
        branch_id: branchId,
        full_name: fullName,
        role,
        phone,
        active: true,
      });

      saved = !error;
    } catch {
      saved = false;
    }

    if (!saved) {
      try {
        const { error } =
          await admin.auth.admin.deleteUser(newId);

        if (error) {
          throw new Error("cleanup");
        }
      } catch {
        console.error(
          "Staff setup requires manual review for newly created user:",
          newId,
        );

        return reply(
          "Staff setup was incomplete and cleanup failed. Contact your administrator; do not retry yet.",
          500,
        );
      }

      return reply(
        "Staff profile could not be saved. The new login account was removed. Contact your administrator.",
        500,
      );
    }

    return NextResponse.json(
      {
        message: "Staff account created successfully.",
        userId: newId,
      },
      {
        status: 201,
        headers: { "Cache-Control": "private, no-store" },
      },
    );
  } catch {
    return reply(
      "Staff service is unavailable. Check Staff and Authentication before retrying.",
      503,
    );
  }
}
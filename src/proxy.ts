import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => {
            request.cookies.set(name, value);
          });

          const previousCookies = response.cookies.getAll();
          response = NextResponse.next({ request });

          previousCookies.forEach((cookie) => {
            response.cookies.set(cookie);
          });

          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    },
  );

  function withCookies(result: NextResponse) {
    response.cookies.getAll().forEach((cookie) => {
      result.cookies.set(cookie);
    });
    result.headers.set("Cache-Control", "private, no-store");
    return result;
  }

  function redirectTo(path: string, message?: string) {
    const url = request.nextUrl.clone();
    url.pathname = path;
    url.search = "";

    if (message) {
      url.searchParams.set("error", message);
    }

    return withCookies(NextResponse.redirect(url, 303));
  }

  function unavailable() {
    return withCookies(
      new NextResponse(
        "Unable to verify account access. Please refresh and try again.",
        {
          status: 503,
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
            "Retry-After": "5",
          },
        },
      ),
    );
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isLoginPage = request.nextUrl.pathname === "/login";

  if (!user) {
    return isLoginPage
      ? withCookies(response)
      : redirectTo("/login");
  }
  const path = request.nextUrl.pathname;
  const inArea = (area: string) =>
    path === area || path.startsWith(`${area}/`);

  const isPlatform =
    inArea("/platform") || inArea("/api/platform");
  const isApi = inArea("/api");

  try {
    const { data: isAdmin, error } =
      await supabase.rpc("is_platform_admin");

    if (error || typeof isAdmin !== "boolean") {
      return unavailable();
    }

    if (isAdmin) {
      if (isPlatform) return withCookies(response);

      if (isApi || !["GET", "HEAD"].includes(request.method)) {
        return withCookies(
          NextResponse.json(
            { error: "Forbidden" },
            { status: 403 },
          ),
        );
      }

      return redirectTo("/platform");
    }

    if (isPlatform) {
      return withCookies(
        NextResponse.json(
          { error: "Platform administrator access required" },
          { status: 403 },
        ),
      );
    }
  } catch {
    return unavailable();
  }
  // Database migration 014 rejects inactive or missing staff profiles.
  try {
    const { data: businessId, error } =
      await supabase.rpc("current_business_id");

    if (error?.code === "42501") {
      await supabase.auth.signOut({ scope: "local" });

      // Allow the login page even if session cleanup was unsuccessful.
      if (isLoginPage) {
        return withCookies(response);
      }

      return redirectTo(
        "/login",
        "Your staff account is inactive or unavailable. Contact your administrator.",
      );
    }

    if (error || !businessId) {
      return unavailable();
    }
  } catch {
    return unavailable();
  }

  if (isLoginPage) {
    return redirectTo("/");
  }

  return withCookies(response);
}

export const config = {
  matcher: [
        "/platform/:path*",
    "/api/:path*",
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
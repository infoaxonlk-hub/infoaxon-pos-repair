import { NextResponse } from "next/server";
import { publicSupabaseEnv } from "@/lib/env";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    publicSupabaseEnv();
    return NextResponse.json(
      { status: "ok", service: "infoaxon-pos-repair" },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json(
      { status: "unavailable", service: "infoaxon-pos-repair" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}

import { NextResponse } from "next/server";
import { isPlainPostgres } from "@/lib/db/mode";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Safe health check — no credentials, hosts, or row data exposed.
 */
export async function GET() {
  const checks: Record<string, "ok" | "missing" | "error"> = {
    database_url: isPlainPostgres() ? "ok" : "missing",
    jwt_secret: process.env.SUPABASE_JWT_SECRET || process.env.JWT_SECRET ? "ok" : "missing",
    app_url: process.env.NEXT_PUBLIC_APP_URL ? "ok" : "missing",
  };

  let db: "ok" | "error" | "skipped" = "skipped";
  if (isPlainPostgres()) {
    try {
      const { query } = await import("@/lib/db/pool");
      await query("SELECT 1 AS ok");
      const { rows } = await query<{ n: number }>(
        `SELECT count(*)::int AS n FROM information_schema.tables
         WHERE table_schema = 'public' AND table_name = 'orders'`
      );
      db = rows[0]?.n === 1 ? "ok" : "error";
    } catch {
      db = "error";
    }
  }

  const unhealthy =
    checks.database_url === "missing" ||
    db === "error" ||
    checks.jwt_secret === "missing";

  return NextResponse.json(
    {
      status: unhealthy ? "unhealthy" : "healthy",
      checks: { ...checks, database_query: db },
      timestamp: new Date().toISOString(),
    },
    { status: unhealthy ? 503 : 200 }
  );
}

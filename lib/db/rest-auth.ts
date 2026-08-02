/**
 * Authorization for the Shape A PostgREST shim (/rest/v1).
 * Postgres RLS is currently disabled on the live DB — this layer is mandatory.
 */

import { NextRequest } from "next/server";
import { verifyAccessToken, getUserById } from "@/lib/db/auth";

/** Catalog / CMS tables safe for anonymous SELECT. */
export const PUBLIC_READ_TABLES = new Set([
  "products",
  "categories",
  "product_images",
  "product_variants",
  "reviews",
  "review_images",
  "site_settings",
  "store_settings",
  "store_modules",
  "banners",
  "pages",
  "cms_content",
  "blog_posts",
  "coupons",
  "navigation_menus",
  "navigation_items",
  "delivery_zones",
]);

/** Tables that must never be readable/writable without a user JWT or service role. */
export const SENSITIVE_TABLES = new Set([
  "orders",
  "order_items",
  "order_status_history",
  "profiles",
  "customers",
  "addresses",
  "cart_items",
  "wishlist_items",
  "notifications",
  "audit_logs",
  "riders",
  "delivery_assignments",
  "delivery_status_history",
  "support_tickets",
  "support_ticket_messages",
  "support_feedback",
  "support_analytics_daily",
  "support_escalation_rules",
  "support_canned_responses",
  "chat_conversations",
  "ai_memory",
  "customer_insights",
  "store_credit_transactions",
  "exchanges",
  "return_requests",
  "return_items",
  "roles",
  "contact_submissions",
  "payment_callback_events",
  "sms_messages",
]);

export type RestAuth =
  | { kind: "service" }
  | { kind: "user"; userId: string; role: string | null }
  | { kind: "anon" }
  | { kind: "none" };

function extractBearer(req: NextRequest): string | null {
  const auth = req.headers.get("authorization") || "";
  const m = auth.match(/^Bearer\s+(.+)$/i);
  return m?.[1]?.trim() || null;
}

function extractApiKey(req: NextRequest): string | null {
  return (
    req.headers.get("apikey")?.trim() ||
    req.headers.get("x-api-key")?.trim() ||
    null
  );
}

export async function resolveRestAuth(req: NextRequest): Promise<RestAuth> {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
  const bearer = extractBearer(req);
  const apiKey = extractApiKey(req);

  if (serviceKey && (bearer === serviceKey || apiKey === serviceKey)) {
    return { kind: "service" };
  }

  // Prefer JWT in Authorization when it is not the anon/service key itself
  if (bearer && bearer !== anonKey && bearer !== serviceKey) {
    const verified = await verifyAccessToken(bearer);
    if (verified) {
      const user = await getUserById(verified.userId);
      const role =
        (user?.app_metadata?.role as string | undefined) ||
        (verified.payload?.app_metadata as { role?: string } | undefined)?.role ||
        null;
      return { kind: "user", userId: verified.userId, role };
    }
  }

  if (anonKey && (apiKey === anonKey || bearer === anonKey)) {
    return { kind: "anon" };
  }

  // Plain-PG deployments sometimes omit real anon keys; allow anon-like
  // catalog reads when no credentials are configured at all.
  if (!anonKey && !serviceKey && !bearer) {
    return { kind: "anon" };
  }

  return { kind: "none" };
}

export function authorizeRestAccess(
  auth: RestAuth,
  table: string,
  method: string
): { ok: true } | { ok: false; status: number; message: string } {
  const write = method !== "GET" && method !== "HEAD";

  if (auth.kind === "service") return { ok: true };

  if (auth.kind === "none") {
    // Public catalog may be fetched without apikey (CDN / simple probes).
    if (!write && PUBLIC_READ_TABLES.has(table)) return { ok: true };
    return { ok: false, status: 401, message: "Missing or invalid API credentials" };
  }

  if (auth.kind === "user") {
    const isStaff = auth.role === "admin" || auth.role === "staff";
    if (write) {
      // Authenticated users may mutate own-scoped tables; staff may mutate more.
      const userWritable = new Set([
        "cart_items",
        "wishlist_items",
        "reviews",
        "review_images",
        "addresses",
        "profiles",
        "return_requests",
        "support_tickets",
        "support_ticket_messages",
        "support_feedback",
        "contact_submissions",
      ]);
      if (isStaff || userWritable.has(table)) return { ok: true };
      return {
        ok: false,
        status: 403,
        message: `Write access denied for table ${table}`,
      };
    }
    // Authenticated reads: allow (ownership filtering remains app-layer responsibility
    // for tables that still use the browser client).
    return { ok: true };
  }

  // anon
  if (write) {
    // Contact form inserts are public
    if (table === "contact_submissions" && method === "POST") return { ok: true };
    return {
      ok: false,
      status: 403,
      message: `Anonymous write access denied for table ${table}`,
    };
  }

  if (PUBLIC_READ_TABLES.has(table)) return { ok: true };
  if (SENSITIVE_TABLES.has(table)) {
    return {
      ok: false,
      status: 401,
      message: `Authentication required to read ${table}`,
    };
  }

  // Unknown tables: deny by default
  return {
    ok: false,
    status: 403,
    message: `Access denied for table ${table}`,
  };
}

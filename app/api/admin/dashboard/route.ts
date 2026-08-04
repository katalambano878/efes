import { NextResponse } from "next/server";
import { requireDbBackend } from "@/lib/api-gate";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { query } from "@/lib/db/pool";
import { isPlainPostgres } from "@/lib/db/mode";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function getAccessToken(request: Request): string | null {
  const authHeader = request.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) return authHeader.slice(7).trim();
  const cookieHeader = request.headers.get("cookie") || "";
  const match = cookieHeader.match(/\bsb-access-token=([^;]+)/);
  return match ? decodeURIComponent(match[1].trim()) : null;
}

/**
 * Bounded admin dashboard aggregates — no full-table client scans,
 * no payment-gateway calls.
 */
export async function GET(request: Request) {
  const gate = requireDbBackend();
  if (gate) return gate;

  const token = getAccessToken(request);
  if (!token) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const {
    data: { user },
    error: userError,
  } = await supabaseAdmin.auth.getUser(token);
  if (userError || !user) {
    return NextResponse.json({ error: "Invalid session" }, { status: 401 });
  }

  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  const role = profile?.role != null ? String(profile.role) : "";
  if (role !== "admin" && role !== "staff") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const sections: Record<string, unknown> = {};
  const errors: Record<string, string> = {};

  // Stats (indexed aggregates)
  try {
    if (isPlainPostgres()) {
      const { rows } = await query<{
        total_orders: number;
        paid_orders: number;
        revenue: number;
        customers: number;
      }>(
        `SELECT
           count(*)::int AS total_orders,
           count(*) FILTER (WHERE payment_status = 'paid')::int AS paid_orders,
           coalesce(sum(total) FILTER (WHERE payment_status = 'paid'), 0)::float8 AS revenue,
           count(DISTINCT email)::int AS customers
         FROM orders`
      );
      const s = rows[0] || {
        total_orders: 0,
        paid_orders: 0,
        revenue: 0,
        customers: 0,
      };
      const avg =
        s.paid_orders > 0 ? Number(s.revenue) / Number(s.paid_orders) : 0;
      sections.stats = {
        totalOrders: s.total_orders,
        paidOrders: s.paid_orders,
        revenue: Number(s.revenue),
        customers: s.customers,
        avgOrderValue: avg,
      };
    } else {
      const { data, error } = await supabaseAdmin
        .from("orders")
        .select("total, payment_status, email")
        .limit(5000);
      if (error) throw error;
      const paid = (data || []).filter((o: any) => o.payment_status === "paid");
      const revenue = paid.reduce(
        (sum: number, o: any) => sum + Number(o.total || 0),
        0
      );
      sections.stats = {
        totalOrders: data?.length || 0,
        paidOrders: paid.length,
        revenue,
        customers: new Set((data || []).map((o: any) => o.email)).size,
        avgOrderValue: paid.length ? revenue / paid.length : 0,
      };
    }
  } catch (e: any) {
    errors.stats = e?.message || "Failed to load stats";
  }

  // Chart — last 7 days paid revenue
  try {
    if (isPlainPostgres()) {
      const { rows } = await query<{ day: string; revenue: number }>(
        `SELECT to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS day,
                coalesce(sum(total), 0)::float8 AS revenue
         FROM orders
         WHERE payment_status = 'paid'
           AND created_at >= (now() - interval '7 days')
         GROUP BY 1
         ORDER BY 1`
      );
      const last7 = Array.from({ length: 7 }, (_, i) => {
        const d = new Date();
        d.setUTCDate(d.getUTCDate() - (6 - i));
        return d.toISOString().slice(0, 10);
      });
      const map = Object.fromEntries(rows.map((r) => [r.day, Number(r.revenue)]));
      sections.chart = last7.map((day) => ({
        date: new Date(day + "T00:00:00Z").toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
        }),
        revenue: map[day] || 0,
      }));
    } else {
      sections.chart = [];
    }
  } catch (e: any) {
    errors.chart = e?.message || "Failed to load chart";
  }

  // Recent paid orders
  try {
    const { data, error } = await supabaseAdmin
      .from("orders")
      .select(
        "id, order_number, email, created_at, total, status, shipping_address"
      )
      .eq("payment_status", "paid")
      .order("created_at", { ascending: false })
      .limit(5);
    if (error) throw error;
    sections.recentOrders = data || [];
  } catch (e: any) {
    errors.recentOrders = e?.message || "Failed to load recent orders";
  }

  // Low stock
  try {
    const { data, error } = await supabaseAdmin
      .from("products")
      .select("name, quantity")
      .lt("quantity", 10)
      .order("quantity", { ascending: true })
      .limit(5);
    if (error) throw error;
    sections.lowStock = data || [];
  } catch (e: any) {
    errors.lowStock = e?.message || "Failed to load low stock";
  }

  // Top products (simple sample — not sales aggregation)
  try {
    const { data, error } = await supabaseAdmin
      .from("products")
      .select("id, name, slug, quantity, product_images(url)")
      .eq("status", "active")
      .limit(4);
    if (error) throw error;
    sections.topProducts = data || [];
  } catch (e: any) {
    errors.topProducts = e?.message || "Failed to load products";
  }

  return NextResponse.json({
    success: true,
    sections,
    errors,
    partial: Object.keys(errors).length > 0,
  });
}

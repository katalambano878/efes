# Database Performance & Lock Report — Efes

**Date:** 2026-08-04 (repair wave)  
**Scope:** Connection pool hardening and query bounds for admin stability.  
**Prior work:** Index additions documented in [`DATABASE_PERFORMANCE_REPORT.md`](./DATABASE_PERFORMANCE_REPORT.md) (2026-08-02).

---

## Problem

Before this wave, `lib/db/pool.ts` had no per-connection query limits. A single slow admin report or client full-table scan could hold connections indefinitely, causing:

- Pool exhaustion (max 10 connections per container)
- Cascading 503s and hung `/api/admin/*` routes
- Apparent “freezing” when all workers blocked on Postgres

The dashboard previously pulled **all orders** client-side via `supabase.from('orders')`, amplifying load on every admin home visit.

---

## Pool configuration (current)

**File:** `lib/db/pool.ts`

| Setting | Default | Env override | Purpose |
|---------|---------|--------------|---------|
| `max` | 10 | `PG_POOL_MAX` | Max connections per Node process |
| `idleTimeoutMillis` | 30,000 | — | Release idle clients |
| `connectionTimeoutMillis` | **8,000** | `PG_CONNECT_TIMEOUT_MS` | Fail fast if Postgres unreachable |
| `statement_timeout` | **15,000** | `PG_STATEMENT_TIMEOUT_MS` | Kill runaway SELECTs/aggregates |
| `idle_in_transaction_session_timeout` | **30,000** | `PG_IDLE_TX_TIMEOUT_MS` | Drop stuck open transactions |
| `lock_timeout` | **min(15s, 10s) = 10s** | (derived) | Avoid indefinite lock waits |

Session variables are applied on each new pool connection via `SET` in the `connect` handler.

---

## How timeouts interact

```
Client request
    │
    ├─ fetchWithTimeout (15s)     ← browser/admin page ceiling
    │
    └─ API route → pool.query
           │
           ├─ connectionTimeoutMillis (8s)  ← acquire connection
           └─ statement_timeout (15s)       ← query execution
                  lock_timeout (10s)        ← row/table locks
```

If a query exceeds `statement_timeout`, Postgres cancels it; the API returns an error; dashboard sections can fail individually without blocking the whole page.

---

## Dashboard query strategy

**Route:** `GET /api/admin/dashboard`

On plain Postgres, stats and chart data use **single-pass SQL aggregates** instead of loading row sets:

- `count(*)`, `count(*) FILTER`, `sum(...) FILTER`, `count(DISTINCT email)` on `orders`
- 7-day revenue grouped by day with `created_at >= now() - interval '7 days'`

Recent orders, low stock, and top products use bounded `.limit(5)` / `.limit(4)` queries.

Indexes from the 2026-08-02 wave (`idx_orders_payment_status`, `idx_orders_created_at`, etc.) support these filters. See [`DATABASE_PERFORMANCE_REPORT.md`](./DATABASE_PERFORMANCE_REPORT.md) for the full index list.

---

## Orders list cap

**File:** `app/admin/orders/page.tsx`

- `.order('created_at', { ascending: false }).limit(200)` — prevents unbounded client fetch on the orders admin page.

---

## Operational notes

- **Single container:** Effective max DB connections ≈ `PG_POOL_MAX` (10) unless Coolify scales replicas.
- **Env tuning:** Increase `PG_STATEMENT_TIMEOUT_MS` only for known heavy reports; prefer pagination and aggregates.
- **Monitoring:** `GET /api/health` runs `SELECT 1` and verifies `orders` table exists — useful for DB reachability, not query latency.
- **Backups:** fleet-postgres backups under `/data/fleet/backups` (VPS); unrelated to pool but required for recovery.

---

## Remaining risks (not in this wave)

- No EXPLAIN / slow-query log analysis performed.
- Other admin pages (analytics, POS) may still issue large client queries — audit separately if reported.
- Horizontal scale multiplies pool connections; set `PG_POOL_MAX` accordingly if replicas added.

---

## Related docs

- [`FREEZING_AND_LOADING_AUDIT.md`](./FREEZING_AND_LOADING_AUDIT.md)
- [`ADMIN_DASHBOARD_STABILITY_REPORT.md`](./ADMIN_DASHBOARD_STABILITY_REPORT.md)
- [`DATABASE_PERFORMANCE_REPORT.md`](./DATABASE_PERFORMANCE_REPORT.md)

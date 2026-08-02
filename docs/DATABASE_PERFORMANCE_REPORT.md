# Database Performance Report — Efes

**Scope:** 2026-08-02 audit/repair wave — index additions and pool review only. **No N+1 profiling or EXPLAIN analysis** was performed this wave.

---

## Connection Pool

**File:** `lib/db/pool.ts`

| Setting | Value |
|---------|-------|
| Driver | `pg` (`node-postgres`) |
| `max` connections | 10 (default; override `PG_POOL_MAX`) |
| `idleTimeoutMillis` | 30,000 |
| SSL | Only when `PGSSL=require` |
| Connection string | `DATABASE_URL` or `POSTGRES_URL` |
| Type parsers | PostgREST-faithful (date, timestamptz, numeric → float) |

Single shared pool per Node process. Coolify runs one app container per deploy — effective max DB connections ≈ `PG_POOL_MAX` unless scaled horizontally.

---

## Indexes Added (20260802000000_db_audit_repairs.sql)

| Index | Table | Purpose |
|-------|-------|---------|
| `idx_orders_payment_status` | orders | Filter admin queues / reports by payment state |
| `idx_orders_payment_transaction_id` | orders (partial, non-null) | Lookup by gateway reference |
| `idx_orders_email` | orders | Customer order history by email |
| `idx_orders_created_at` | orders (DESC) | Recent orders listing |
| `idx_contact_submissions_created` | contact_submissions | Admin inbox sort |
| `idx_contact_submissions_email` | contact_submissions | Lookup by submitter |
| `idx_payment_callback_events_*` | payment_callback_events | Dedupe, order lookup, status queue |
| `idx_sms_messages_*` | sms_messages | Idempotency, order correlation |

---

## Pre-Existing Index Coverage (audit)

Already present for hot paths:

- `orders.order_number` (unique + idx)
- `products.slug`, `categories.slug`, `pages.slug`, `blog_posts.slug`
- `profiles.email`, `customers.email`, secondary email
- Support/chat email indexes

No duplicate order numbers or product slugs at audit time.

---

## Workload Snapshot (audit time)

| Metric | Value |
|--------|-------|
| Orders | 29 |
| Order items | 17 rows |
| Products | 2 |
| Customers | 96 |
| Categories | 16 |

Small dataset — sequential scans were acceptable pre-index; new indexes prepare for growth and admin filtering.

---

## What Was Not Done

| Item | Status |
|------|--------|
| `EXPLAIN ANALYZE` on checkout/admin queries | Not run |
| N+1 detection in API routes | Not run |
| Connection pool saturation test | Not run |
| Read replica / PgBouncer | Not deployed |
| `VACUUM`/bloat analysis | Not run |

---

## Recommendations

### Short term

1. **Monitor pool errors** — log `timeout acquiring connection` from `pg` under load
2. **Admin order list** — ensure queries filter/sort on indexed columns (`created_at`, `payment_status`, `email`)
3. **Callback dedupe indexes** — keep; high insert rate on busy stores

### Medium term

1. Run `EXPLAIN (ANALYZE, BUFFERS)` on:
   - Order list (admin)
   - Product catalog with variants/images embed
   - Payment callback order lookup by `order_number`
2. Audit supabase-compat embed queries for N+1 (Shape A known pattern)
3. Set `PG_POOL_MAX` in Coolify if horizontal scaling adds replicas

### Long term

1. Consider PgBouncer if connection count grows (multiple workers / instances)
2. Partition or archive `payment_callback_events` if retention exceeds millions of rows
3. Add composite index `(payment_status, created_at DESC)` if admin dashboard filters both frequently

---

## Health Check

`GET /api/health` runs `SELECT 1` and verifies `orders` table exists — lightweight connectivity probe, not a performance benchmark.

# Migration Status Report — Efes

**Migration source:** `supabase/migrations/`  
**Applied to:** `efes` (production), `efes_staging` (leftover DB)  
**Apply method:** Manual `psql` / fleet-postgres on big-vps

---

## Chronological Migration Files

| Order | File | Summary | Applied |
|-------|------|---------|---------|
| 1 | `20260209000000_complete_schema.sql` | Full bootstrap: enums, 40+ public tables, helper functions, `mark_order_paid`, RLS policy definitions, triggers | Yes |
| 2 | `20260309000000_fix_product_images_rls.sql` | Adds SELECT/ALL policies on `product_images` | Yes (policies exist in SQL; RLS not enabled on live) |
| 3 | `20260311000000_rider_role_store_credit.sql` | `rider` enum value; `riders.auth_user_id`; `store_credit` on customers; `store_credit_transactions`; `exchanges` | Yes |
| 4 | `20260802000000_db_audit_repairs.sql` | `contact_submissions`, `payment_callback_events`, `sms_messages`; order indexes; paid txn backfill; hardened `mark_order_paid` | Yes (both DBs) |

---

## Per-Migration Detail

### 20260209000000_complete_schema.sql

- Creates extensions (`uuid-ossp` in `extensions` schema)
- 11 custom enums (order_status, payment_status, user_role, …)
- Core e-commerce tables: catalog, orders, CMS, support, delivery
- Functions: `mark_order_paid`, `upsert_customer_from_order`, `update_customer_stats`, rating triggers
- RLS policies defined in migration SQL (not enforced on live — see Supabase report)
- Trigger: `on_auth_user_created` → `handle_new_user`

### 20260309000000_fix_product_images_rls.sql

- Two policies on `product_images`: public read, staff manage
- **Live note:** table has `relrowsecurity = f`; policies are inert until RLS enabled

### 20260311000000_rider_role_store_credit.sql

- `ALTER TYPE user_role ADD VALUE 'rider'`
- Seeds `roles` row for dispatch rider
- New tables: `store_credit_transactions`, `exchanges`
- RLS enabled in migration for new tables only (also off on live introspection)

### 20260802000000_db_audit_repairs.sql

- **New tables:** `contact_submissions`, `payment_callback_events`, `sms_messages`
- **Indexes:** `idx_orders_payment_status`, `idx_orders_payment_transaction_id`, `idx_orders_email`, `idx_orders_created_at`; contact/SMS/callback indexes
- **Data fix:** backfill `payment_transaction_id` for paid orders from metadata
- **Function replace:** `mark_order_paid` now sets `payment_transaction_id` and preserves existing ref
- Explicitly does **not** enable legacy Supabase guest-order RLS policies

---

## Drift: Migrations vs Live (pre-repair)

| Migration expects | Live had | Status after 20260802 |
|-------------------|----------|------------------------|
| RLS enabled + policies | RLS off everywhere | Unchanged — app auth is control plane |
| `contact_submissions` | Missing | Created |
| `payment_callback_events` | N/A (new) | Created |
| `sms_messages` | N/A (new) | Created |
| `store_credit_transactions`, `exchanges` | Present | OK |

---

## Rollback Notes

Rollback is manual; there is no down-migration file. Order matters.

### 20260802000000_db_audit_repairs.sql

```sql
-- 1. Restore prior mark_order_paid from 20260209000000_complete_schema.sql
--    (copy CREATE OR REPLACE FUNCTION block from that file)

-- 2. Drop new indexes (IF EXISTS safe)
DROP INDEX IF EXISTS idx_orders_payment_status;
DROP INDEX IF EXISTS idx_orders_payment_transaction_id;
DROP INDEX IF EXISTS idx_orders_email;
DROP INDEX IF EXISTS idx_orders_created_at;
-- ... plus contact_submissions / payment_callback_events / sms_messages indexes

-- 3. Drop new tables (data loss for rows inserted after repair)
DROP TABLE IF EXISTS public.sms_messages;
DROP TABLE IF EXISTS public.payment_callback_events;
DROP TABLE IF EXISTS public.contact_submissions;
```

> Backfilled `payment_transaction_id` values are not automatically reverted; restore from backup if needed.

### 20260311000000_rider_role_store_credit.sql

```sql
DROP TABLE IF EXISTS public.exchanges;
DROP TABLE IF EXISTS public.store_credit_transactions;
ALTER TABLE public.customers DROP COLUMN IF EXISTS store_credit;
ALTER TABLE public.riders DROP COLUMN IF EXISTS auth_user_id;
-- Enum value 'rider' cannot be removed without recreating type
```

### 20260309000000_fix_product_images_rls.sql

```sql
DROP POLICY IF EXISTS "Public read access for product images" ON public.product_images;
DROP POLICY IF EXISTS "Staff manage product images" ON public.product_images;
```

### 20260209000000_complete_schema.sql

Full rollback = drop and recreate database from backup. Not practical incrementally.

---

## Verification After Apply

```sql
SELECT count(*) FROM information_schema.tables
 WHERE table_schema = 'public';  -- expect 48 post-repair

SELECT to_regclass('public.contact_submissions');
SELECT to_regclass('public.payment_callback_events');
SELECT proname FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid
 WHERE n.nspname = 'public' AND proname = 'mark_order_paid';

SELECT count(*) FROM orders WHERE payment_status = 'paid'
  AND (payment_transaction_id IS NULL OR payment_transaction_id = '');
-- expect 0 after backfill
```

---

## Next Migrations (not yet written)

- Enable RLS selectively with tested policies
- Wire `sms_messages` inserts from notification layer
- Optional: drop or refresh `efes_staging`

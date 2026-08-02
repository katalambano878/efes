# Database Recovery Guide — Efes

**Production DB:** `efes` on `fleet-postgres` (Docker on big-vps)  
**Backups:** `/data/fleet/backups/efes_YYYY-MM-DD.dump` (nightly)  
**Leftover DB:** `efes_staging` — optional target for test restores

No passwords in this doc. Use fleet/Coolify credentials or `.env` locally.

---

## 1. List Available Backups

```bash
ssh big-vps 'ls -lh /data/fleet/backups/efes_*.dump | tail -5'
```

Pick the dump date **before** the incident if rolling back bad migration data.

---

## 2. Restore to Existing Database (destructive)

**Warning:** Overwrites all objects in target DB. Stop the app first or expect connection errors.

```bash
# On big-vps — replace DATE and TARGET_DB (efes or efes_staging)
DUMP=/data/fleet/backups/efes_2026-08-01.dump
TARGET_DB=efes

# Terminate app connections (adjust role name if different)
docker exec fleet-postgres psql -U postgres -c \
  "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${TARGET_DB}' AND pid <> pg_backend_pid();"

# Drop and recreate empty database
docker exec fleet-postgres psql -U postgres -c "DROP DATABASE IF EXISTS ${TARGET_DB};"
docker exec fleet-postgres psql -U postgres -c "CREATE DATABASE ${TARGET_DB};"

# Restore (custom format dump)
docker exec -i fleet-postgres pg_restore -U postgres -d ${TARGET_DB} --no-owner --role=postgres < "${DUMP}"
```

If dump is plain SQL (`.sql`) instead of custom format:

```bash
docker exec -i fleet-postgres psql -U postgres -d ${TARGET_DB} < /path/to/backup.sql
```

Check format:

```bash
file /data/fleet/backups/efes_2026-08-01.dump
# "PostgreSQL custom database dump" → pg_restore
# ASCII text → psql
```

---

## 3. Restore to New Database (safer drill)

```bash
DUMP=/data/fleet/backups/efes_2026-08-01.dump
TEST_DB=efes_restore_test

docker exec fleet-postgres psql -U postgres -c "DROP DATABASE IF EXISTS ${TEST_DB};"
docker exec fleet-postgres psql -U postgres -c "CREATE DATABASE ${TEST_DB};"
docker exec -i fleet-postgres pg_restore -U postgres -d ${TEST_DB} --no-owner < "${DUMP}"
```

Point a staging app or local `DATABASE_URL` at `efes_restore_test` to validate before touching production.

---

## 4. Post-Restore: Apply Pending Migrations

If backup predates a migration, re-apply from repo:

```bash
# From dev machine with DATABASE_URL set, or on VPS:
psql "$DATABASE_URL" -f supabase/migrations/20260802000000_db_audit_repairs.sql
```

Apply in chronological order. See `MIGRATION_STATUS_REPORT.md` for file list.

---

## 5. Migration Rollback (without full restore)

For reversing **only** the 2026-08-02 repair:

```sql
-- Restore mark_order_paid from 20260209000000_complete_schema.sql first
DROP TABLE IF EXISTS public.sms_messages;
DROP TABLE IF EXISTS public.payment_callback_events;
DROP TABLE IF EXISTS public.contact_submissions;
DROP INDEX IF EXISTS idx_orders_payment_status;
DROP INDEX IF EXISTS idx_orders_payment_transaction_id;
DROP INDEX IF EXISTS idx_orders_email;
DROP INDEX IF EXISTS idx_orders_created_at;
```

Then redeploy app **without** REST auth / payment-events if rolling back code too.

---

## 6. Verification Counts

Run after restore or migration:

```sql
-- Schema presence
SELECT count(*) AS public_tables
FROM information_schema.tables WHERE table_schema = 'public';

-- Core integrity
SELECT count(*) AS orders FROM orders;
SELECT payment_status, count(*) FROM orders GROUP BY 1;
SELECT count(*) AS orphan_items FROM order_items oi
  LEFT JOIN orders o ON o.id = oi.order_id WHERE o.id IS NULL;
SELECT count(*) AS profiles_without_auth FROM profiles p
  LEFT JOIN auth.users u ON u.id = p.id WHERE u.id IS NULL;

-- Payment repair checks
SELECT count(*) AS paid_missing_txn FROM orders
WHERE payment_status = 'paid'
  AND (payment_transaction_id IS NULL OR payment_transaction_id = '');

-- New tables (post 20260802)
SELECT count(*) FROM contact_submissions;
SELECT count(*) FROM payment_callback_events;
```

Compare to last known good audit (`DATABASE_AUDIT_AND_REPAIR_REPORT.md`):

| Check | Expected (2026-08-02 audit) |
|-------|----------------------------|
| Orders | 29 |
| Paid | 3 |
| Guest orders | 23 |
| Orphan order items | 0 |
| Paid missing txn id | 0 (after repair) |

---

## 7. Redeploy App

```bash
ssh big-vps 'sudo fleet deploy efes-app'
```

Confirm health:

```bash
curl -s https://<production-domain>/api/health | jq .
```

Expect `status: "healthy"`, `database_query: "ok"`.

---

## 8. When to Use Which Path

| Situation | Action |
|-----------|--------|
| Bad migration data | Restore pre-migration dump, then re-apply fixed migration |
| Accidental row delete | Point-in-time restore from nearest nightly dump |
| Staging refresh | Restore prod dump into `efes_staging` |
| Code-only rollback | Redeploy prior git SHA; DB may not need restore |

---

## Related Docs

- `MIGRATION_STATUS_REPORT.md` — rollback SQL per migration
- `DATABASE_AUDIT_AND_REPAIR_REPORT.md` — baseline counts
- `STORE_HARDENING_PLAYBOOK.md` — fleet deploy commands

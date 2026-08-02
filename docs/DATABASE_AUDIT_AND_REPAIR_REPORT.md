# Database Audit and Repair Report — Efes

**Store:** Efescloset (`efes`)  
**Date:** 2026-08-02  
**Engine:** PostgreSQL 16.14 on `fleet-postgres` (big-vps)

---

## Environment

| Item | Value |
|------|-------|
| Live Coolify app | `efes-app` (production) |
| Active database | `efes` |
| Leftover database | `efes_staging` (Coolify staging app deleted) |
| Nightly backups | `/data/fleet/backups/efes_YYYY-MM-DD.dump` |
| Architecture | **Shape A** — `pg` Pool + supabase-compat shims |

> Prompts may say "staging"; the live traffic path is production `efes-app` → DB `efes`.

---

## Architecture Baseline

| Layer | Path | Notes |
|-------|------|-------|
| Pool | `lib/db/pool.ts` | `max` 10 (override via `PG_POOL_MAX`); shared in-process |
| Query compat | `lib/db/supabase-compat.ts` | PostgREST-style `.from()` / embeds |
| REST shim | `app/rest/v1/[table]/route.ts` | Gated by `lib/db/rest-auth.ts` |
| Auth | `lib/db/auth.ts` + `auth.users` | Minimal auth schema; admin helpers in supabase-compat |
| Storage | Disk (`STORAGE_ROOT`) | `storage` schema empty on live DB |
| Migrations | `supabase/migrations/` | No Prisma/Drizzle |

---

## Live Introspection (pre-repair, DB `efes`)

| Finding | Detail |
|---------|--------|
| Public tables | 45 |
| Auth | `auth.users` present (1 table) |
| Storage schema | Empty (disk storage in use) |
| RLS | **Disabled** on all 45 public tables (`relrowsecurity = f`) |
| Policies on `orders` | None |
| Orders | 29 total — 26 pending, 3 paid |
| Guest orders | 23 |
| Orphan order items | 0 |
| Auth/profile orphans | 0 |
| Paid missing `payment_transaction_id` | 3 (backfilled by repair migration) |
| Payment metadata keys | 21 Moolre, 4 Hubtel in `orders.metadata` |
| `mark_order_paid` | Present |
| Indexes | `order_number`, email, slug existed; `payment_status`, `payment_transaction_id`, `orders.email`, `created_at` missing |

### Critical security gap (pre-repair)

`/rest/v1/[table]` had **no authorization** while RLS was off → any caller could read/write sensitive tables (orders, profiles, etc.) through the PostgREST shim.

### Schema drift (code vs live DB)

| Expected by code | Live status | Resolution |
|------------------|-------------|------------|
| `contact_submissions` | Missing | Created in repair migration |
| `support_messages` | Missing | Code bug — table is `support_ticket_messages` |
| `payment_attempts` | Missing | Not used; replaced by `payment_callback_events` |
| `webhook_events` | Missing | Not used; replaced by `payment_callback_events` |
| `sms_messages` | Missing | Created in repair migration |

---

## Repairs Applied (2026-08-02 wave)

| # | Change | Location |
|---|--------|----------|
| 1 | `contact_submissions`, `payment_callback_events`, `sms_messages`; order indexes; `mark_order_paid` hardening; paid txn backfill | `supabase/migrations/20260802000000_db_audit_repairs.sql` |
| 2 | REST auth gate — public catalog read; sensitive tables require JWT/service; anon writes blocked except `contact_submissions` POST | `lib/db/rest-auth.ts`, `app/rest/v1/[table]/route.ts` |
| 3 | `auth.admin.createUser` / `updateUserById` / `listUsers` | `lib/db/supabase-compat.ts` |
| 4 | Chat tools → `support_ticket_messages.content` | `lib/chat-tools.ts` |
| 5 | Payment callback event log + idempotency | `lib/payment-events.ts` wired into Moolre/Hubtel callbacks |
| 6 | Safe health check | `GET /api/health` |
| 7 | Paystack | Not implemented (documented N/A) |

Applied to both **`efes`** and **`efes_staging`**.

---

## Post-Repair State

- Public tables: **48** (45 + 3 new)
- REST data plane: gated at app layer
- Paid orders: `payment_transaction_id` backfilled from metadata
- Callback audit trail: `payment_callback_events`
- Late failure callbacks cannot overwrite `paid` orders

---

## Remaining Issues

| Issue | Severity | Notes |
|-------|----------|-------|
| RLS still off on live DB | Medium | App-layer `rest-auth` is the active control; SQL policies exist in migrations but are not enforced |
| `efes_staging` orphan DB | Low | No staging app; consider drop or periodic refresh from prod backup |
| Coupon usage vs orders | Low | Integrity script references non-existent `orders.coupon_code` column |
| Paystack | N/A | No routes or env vars |
| SMS log table unused at runtime | Low | Table exists; provider calls not yet writing rows |
| Ownership filtering on authenticated REST reads | Medium | User JWT allows table reads; row-level ownership still app responsibility |
| No deep query profiling | Info | Index additions only; N+1 not audited this wave |

---

## Readiness

| Area | Status |
|------|--------|
| Production data integrity | Good — no orphans, no duplicate order numbers |
| Payment callbacks | Hardened — amount check, dedupe, paid guard |
| REST exposure | Repaired — auth gate deployed with app |
| Schema/code alignment | Good — missing tables created, chat-tools fixed |
| Disaster recovery | Documented — see `DATABASE_RECOVERY_GUIDE.md` |
| RLS as defense-in-depth | **Not ready** — enable only after policy audit and REST auth verified |

**Verdict:** Safe to operate production with current app deploy (REST auth + callback hardening). Enable Postgres RLS as a follow-up hardening step, not a blocker for this wave.

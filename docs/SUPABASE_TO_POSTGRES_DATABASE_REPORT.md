# Supabase → Postgres Database Report — Efes

**Architecture:** Shape A (supabase-compat shims over plain Postgres)  
**Live DB:** `efes` on `fleet-postgres`  
**Supabase cloud:** Not used at runtime

---

## Feature Replacement Matrix

| Supabase feature | Replacement | Status |
|------------------|-------------|--------|
| PostgREST `/rest/v1` | `app/rest/v1/[table]/route.ts` + `lib/db/supabase-compat.ts` | Done |
| PostgREST RPC | `app/rest/v1/rpc/[fn]/route.ts` | Done |
| Auth API | `app/auth/v1/[...path]` + `lib/db/auth.ts` | Done |
| `auth.users` | Minimal table in `auth` schema | Done |
| `auth.admin.createUser` / `updateUserById` / `listUsers` | `lib/db/supabase-compat.ts` | Done (2026-08-02) |
| Storage API | Disk via `lib/db/storage.ts` + `/storage/v1/object/...` | Done; PG `storage` schema empty |
| Realtime | Not ported | N/A — not used |
| Edge Functions | Next.js API routes | Done |
| `@supabase/supabase-js` (browser) | Points at app origin (`NEXT_PUBLIC_SUPABASE_URL`) | Done |
| Connection | `DATABASE_URL` → `lib/db/pool.ts` | Done |
| RLS | **See below** | Partial — SQL exists, not enforced live |

---

## RLS: Migration SQL vs Live Database

### What migrations define

`20260209000000_complete_schema.sql` and follow-ups create RLS policies for many tables (staff access, service role, guest order reads, etc.). `20260309000000_fix_product_images_rls.sql` adds product image policies. `20260311000000_rider_role_store_credit.sql` enables RLS on new credit/exchange tables.

### What live `efes` had at audit

- **RLS disabled** on all 45 public tables (`relrowsecurity = f`)
- **Zero policies** on `orders`
- Guest-order policies in migration SQL were **never the effective control plane** on this deployment

### Effective replacement: app-layer REST auth

Because RLS was off, the critical fix is **`lib/db/rest-auth.ts`** gating `/rest/v1/[table]`:

| Auth kind | Read | Write |
|-----------|------|-------|
| None / anon | Public catalog tables only | `contact_submissions` POST only |
| User JWT | Broad read (ownership filtering still app-side) | User-scoped tables + staff rules |
| Service key | Full access | Full access |

**Pre-repair risk:** Unauthenticated REST could read/write orders, profiles, etc.  
**Post-repair:** Sensitive tables require JWT or service role.

### Guest order policy (obsolete on live)

Migration SQL includes policies allowing guest access to own orders via anon key + order number. With RLS off, these policies did nothing. With REST auth deployed, guest order access should flow through **API routes** or authenticated flows, not open REST.

---

## Tables: Supabase naming vs Plain Postgres

| Code once expected | Actual table | Notes |
|--------------------|--------------|-------|
| Supabase Storage buckets | Disk paths under `STORAGE_ROOT` | No `storage.objects` |
| `support_messages` | `support_ticket_messages` | Fixed in chat-tools |
| `payment_attempts` / `webhook_events` | `payment_callback_events` | New in repair migration |
| `auth.users` + GoTrue | `auth.users` + JWT shim | Password hashing in-app |

---

## Env Mapping (names only — no values)

| Supabase-era | Plain Postgres |
|--------------|----------------|
| `NEXT_PUBLIC_SUPABASE_URL` | App origin (e.g. production domain) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Still used for anon REST auth tier |
| `SUPABASE_SERVICE_ROLE_KEY` | Service-tier REST + admin client |
| `SUPABASE_JWT_SECRET` / `JWT_SECRET` | Token signing |
| `DATABASE_URL` | `postgresql://…@fleet-postgres:5432/efes` |
| `NEXT_PUBLIC_USE_PLAIN_PG=true` | Enables plain-PG code paths |

Remove unused Supabase project URL/keys from deploy once verified.

---

## What Was Not Migrated

| Item | Status |
|------|--------|
| Supabase Realtime | Not needed |
| Supabase Auth OAuth providers | Only email/password unless added in shim |
| Postgres RLS enforcement | Deferred — enable after policy review |
| Paystack | Not implemented |
| `pg_graphql` / Supabase Studio | Not used |

---

## Recommended Follow-Up

1. Keep REST auth as primary gate; add integration tests for sensitive table denial
2. Optionally enable RLS on highest-risk tables (`orders`, `profiles`, `customers`) as defense-in-depth
3. Remove dead Supabase env vars from Coolify after cutover verification
4. Document per-table ownership rules if browser client still queries user-scoped tables via REST

See also: `DATABASE_AUDIT_AND_REPAIR_REPORT.md`, `STORE_HARDENING_PLAYBOOK.md`

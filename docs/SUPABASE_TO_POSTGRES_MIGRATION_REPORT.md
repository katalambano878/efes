# Supabase → Postgres Migration Report — Efescloset

**Project:** efes · **Shape:** A (shimmed supabase-js)  
**Production:** Coolify `efes-app` · **Branch:** `staging/plain-postgres`  
**Database:** `fleet-postgres` / `efes`

Companion: [`SUPABASE_TO_POSTGRES_MIGRATION_GUIDE.md`](./SUPABASE_TO_POSTGRES_MIGRATION_GUIDE.md) (env + deploy checklist).

---

## Migration map

| Supabase feature | Replacement | Status |
|------------------|-------------|--------|
| **Auth** | GoTrue shim — `lib/db/auth.ts`, `app/auth/v1/[...path]` | Done |
| **REST / PostgREST** | In-process compat — `lib/db/supabase-compat.ts`, `app/rest/v1/*` | Done |
| **Storage** | Local disk — `lib/db/storage.ts`, `app/storage/v1/object/*` | Done |
| **RLS** | App-layer: middleware + `/api/*` + `supabaseAdmin` | Mostly done |
| **RPC** | Postgres functions via `app/rest/v1/rpc/[fn]` | Done |
| **Realtime** | Not used | N/A |
| **Edge Functions** | Next.js API routes | Done |

---

## What works in production

- Browser and server clients point at same origin (`https://www.efescloset.com`), not `*.supabase.co`.
- `lib/supabase-admin.ts` returns in-process PG compat when `DATABASE_URL` is set.
- Middleware verifies JWT with `jose` when `NEXT_PUBLIC_USE_PLAIN_PG=true` (Edge-safe, no `pg`).
- Checkout, payments, cron, delivery, support, chat use `supabaseAdmin` — no anon RLS dependency.
- Storage serves from disk; uploads compressed via `lib/image-compress.ts`; Content-Type from magic bytes.
- Payment RPCs: `mark_order_paid`, `upsert_customer_from_order`, `update_customer_stats` exist and are called from callbacks/verify.

---

## Remaining gaps

### 1. `auth.admin` (staff / riders)

Routes that call `supabaseAdmin.auth.admin.createUser` / `updateUserById`:

- `app/api/admin/staff/route.ts`
- `app/api/delivery/riders/login/route.ts`

Plain-PG compat does **not** implement `auth.admin`. Staff promotion of existing users may work via direct `profiles` update; **new auth user creation fails** until shim is extended.

**Action:** Add `createUser`, `updateUserById`, `deleteUser` to `lib/db/auth.ts` and wire through compat client.

### 2. Client-side `supabase.from` (admin pages)

These admin pages still use browser `@supabase/supabase-js` against `/rest/v1`:

- Dashboard, products, categories, customers, coupons, POS, modules, support tickets/conversations, layout

Storefront critical paths (checkout, order-success, pay) use server APIs instead.

**Action:** Migrate admin reads/writes to `/api/admin/*` routes (pattern already used for products POST/PATCH).

### 3. Schema RLS vs app auth

RLS policies remain in `supabase/migrations/20260209000000_complete_schema.sql` including:

```sql
CREATE POLICY "Enable select for guest orders" ON public.orders
  FOR SELECT USING (user_id IS NULL);
```

With Shape A, anon JWT hitting `/rest/v1/orders` could enumerate guest orders. Mitigated by moving sensitive reads to gated APIs; **policy should be dropped or restricted** in a follow-up migration.

### 4. FAQ / marketing accuracy

- **Paystack:** NOT implemented. FAQ corrected to list Moolre, Hubtel, MoMo, COD only.
- Instalments and loyalty points FAQ entries may overstate current product — review separately.

### 5. Coupon usage timing

`usage_count` increments at checkout creation, not on `payment_status = paid`. Abandoned carts consume limits.

---

## Env mapping (reference)

| Variable | Role |
|----------|------|
| `DATABASE_URL` | Enables plain Postgres pool |
| `NEXT_PUBLIC_USE_PLAIN_PG=true` | Edge middleware JWT path |
| `NEXT_PUBLIC_SUPABASE_URL` | App origin (not Supabase hosted URL) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | JWT for browser client |
| `SUPABASE_SERVICE_ROLE_KEY` | Legacy fallback; PG mode uses in-process admin |
| `AUTH_JWT_SECRET` / `JWT_SECRET` | Token sign/verify |
| `STORAGE_ROOT` | Disk path in container |
| `STORAGE_PUBLIC_URL` / `NEXT_PUBLIC_APP_URL` | Public object URLs |

Never commit real values. Set together in Coolify for `efes-app`.

---

## Verification (Jul 2026)

```bash
BASE=https://www.efescloset.com
APP=efes-app
UUID=f5iff1hstno90gvlr3etzl5i

git rev-parse --short HEAD
ssh big-vps "sudo docker ps --format '{{.Image}} {{.Status}}' | grep $UUID"

curl -s -o /dev/null -w "%{http_code}\n" "$BASE/"
curl -s -o /dev/null -w "%{http_code}\n" "$BASE/shop"
curl -s -o /dev/null -w "%{http_code}\n" "$BASE/admin/login"
curl -s "$BASE/api/storefront/shop?limit=2" | head -c 300
curl -sI "$BASE/storage/v1/object/public/products/<known-file>" | grep -i content-type
```

Manual: login, admin product save, guest checkout, payment callback, single confirmation notification.

---

## Deploy

```bash
git push origin staging/plain-postgres
ssh big-vps "sudo fleet deploy efes-app"
# Confirm image SHA matches commit; no separate staging app.
```

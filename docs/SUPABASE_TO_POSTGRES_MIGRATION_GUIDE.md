# Efescloset — Supabase → plain Postgres

**Shape:** A (shimmed `@supabase/supabase-js` → `lib/db/*` + `/rest/v1`, `/auth/v1`, `/storage/v1`)  
**Prod:** https://www.efescloset.com · Coolify `efes-app` (`f5iff1hstno90gvlr3etzl5i`)  
**Branch:** `staging/plain-postgres`  
**DB:** `fleet-postgres` / database `efes`

> Staging app was deleted. Deploy and verify on **`efes-app`** only.

Related audit docs: [`FULL_SYSTEM_AUDIT.md`](./FULL_SYSTEM_AUDIT.md), [`SUPABASE_TO_POSTGRES_MIGRATION_REPORT.md`](./SUPABASE_TO_POSTGRES_MIGRATION_REPORT.md), [`REPAIR_CHANGELOG.md`](./REPAIR_CHANGELOG.md).

## Env mapping (cutover trio — set together)

| Variable | Value / note |
|----------|----------------|
| `DATABASE_URL` | `postgresql://…@fleet-postgres:5432/efes` |
| `NEXT_PUBLIC_USE_PLAIN_PG` | `true` |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://www.efescloset.com` (app origin, **not** `*.supabase.co`) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | JWT accepted by app auth shim |
| `SUPABASE_SERVICE_ROLE_KEY` | Legacy fallback; PG mode uses in-process admin |
| `AUTH_JWT_SECRET` / `JWT_SECRET` / `SUPABASE_JWT_SECRET` | Align for middleware + GoTrue shim |
| `STORAGE_ROOT` | Disk path inside container (e.g. `/app/storage`) |
| `STORAGE_PUBLIC_URL` | `https://www.efescloset.com` |
| `NEXT_PUBLIC_APP_URL` | `https://www.efescloset.com` |
| `MOOLRE_CALLBACK_SECRET` | Required for Moolre callback when set |
| `CRON_SECRET` | Required for payment-reminder cron |
| `NEWSLETTER_PROMO_CODE` | Optional coupon code for welcome email |

## Architecture notes

- `lib/supabase-admin.ts` → in-process `supabase-compat` when `DATABASE_URL` is set.
- Browser client talks to same origin (`/rest/v1`, `/auth/v1`, `/storage/v1`).
- Middleware uses JWT verification when `NEXT_PUBLIC_USE_PLAIN_PG=true` (Edge-safe); fail-closed without service key on non-PG path.
- Compat must support PostgREST embeds, `!inner`, relation filters (`categories.slug`, `orders.*`), and JSONB `.contains()` (shop preorder + category filters).
- `lib/api-gate.ts` — storefront/admin API routes return 503 if DB backend unavailable.

## Hardening status (Jul 2026)

### Done / in this branch

- [x] Shape A shims + cutover trio live in Coolify
- [x] Compat: relation filters + `.contains` + `!inner` EXISTS
- [x] REST `Content-Range: */N` for empty/head counts
- [x] Auth logout `204` empty body
- [x] Service worker `sw-v2.6-efes-images-*`: no HTML shell cache; `/storage` network-only
- [x] `images.unoptimized: true`; drop `via.placeholder.com` / `*.supabase.co` remotePatterns
- [x] `lib/format-money.ts` + admin/cart money safety
- [x] `app/error.tsx` + `app/admin/error.tsx`
- [x] `lib/query-cache.ts` skips error payloads
- [x] Newsletter `POST /api/newsletter/subscribe` + Footer wire
- [x] Order history: Track (+email), Reorder, Invoice, Help (no alerts)
- [x] Remove Google/Facebook stubs; hide Bulk Restock stub
- [x] Cart trust copy: 24-hour exchanges (not fake 30-day returns)
- [x] `lib/api-gate.ts` + admin/storefront API gates
- [x] Delivery, support, cron, chat, categories → `supabaseAdmin`
- [x] Middleware fail-closed without verifiable auth
- [x] Moolre/Hubtel callback + verify hardening (amount, secret, email, RMSC)
- [x] Checkout server repricing (`POST /api/storefront/checkout`)
- [x] Guest order lookup API (`POST /api/storefront/orders/lookup`)
- [x] Notification idempotency (`metadata.confirmation_sent_at`)
- [x] Cron secret required (`GET /api/cron/payment-reminders`)
- [x] Compress heroes/storage to WebP; storage Content-Type sniff
- [x] FAQ payment copy corrected (no Paystack)
- [x] Audit docs (see `docs/FULL_SYSTEM_AUDIT.md` et al.)

### Remaining (playbook backlog)

- [ ] `auth.admin` in plain-PG compat (staff/rider user creation)
- [ ] Drop or tighten guest order SELECT RLS policy in schema SQL
- [ ] Coupon `usage_count` increment on paid (not at checkout)
- [ ] Sweep admin pages still using browser `supabase.from` → `/api/admin/*`
- [ ] Address book API + checkout autofill (`addresses` table exists)
- [ ] Admin customers live order aggregation (§11)
- [ ] Blog: real CRUD or hide modules
- [ ] `lib/product-seo.ts` + backfill
- [ ] Dockerfile `.next/cache` chown if moving off nixpacks standalone quirks
- [ ] Paystack (not implemented — do not add without product decision)

## Verification

```bash
BASE=https://www.efescloset.com
APP=efes-app
UUID=f5iff1hstno90gvlr3etzl5i

git rev-parse --short HEAD
ssh big-vps "sudo docker ps --format '{{.Image}} {{.Status}}' | grep $UUID"

curl -s -o /dev/null -w "%{http_code}\n" "$BASE/"
curl -s -o /dev/null -w "%{http_code}\n" "$BASE/shop"
curl -s "$BASE/service-worker.js" | head -n 3
curl -s "$BASE/api/storefront/shop?limit=2" | head -c 300
curl -s "$BASE/api/storefront/shop?categorySlugs=two-pieces" | head -c 300
curl -s "$BASE/api/storefront/shop?availability=preorder" | head -c 200
curl -s -X POST "$BASE/api/newsletter/subscribe" \
  -H "Content-Type: application/json" \
  -d '{"email":"verify.newsletter@gmail.com"}'
```

Manual: homepage images, shop count, category filter, PDP, login (no social stubs), admin products/POS without error boundary, payment callback still marks paid, PWA hard-refresh once after deploy.

## Deploy

```bash
git push origin staging/plain-postgres
ssh big-vps "sudo fleet deploy efes-app"
# confirm image SHA matches commit
```

# Efescloset — Full System Audit

**Date:** Jul 2026  
**Production:** https://www.efescloset.com · Coolify `efes-app` (`f5iff1hstno90gvlr3etzl5i`)  
**Branch:** `staging/plain-postgres`  
**Architecture:** Shape A — `@supabase/supabase-js` → plain Postgres shims (`lib/db/*`, `/rest/v1`, `/auth/v1`, `/storage/v1`)

> **Note:** Staging app (`efes-staging`) was deleted. All verification targets production `efes-app` only.

---

## Baseline (Jul 2026)

| Check | Result |
|-------|--------|
| `/` | 200 |
| `/shop` | 200 |
| `/admin/login` | 200 |
| `/rest/v1/*` shim | 200 |
| Pre-repair image SHA | `0a365cd` |
| Post-repair | This audit wave (deploy and confirm live container SHA matches commit) |

Cutover trio live in Coolify: `DATABASE_URL`, `NEXT_PUBLIC_USE_PLAIN_PG=true`, `NEXT_PUBLIC_SUPABASE_URL=https://www.efescloset.com`.

---

## Route inventory (summary)

### Storefront (`app/(store)`)

| Area | Routes |
|------|--------|
| Core | `/`, `/shop`, `/cart`, `/checkout`, `/product/[slug]`, `/categories`, `/preorder`, `/wishlist` |
| Orders | `/order-success`, `/order-tracking`, `/pay/[orderId]` |
| Auth / account | `/auth/login`, `/auth/signup`, `/auth/forgot-password`, `/account/*` |
| Content | `/about`, `/contact`, `/faqs`, `/shipping`, `/returns`, `/blog`, `/help` |
| Support | `/support/ticket`, `/support/tickets` |

### Admin (`app/admin`)

Dashboard, products, categories, orders, POS, customers, coupons, inventory, CMS, analytics, delivery (zones/riders/assignments), support (tickets/conversations/knowledge-base), staff, modules, blog, notifications. Protected by middleware JWT + role check (`admin` / `staff`).

### API (`app/api`)

| Group | Routes |
|-------|--------|
| Storefront | `shop`, `products`, `products/[slug]`, `categories`, `modules`, `search-suggestions`, `coupons`, `checkout`, `orders/lookup` |
| Admin | `me`, `products`, `products/[id]`, `products/[id]/images`, `categories/[id]`, `customers/[id]`, `modules`, `pos/orders`, `pos/exchange`, `upload`, `staff` |
| Payment | `moolre`, `moolre/callback`, `moolre/verify`, `hubtel`, `hubtel/callback`, `hubtel/verify` |
| Delivery | `delivery`, `zones`, `riders`, `riders/login`, `assignments`, `my-deliveries` |
| Support | `tickets`, `tickets/[id]/messages`, `conversations`, `analytics`, `feedback`, `knowledge-base` |
| Other | `chat`, `chat/transcribe`, `chat/speak`, `newsletter/subscribe`, `notifications`, `recaptcha/verify`, `cron/payment-reminders` |

### Shims (Shape A)

| Path | Purpose |
|------|---------|
| `/auth/v1/[...path]` | GoTrue-compatible auth (login, signup, token, user) |
| `/rest/v1/[table]` | PostgREST-compatible CRUD for browser supabase-js |
| `/rest/v1/rpc/[fn]` | RPC proxy (`mark_order_paid`, `upsert_customer_from_order`, etc.) |
| `/storage/v1/object/public/[bucket]/[...path]` | Public disk objects |
| `/storage/v1/object/[bucket]/[...path]` | Authenticated upload/read |
| `/storage/v1/object/sign/[bucket]/[...path]` | HMAC signed URLs |

---

## Supabase migration status matrix

| Concern | Target | Status | Notes |
|---------|--------|--------|-------|
| Auth | GoTrue shim + JWT cookies | **Done** | `lib/db/auth.ts`, `/auth/v1/*`; middleware uses `jose` when `NEXT_PUBLIC_USE_PLAIN_PG=true` |
| REST | PostgREST compat | **Done** | Embeds, `!inner`, relation filters, `.contains`, `Content-Range` |
| Storage | Disk under `STORAGE_ROOT` | **Done** | Magic-byte sniff fixes Content-Type; upload compresses to WebP |
| RLS | App-layer auth + `supabaseAdmin` | **Mostly done** | Sensitive writes use service-role; schema SQL still has guest SELECT policy (see risks) |
| RPC | Postgres functions | **Done** | `mark_order_paid`, `upsert_customer_from_order`, `update_customer_stats` |
| `auth.admin` | Staff/rider provisioning | **Not done** | `createUser` / `updateUserById` missing in plain-PG compat |
| Client `supabase.from` | Admin pages | **Partial** | ~12 admin pages still use browser client against `/rest/v1` |
| Hosted Supabase runtime | Removed | **Done** | No `@supabase/*` in payment/checkout/cron paths |

---

## Critical findings — fixes applied (this wave)

| Finding | Fix |
|---------|-----|
| API routes without DB backend guard | `lib/api-gate.ts` + `requireDbBackend()` on storefront/admin routes |
| Delivery, support, cron, chat, categories using anon client | Switched to `supabaseAdmin` |
| Middleware allowed `/admin` when service key missing (non-PG path) | Fail-closed redirect to login with `server_misconfigured` |
| Moolre callback trusted client amount / optional secret | DB amount required; `MOOLRE_CALLBACK_SECRET` enforced when set |
| Moolre verify trusted redirect flag | Provider API only; email required for ownership |
| Checkout trusted client prices/totals | Server repricing from DB in `POST /api/storefront/checkout` |
| Guest order reads open or via broken RLS | `POST /api/storefront/orders/lookup` (order_number + email) |
| Duplicate SMS/email on callback + verify race | `metadata.confirmation_sent_at` idempotency in `sendOrderConfirmation` |
| Cron endpoint open without secret | `CRON_SECRET` required (`Bearer` header) |
| FAQ claimed Paystack | Corrected to Moolre + Hubtel + MoMo + COD |
| Blank shop images (PNG bytes, wrong Content-Type + nosniff) | Storage sniff + WebP compression; heroes → `.webp` |
| Money/format crashes in admin | `lib/format-money.ts` + `money()` sweep |
| Placeholder URLs (`via.placeholder.com`) | Removed from image paths and `next.config` remotePatterns |

---

## Remaining risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| **`auth.admin` missing on PG** | Staff/rider create flows fail or noop | Implement in `lib/db/auth.ts` + compat; until then use manual DB/user provisioning |
| **Guest RLS policy in schema SQL** | `"Enable select for guest orders" USING (user_id IS NULL)` — any anon client can read all guest orders via `/rest/v1` | App routes use `supabaseAdmin`; drop or tighten policy in DB migration |
| **Paystack not implemented** | No routes, no env vars | Do not document or promise Paystack; Moolre + Hubtel only |
| **Coupon `usage_count` at checkout, not on paid** | Abandoned orders consume coupon quota | Move increment to `mark_order_paid` or payment callback |
| **In-memory rate limits** | Not shared across Coolify replicas | Accept for single-instance; Redis if scaled |
| **Admin pages on browser supabase-js** | Depends on RLS + JWT; brittle for writes | Migrate to `/api/admin/*` pattern |
| **FAQ instalments / loyalty copy** | Marketing claims may not match product | Review with merchant |

---

## Production readiness

**Status: Ready** after manual actions below.

### Required before sign-off

1. Deploy latest `staging/plain-postgres` to `efes-app`; confirm container image SHA = git commit.
2. Coolify env set (names only — do not commit values):
   - Cutover trio: `DATABASE_URL`, `NEXT_PUBLIC_USE_PLAIN_PG`, `NEXT_PUBLIC_SUPABASE_URL`
   - JWT: `AUTH_JWT_SECRET` / `JWT_SECRET`
   - Payments: `MOOLRE_*`, `HUBTEL_*`, `MOOLRE_CALLBACK_SECRET`
   - Ops: `CRON_SECRET`, `RESEND_API_KEY`, `MOOLRE_SMS_API_KEY`
3. Smoke test: home → shop (images load) → PDP → guest checkout → Moolre or Hubtel pay → callback marks paid → confirmation email/SMS once.
4. PWA: hard-refresh once after deploy (service worker `sw-v2.6-efes-images-*`).
5. Cron: schedule `GET /api/cron/payment-reminders` with `Authorization: Bearer $CRON_SECRET`.

### Post-launch backlog

See [`REPAIR_CHANGELOG.md`](./REPAIR_CHANGELOG.md), [`SUPABASE_TO_POSTGRES_MIGRATION_REPORT.md`](./SUPABASE_TO_POSTGRES_MIGRATION_REPORT.md), and playbook § backlog in [`STORE_HARDENING_PLAYBOOK.md`](./STORE_HARDENING_PLAYBOOK.md).

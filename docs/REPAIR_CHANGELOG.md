# Repair Changelog — Jul 2026 Audit Wave

Production target: Coolify `efes-app` · Branch: `staging/plain-postgres`  
Baseline image SHA before wave: `0a365cd`

---

## Security & API gates

- **`lib/api-gate.ts`** — `requireDbBackend()` returns 503 unless plain Postgres or service role configured.
- **Storefront gates** — `requireDbBackend()` on `shop`, `products`, `products/[slug]`, `modules`, `search-suggestions`.
- **Admin gates** — `requireDbBackend()` + JWT admin check on products, upload, categories, customers, modules, POS orders, `me`.
- **`supabaseAdmin` migration** — delivery (`route`, `zones`, `riders`, `assignments`, `my-deliveries`, `riders/login`), support (tickets, messages, conversations, analytics, feedback, knowledge-base), cron, chat, storefront `categories`.

## Middleware

- **Fail-closed** — non–plain-PG path without `SUPABASE_SERVICE_ROLE_KEY` redirects `/admin` to login (`server_misconfigured`); never passes through unverified.

## Payments

- **Moolre init** — amount from DB only; persists `moolre_externalref` for retries.
- **Moolre callback** — secret required when `MOOLRE_CALLBACK_SECRET` set; amount required + match; `mark_order_paid` RPC.
- **Moolre verify** — email required; provider API only (no trusted redirect flag); amount match.
- **Hubtel callback/verify** — RMSC re-verify; settlement amount match; email on verify.
- **Checkout server repricing** — `POST /api/storefront/checkout` reprices from DB; never trusts client totals.

## Orders & notifications

- **`POST /api/storefront/orders/lookup`** — guest-safe read (order_number + email).
- **Order-success** — uses lookup API; verify only when email present; gateway-aware verify endpoint.
- **Notification idempotency** — `metadata.confirmation_sent_at` in `sendOrderConfirmation`.

## Cron

- **`GET /api/cron/payment-reminders`** — `CRON_SECRET` required in all environments (401 without valid Bearer).

## UX / copy / formatting

- **`lib/format-money.ts` + `money()`** — safe numeric display in admin, cart, checkout, pay page.
- **Placeholder sweep** — removed `via.placeholder.com` from components and `next.config` remotePatterns.
- **FAQ** — payment methods corrected (Moolre, Hubtel, MoMo, COD; Paystack removed).

## Performance / images

- Storage Content-Type sniff (PNG/WebP/JPEG magic bytes).
- VPS storage compression (~87 MB → ~7.4 MB).
- Public heroes → WebP.
- **`LazyImage`** — native img for storage URLs; error retry.
- **Service worker** — network-only for `/storage/`; version bump `sw-v2.6-efes-images-*`.

## Documentation

- `docs/FULL_SYSTEM_AUDIT.md`
- `docs/SUPABASE_TO_POSTGRES_MIGRATION_REPORT.md`
- `docs/PAYMENT_AND_CALLBACK_AUDIT.md`
- `docs/PERFORMANCE_REPORT.md`
- `docs/REPAIR_CHANGELOG.md` (this file)
- Updated hardening checklist in `docs/SUPABASE_TO_POSTGRES_MIGRATION_GUIDE.md`

---

## Not in this wave (known follow-ups)

- `auth.admin` for plain-PG (staff/rider user creation)
- Coupon `usage_count` on paid (still increments at checkout)
- Drop guest order SELECT RLS policy in schema
- Admin pages still on browser `supabase.from`
- Paystack integration (not planned in this wave)

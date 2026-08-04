# External Service Timeout Report — Efes

**Date:** 2026-08-04  
**Scope:** Client/server fetch bounds and decoupling of payment/SMS from admin page load.

---

## Utility: `lib/fetch-timeout.ts`

Shared helpers for bounded network waits (browser and server).

### `fetchWithTimeout(input, init?, timeoutMs = 15_000)`

- Wraps `fetch` with `AbortController`.
- Default ceiling: **15 seconds**.
- Respects an outer `init.signal` if provided.
- Clears timer in `finally`.

### `withTimeout(promise, timeoutMs, label?)`

- Races any promise against a timer.
- Rejects with `` `${label} timed out after ${timeoutMs}ms` `` on expiry.
- Used for non-fetch async (e.g. `supabase.auth.getSession()`).

---

## Current usage

| Location | Call | Timeout |
|----------|------|---------|
| `app/admin/layout.tsx` | `withTimeout(getSession())` | 8s |
| `app/admin/layout.tsx` | `fetchWithTimeout('/api/admin/me')` | 12s |
| `app/admin/layout.tsx` | `withTimeout(signOut())` | 5s (fire-and-forget) |
| `app/admin/page.tsx` | `fetchWithTimeout('/api/admin/dashboard')` | 15s |

Other admin pages still use plain `fetch` / `supabase` without timeouts — candidate for future hardening if reported.

---

## Payment gateways

| Gateway | Admin dashboard load | Notes |
|---------|---------------------|-------|
| **Moolre** | Not called | Checkout/callback/verify only |
| **Hubtel** | Not called | Checkout/callback/verify only |
| **Paystack** | **N/A** | Not integrated; removed from FAQ copy (Jul wave) |

Dashboard aggregates read **local DB only** (`orders`, `products`). No provider API round-trips on `/admin` mount.

---

## SMS

- SMS send paths live on order/notification flows and the SMS debugger page.
- **Not invoked** on admin dashboard or layout auth load.
- Prevents third-party SMS latency from blocking admin shell render.

---

## Database as “internal service”

Pool-level timeouts (see [`DATABASE_PERFORMANCE_AND_LOCK_REPORT.md`](./DATABASE_PERFORMANCE_AND_LOCK_REPORT.md)):

| Setting | Default |
|---------|---------|
| `connectionTimeoutMillis` | 8s |
| `statement_timeout` | 15s |
| `idle_in_transaction_session_timeout` | 30s |
| `lock_timeout` | 10s |

These align with client fetch ceilings so hung queries fail before the browser waits indefinitely.

---

## Health endpoint

**`GET /api/health`** — internal DB ping only (`SELECT 1`, schema check). No external provider calls. Safe for public uptime monitors (no secrets in JSON).

---

## Recommendations (future)

| Area | Suggestion |
|------|------------|
| Checkout verify | Add `fetchWithTimeout` on Moolre/Hubtel verify calls |
| Cron jobs | Already gated by `CRON_SECRET`; ensure job-level timeouts |
| Remaining admin pages | Adopt `fetchWithTimeout` on heavy list pages if freezes recur |

---

## Related docs

- [`ADMIN_DASHBOARD_STABILITY_REPORT.md`](./ADMIN_DASHBOARD_STABILITY_REPORT.md)
- [`PAYMENT_AND_CALLBACK_AUDIT.md`](./PAYMENT_AND_CALLBACK_AUDIT.md)
- [`PERFORMANCE_CHANGELOG.md`](./PERFORMANCE_CHANGELOG.md)

# Freezing & Loading Audit — Efescloset

**Date:** 2026-08-04 (repair wave)  
**Baseline:** [`FREEZING_AND_LOADING_BASELINE.md`](./FREEZING_AND_LOADING_BASELINE.md)  
**Environment:** Production Coolify `efes-app` · DB `efes` on fleet-postgres · branch `staging/plain-postgres`  
**Note:** Staging app deleted; production is the sole deploy target.

---

## Summary

The endless **“Loading Admin…”** spinner and intermittent site freezes traced to unbounded client auth waits, full-table dashboard scans, missing loading-state cleanup on several admin pages, and an unbounded Postgres pool. This wave adds hard timeouts, server-side aggregates, and `finally` / `allSettled` guards so no admin route can spin forever.

---

## Root causes (confirmed)

| # | Area | Issue | Impact |
|---|------|-------|--------|
| 1 | `app/admin/layout.tsx` | Global spinner until `getSession()` + `/api/admin/me` complete; **no timeout** | Permanent “Loading Admin…” on slow/hung auth |
| 2 | Same layout | Auth effect re-ran on **every pathname** change | Repeated spinners and redundant API calls |
| 3 | `app/admin/page.tsx` (pre-fix) | Client `supabase.from('orders').select(...)` with **no limit** + sequential follow-ups | Large payload, slow render, pool pressure |
| 4 | `app/admin/roles/page.tsx` | Early `return` on fetch error **without** `setLoading(false)` | Roles page stuck loading |
| 5 | Support pages | Missing `try/finally` on fetch | Support hub / KB / analytics could hang |
| 6 | `lib/db/pool.ts` (pre-fix) | No `statement_timeout`, `connectionTimeoutMillis`, or lock caps | Runaway queries could exhaust connections |
| 7 | `middleware.ts` | Riders rejected on plain-PG while layout allowed them | Redirect churn for delivery staff |

See baseline doc for pre-fix probe timings and architecture diagram of risks.

---

## Fixes applied (2026-08-04)

### Admin shell (`app/admin/layout.tsx`)

- `withTimeout(getSession(), 8s)` and `fetchWithTimeout('/api/admin/me', 12s)`.
- Auth re-check only when entering/leaving login (`pathname === '/admin/login'`), not every admin navigation.
- `authCheckedRef` — after first success, skip global spinner on route changes.
- `try/catch/finally` with **retry UI** on timeout (soft-fail instead of permanent spinner).
- Riders redirected to `/admin/delivery/my-deliveries` when landing on `/admin`.

### Dashboard (`app/admin/page.tsx` + `app/api/admin/dashboard/route.ts`)

- Replaced client full-table scan with **GET `/api/admin/dashboard`**.
- Server uses SQL aggregates on plain Postgres; bounded product/order queries elsewhere.
- Client `fetchWithTimeout(..., 15_000)`; section-level errors returned in `errors` map.
- **No payment gateway or SMS calls** on dashboard load.

### Other admin pages

| Page | Fix |
|------|-----|
| `roles/page.tsx` | `try/finally` → always `setLoading(false)` |
| `support/page.tsx` | `Promise.allSettled` + `try/finally` |
| `support/knowledge-base/page.tsx` | `try/finally` |
| `support/analytics/page.tsx` | `try/finally` |
| `orders/page.tsx` | `.limit(200)` + `try/finally` |

### Middleware

- Plain-PG JWT path allows **rider** role for `/admin/delivery/*` and `/admin` (login redirect target).

### Shared utilities

- **`lib/fetch-timeout.ts`** — `fetchWithTimeout` (AbortController) and `withTimeout` (promise race).

---

## Post-fix targets

| Metric | Target | Mechanism |
|--------|--------|-----------|
| Admin shell after login | < 3s typical | One-time auth + skip re-check on nav |
| Auth hard ceiling | ≤ 20s (8s session + 12s `/me`) | Timeouts + retry UI |
| Dashboard fetch | ≤ 15s | Client timeout; server `statement_timeout` 15s |
| No permanent spinner | Any admin page | `finally` / `allSettled` on all fixed routes |
| Orders list | Max 200 rows | `.limit(200)` |

---

## Health & monitoring

- **`GET /api/health`** — already deployed; checks `DATABASE_URL`, JWT secret, `SELECT 1`, `orders` table presence. No secrets in response.
- Use for uptime probes; does not replace admin UX timeout testing.

---

## Related docs

- [`ADMIN_DASHBOARD_STABILITY_REPORT.md`](./ADMIN_DASHBOARD_STABILITY_REPORT.md)
- [`DATABASE_PERFORMANCE_AND_LOCK_REPORT.md`](./DATABASE_PERFORMANCE_AND_LOCK_REPORT.md)
- [`EXTERNAL_SERVICE_TIMEOUT_REPORT.md`](./EXTERNAL_SERVICE_TIMEOUT_REPORT.md)
- [`PERFORMANCE_CHANGELOG.md`](./PERFORMANCE_CHANGELOG.md)
- [`WEBSITE_STABILITY_CHECKLIST.md`](./WEBSITE_STABILITY_CHECKLIST.md)

# Performance Changelog — Aug 2026 Freezing Wave

**Date:** 2026-08-04  
**Target:** Production Coolify `efes-app` · DB `efes` · branch `staging/plain-postgres`  
**Baseline:** [`FREEZING_AND_LOADING_BASELINE.md`](./FREEZING_AND_LOADING_BASELINE.md)

---

## New files

| File | Purpose |
|------|---------|
| `lib/fetch-timeout.ts` | `fetchWithTimeout` + `withTimeout` |
| `app/api/admin/dashboard/route.ts` | Server-side dashboard aggregates |
| `docs/FREEZING_AND_LOADING_AUDIT.md` | Post-repair audit |
| `docs/DATABASE_PERFORMANCE_AND_LOCK_REPORT.md` | Pool + lock timeouts |
| `docs/ADMIN_DASHBOARD_STABILITY_REPORT.md` | Dashboard migration detail |
| `docs/EXTERNAL_SERVICE_TIMEOUT_REPORT.md` | Timeout matrix |
| `docs/WEBSITE_STABILITY_CHECKLIST.md` | Ongoing verification |
| `docs/PERFORMANCE_CHANGELOG.md` | This file |

---

## Code changes

### Admin shell — `app/admin/layout.tsx`

- Added 8s session and 12s `/api/admin/me` timeouts.
- Auth runs once per session; no re-check on every pathname.
- Timeout → retry UI; `finally` clears loading spinner.
- Rider redirect to `/admin/delivery/my-deliveries`.

### Dashboard — `app/admin/page.tsx`

- Removed client full-table `orders` scan.
- Fetches `GET /api/admin/dashboard` with 15s timeout.
- Handles partial failures via `sectionErrors`.

### Dashboard API — `app/api/admin/dashboard/route.ts`

- SQL aggregates for stats/chart on plain Postgres.
- Bounded queries for recent orders, low stock, top products.
- Section-level error isolation; no payment/SMS calls.

### Postgres pool — `lib/db/pool.ts`

- `connectionTimeoutMillis`: 8s (env: `PG_CONNECT_TIMEOUT_MS`).
- Per-connection `statement_timeout`: 15s (env: `PG_STATEMENT_TIMEOUT_MS`).
- `idle_in_transaction_session_timeout`: 30s (env: `PG_IDLE_TX_TIMEOUT_MS`).
- `lock_timeout`: capped at 10s.

### Middleware — `middleware.ts`

- Rider JWT allowed for `/admin/delivery/*` and `/admin`.

### Admin page hardening

| File | Change |
|------|--------|
| `app/admin/roles/page.tsx` | `finally` → `setLoading(false)` |
| `app/admin/support/page.tsx` | `Promise.allSettled` + `finally` |
| `app/admin/support/knowledge-base/page.tsx` | `try/finally` |
| `app/admin/support/analytics/page.tsx` | `try/finally` |
| `app/admin/orders/page.tsx` | `.limit(200)` + `finally` |

---

## Unchanged (confirmed)

- **`GET /api/health`** — already present; used for DB/env checks.
- **Paystack** — not in use (N/A for this store).
- **Payment/SMS providers** — not called on dashboard load.

---

## Environment

| Item | Value |
|------|-------|
| Production app | `efes-app` (Coolify) |
| Database | `efes` on fleet-postgres |
| Staging app | Deleted |

---

## Prior waves (reference only)

- **Jul 2026:** Image MIME fix, storage compression, payment hardening — [`REPAIR_CHANGELOG.md`](./REPAIR_CHANGELOG.md), [`PERFORMANCE_REPORT.md`](./PERFORMANCE_REPORT.md).
- **2026-08-02:** Index additions — [`DATABASE_PERFORMANCE_REPORT.md`](./DATABASE_PERFORMANCE_REPORT.md).

---

## Post-deploy verification

See [`WEBSITE_STABILITY_CHECKLIST.md`](./WEBSITE_STABILITY_CHECKLIST.md).

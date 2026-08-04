# Admin Dashboard Stability Report — Efes

**Date:** 2026-08-04  
**Environment:** Production `efes-app` · DB `efes`

---

## Incident

Admin users reported the dashboard and shell loading indefinitely (“Loading Admin…”), with buttons disabled and network requests pending. Baseline captured in [`FREEZING_AND_LOADING_BASELINE.md`](./FREEZING_AND_LOADING_BASELINE.md).

---

## Architecture change

### Before

```
Browser (app/admin/page.tsx)
  └─ supabase.from('orders').select(...)     ← full table, no limit
  └─ sequential supabase queries (products, etc.)
  └─ no fetch timeout

Browser (app/admin/layout.tsx)
  └─ getSession() + GET /api/admin/me        ← no timeout
  └─ re-run on every pathname change
```

### After

```
Browser (app/admin/layout.tsx)
  └─ withTimeout(getSession, 8s)
  └─ fetchWithTimeout(/api/admin/me, 12s)
  └─ auth once per session (skip spinner on nav)

Browser (app/admin/page.tsx)
  └─ fetchWithTimeout(/api/admin/dashboard, 15s)
       └─ Server aggregates + bounded queries
       └─ Partial response: { sections, errors, partial }
```

---

## API: `GET /api/admin/dashboard`

**File:** `app/api/admin/dashboard/route.ts`

| Property | Value |
|----------|-------|
| Auth | Bearer token or `sb-access-token` cookie; admin/staff only |
| Payment gateways | **Not called** |
| SMS | **Not called** |
| Response shape | `{ success, sections, errors, partial }` |

### Sections

| Key | Source | Bounds |
|-----|--------|--------|
| `stats` | SQL aggregates on `orders` (plain PG) | Single query |
| `chart` | 7-day paid revenue by day | `interval '7 days'` |
| `recentOrders` | Paid orders, newest first | `.limit(5)` |
| `lowStock` | `products` where `quantity < 10` | `.limit(5)` |
| `topProducts` | Active products sample | `.limit(4)` |

Each section wrapped in its own `try/catch`. Failures populate `errors.<section>` without failing the entire response.

---

## Client behavior

**File:** `app/admin/page.tsx`

- 15s fetch timeout via `fetchWithTimeout`.
- Renders KPI cards, chart, and lists from `json.sections`.
- Surfaces per-section errors from `json.errors` (degraded UI, not blank page).
- `finally` always clears page-level loading state.

---

## Admin shell stability

**File:** `app/admin/layout.tsx`

| Change | Detail |
|--------|--------|
| Session timeout | 8s (`withTimeout`) |
| Profile timeout | 12s (`fetchWithTimeout` → `/api/admin/me`) |
| Nav behavior | Auth effect deps: `[pathname === '/admin/login']` only |
| Cached auth | `authCheckedRef` — no re-spinner after first success |
| Timeout UX | `authError` message + retry instead of infinite spinner |
| Rider routing | `/admin` → `/admin/delivery/my-deliveries` for rider role |

---

## Adjacent admin fixes (same wave)

| Page | Issue | Fix |
|------|-------|-----|
| `roles/page.tsx` | Spinner on error path | `finally { setLoading(false) }` |
| `support/page.tsx` | One failed fetch blocked all | `Promise.allSettled` + `finally` |
| `support/knowledge-base/page.tsx` | Missing cleanup | `try/finally` |
| `support/analytics/page.tsx` | Missing cleanup | `try/finally` |
| `orders/page.tsx` | Unbounded orders | `.limit(200)` + `finally` |

---

## Middleware alignment

**File:** `middleware.ts`

Riders are now allowed through plain-PG JWT verification for:

- `/admin/delivery/*`
- `/admin` (redirect target only)

Matches layout role checks; eliminates redirect loops for delivery staff.

---

## Verification checklist

1. Log in as admin → shell visible within ~3s on healthy network.
2. Dashboard KPIs and chart load; no Paystack/Moolre/Hubtel network calls in DevTools on `/admin`.
3. Simulate slow DB → section errors or auth retry UI within 15–20s, not infinite spinner.
4. Navigate Orders, Support, Roles → no global “Loading Admin…” flash after first auth.
5. Log in as rider → lands on My Deliveries, not login loop.

---

## Related docs

- [`FREEZING_AND_LOADING_AUDIT.md`](./FREEZING_AND_LOADING_AUDIT.md)
- [`EXTERNAL_SERVICE_TIMEOUT_REPORT.md`](./EXTERNAL_SERVICE_TIMEOUT_REPORT.md)
- [`WEBSITE_STABILITY_CHECKLIST.md`](./WEBSITE_STABILITY_CHECKLIST.md)

# Freezing & Loading Baseline — Efescloset

**Date:** 2026-08-04  
**Environment:** Production Coolify `efes-app` (DB `efes` on fleet-postgres) · branch `staging/plain-postgres`  
**Deploy before this wave:** `c01e864`

## Live probes (pre-fix)

| Route | HTTP | Time |
|-------|------|------|
| `/admin/login` | 200 | ~3.1s |
| `/admin` (unauth) | 307 → login | ~1.3s |
| `/api/health` | 200 healthy | — |

## Symptoms reported

- Website freezes intermittently
- Admin dashboard loads indefinitely (“Loading Admin…”)
- Buttons stay disabled / requests pending

## Confirmed architecture risks (pre-fix)

1. **Layout auth gate** (`app/admin/layout.tsx`) — global spinner until `getSession()` + `/api/admin/me` complete; no request timeout; re-ran on every `pathname` change.
2. **Dashboard full-table scan** — client `supabase.from('orders').select(...)` with no limit; sequential follow-up queries; one failure path cleared loading but left empty UI after REST 401.
3. **REST auth gate** (prior wave) — sensitive tables require JWT; empty/missing browser session → 401 (empty data, not always a spinner).
4. **Roles page** — early `return` on error without `setLoading(false)`.
5. **Support pages** — missing try/finally on fetch.
6. **Pool** — no `statement_timeout` / `connectionTimeoutMillis`.
7. **Middleware** — riders rejected on plain-PG while layout allowed them (redirect churn).

## Targets after repair

| Metric | Target |
|--------|--------|
| Admin shell after login | &lt; 3s typical |
| Dashboard API | &lt; 2s with indexes |
| No permanent spinner | Auth/dashboard timeouts ≤ 15s with retry UI |
| Orders list | Max 200 rows per fetch |

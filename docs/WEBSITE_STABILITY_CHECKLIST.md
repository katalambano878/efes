# Website Stability Checklist — Efes

**Date:** 2026-08-04  
**Use after:** Deploys to production `efes-app`, pool/env changes, or admin UX reports.  
**Baseline reference:** [`FREEZING_AND_LOADING_BASELINE.md`](./FREEZING_AND_LOADING_BASELINE.md)

---

## 1. Infrastructure

- [ ] Coolify app `efes-app` running; image SHA matches expected git commit.
- [ ] DB `efes` reachable from app container (`DATABASE_URL` set in Coolify env, not on-disk only).
- [ ] **`GET /api/health`** returns `200` with `"status": "healthy"` and `database_query: "ok"`.
- [ ] Staging app remains deleted; changes go to production only.

---

## 2. Admin auth shell

- [ ] `/admin/login` loads without global spinner blocking the form.
- [ ] Admin login → shell visible within **~3s** on normal network.
- [ ] Navigate between admin sections **without** repeated “Loading Admin…” (auth cached after first success).
- [ ] Throttle network (DevTools) → auth shows **timeout/retry message** within ~20s, not infinite spinner.
- [ ] Invalid/expired session → redirect to login with appropriate query param.

---

## 3. Admin dashboard

- [ ] `/admin` KPI cards and chart populate from **`/api/admin/dashboard`**.
- [ ] DevTools Network: **no** Moolre, Hubtel, Paystack, or SMS API calls on dashboard load.
- [ ] Partial DB failure (if testable) → section error banners; page still usable.
- [ ] Dashboard request completes or fails within **15s** client timeout.

---

## 4. Admin list pages

- [ ] **Orders** — loads ≤ 200 rows; spinner always clears (`finally`).
- [ ] **Roles** — spinner clears even when roles fetch errors.
- [ ] **Support hub** — stats/conversations/tickets load independently (`allSettled`).
- [ ] **Support KB / analytics** — loading state always cleared.

---

## 5. Rider access

- [ ] Rider login → redirected to **My Deliveries**, not login loop.
- [ ] Rider can access `/admin/delivery/*`; blocked from other admin modules per permissions.
- [ ] Middleware and layout agree on rider role (no redirect churn).

---

## 6. Database pool

- [ ] `PG_CONNECT_TIMEOUT_MS` unset or 8000 — connections fail fast if Postgres down.
- [ ] `PG_STATEMENT_TIMEOUT_MS` unset or 15000 — long queries cancelled server-side.
- [ ] No sustained pool exhaustion under normal admin usage (watch app logs / health).

---

## 7. Storefront (smoke)

- [ ] Shop home and product pages load images (see [`PERFORMANCE_REPORT.md`](./PERFORMANCE_REPORT.md)).
- [ ] Checkout and payment callbacks unchanged (Moolre/Hubtel only; Paystack N/A).
- [ ] Guest order lookup still works.

---

## 8. Documentation sync

After significant fixes, update:

| Doc | When |
|-----|------|
| `FREEZING_AND_LOADING_AUDIT.md` | New loading/freeze root cause found |
| `DATABASE_PERFORMANCE_AND_LOCK_REPORT.md` | Pool or index changes |
| `ADMIN_DASHBOARD_STABILITY_REPORT.md` | Dashboard API or auth shell changes |
| `EXTERNAL_SERVICE_TIMEOUT_REPORT.md` | New timeout wrappers or provider decoupling |
| `PERFORMANCE_CHANGELOG.md` | Any performance-related deploy |

---

## Quick probe commands

```bash
# Health (no secrets in output)
curl -sS https://<production-host>/api/health | jq .

# Admin login page (expect 200)
curl -sS -o /dev/null -w "%{http_code} %{time_total}s\n" https://<production-host>/admin/login

# Unauthenticated admin redirect (expect 307)
curl -sS -o /dev/null -w "%{http_code}\n" https://<production-host>/admin
```

Replace `<production-host>` with the live domain (e.g. efescloset production URL).

---

## Related docs

- [`FREEZING_AND_LOADING_AUDIT.md`](./FREEZING_AND_LOADING_AUDIT.md)
- [`STORE_HARDENING_PLAYBOOK.md`](./STORE_HARDENING_PLAYBOOK.md)
- [`SUPABASE_TO_POSTGRES_MIGRATION_GUIDE.md`](./SUPABASE_TO_POSTGRES_MIGRATION_GUIDE.md)

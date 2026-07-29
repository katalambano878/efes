# Payment & Callback Audit — Efescloset

**Providers live:** Moolre, Hubtel  
**Provider NOT implemented:** Paystack (no routes, no env, FAQ corrected)

All paid flows converge on Postgres RPC `mark_order_paid(order_ref, moolre_ref)` — second arg is generic payment reference regardless of gateway.

---

## Gateway summary

| Gateway | Init | Callback | Verify (return URL) | Amount source |
|---------|------|----------|---------------------|---------------|
| **Moolre** | `POST /api/payment/moolre` | `POST /api/payment/moolre/callback` | `POST /api/payment/moolre/verify` | DB `orders.total` only |
| **Hubtel** | `POST /api/payment/hubtel` | `POST /api/payment/hubtel/callback` | `POST /api/payment/hubtel/verify` | DB + server repricing at init |
| **Paystack** | — | — | — | **Not implemented** |
| **COD** | Checkout metadata | — | — | Order total at creation |

---

## Moolre

### Init (`POST /api/payment/moolre`)

- Fetches order by UUID or `order_number`; rejects if already `paid`.
- **Amount always from DB** — never from client body.
- Writes `metadata.payment_method: moolre`, `moolre_externalref` (retry suffix `-R{timestamp}`).
- Callback URL: `{NEXT_PUBLIC_APP_URL}/api/payment/moolre/callback`.

### Callback (`POST /api/payment/moolre/callback`)

| Control | Behavior |
|---------|----------|
| Secret | If `MOOLRE_CALLBACK_SECRET` is set, `body.secret` must match — else 403 |
| Order ref | From `data.externalref`; strips `-R\d+` retry suffix |
| Success | `status=1` + `data.txtstatus=1` (and no failure signals in message) |
| Amount | **Required**; must match `orders.total` within ±0.01 GHS |
| Idempotent | If already `paid`, returns success without side effects |
| Mark paid | `mark_order_paid(order_ref, moolre_ref)` |
| Notify | `sendOrderConfirmation` (with idempotency — see below) |

### Verify (`POST /api/payment/moolre/verify`)

Called from `/order-success` when redirect param `payment_success=true` and order still pending.

| Control | Behavior |
|---------|----------|
| Ownership | **`email` required**; must match order email (404 if mismatch) |
| Trust model | Moolre `/embed/status` API only — **`fromRedirect` not trusted** |
| Amount | API response amount must match order total |
| Mark paid | Same RPC + stats + notifications |

---

## Hubtel

### Init (`POST /api/payment/hubtel`)

- Server repricing: reloads variant/product prices, removes OOS lines, syncs tampered totals.
- Stores `metadata.hubtel_client_reference` for later verify/callback.
- Amount sent to Hubtel = rounded DB total after repricing.

### Callback (`POST /api/payment/hubtel/callback`)

Hubtel does not sign webhooks. Defense in depth:

| Control | Behavior |
|---------|----------|
| Initial parse | ResponseCode / Status from payload |
| **RMSC re-verify** | `checkHubtelStatus(clientReference)` — must return Paid |
| Amount | Settlement (`amountAfterCharges` or `amount`) must match order total |
| Mark paid | `mark_order_paid` with checkout ID as reference |
| Idempotent | Skip if already `paid` |

### Verify (`POST /api/payment/hubtel/verify`)

| Control | Behavior |
|---------|----------|
| Ownership | Valid **email** required; must match order |
| Reference | Requires `metadata.hubtel_client_reference` from init |
| RMSC | Re-query status; Paid + amount match |
| Origin | Cross-origin rejected unless matches `NEXT_PUBLIC_APP_URL` / host |

---

## Paystack

**Not implemented.** No `/api/payment/paystack/*`, no Paystack env vars. Previous FAQ mention removed; live copy lists Moolre, Hubtel, mobile money, and COD only.

---

## Callback & verify route list

| Route | Methods | Auth / gate | Status |
|-------|---------|-------------|--------|
| `/api/payment/moolre` | POST | Rate limit | Live |
| `/api/payment/moolre/callback` | POST, GET (health) | Secret if configured; rate limit | Hardened |
| `/api/payment/moolre/verify` | POST | Email + rate limit | Hardened |
| `/api/payment/hubtel` | POST | Rate limit | Live |
| `/api/payment/hubtel/callback` | POST | RMSC re-verify; rate limit | Hardened |
| `/api/payment/hubtel/verify` | POST | Email + origin + rate limit | Hardened |
| `/api/storefront/checkout` | POST | Server repricing; rate limit | Hardened |
| `/api/storefront/orders/lookup` | POST | order_number + email | Guest-safe read |
| `/api/cron/payment-reminders` | GET | `Bearer CRON_SECRET` required | Hardened |

Service worker explicitly **does not intercept** `/api/payment/*`.

---

## Duplicate notification protection

Race: Moolre/Hubtel callback and `/order-success` verify can both run within seconds.

**Mechanism:** `lib/notifications.ts` → `sendOrderConfirmation`:

1. If incoming order `metadata.confirmation_sent_at` exists → skip.
2. Re-read order from DB; if `confirmation_sent_at` set → skip.
3. **Write** `confirmation_sent_at: ISO timestamp` to `orders.metadata` before sending SMS/email.

Ensures at most one confirmation burst per order even when both callback and verify succeed.

---

## Post-payment side effects

After `mark_order_paid`:

1. `update_customer_stats(p_customer_email, p_order_total)` — best-effort.
2. `sendOrderConfirmation` — SMS (Moolre VAS) + email (Resend).
3. Order status → processing; `payment_status` → paid.

---

## Required env (names only)

| Variable | Used by |
|----------|---------|
| `MOOLRE_API_USER`, `MOOLRE_API_PUBKEY`, `MOOLRE_ACCOUNT_NUMBER` | Moolre init/verify |
| `MOOLRE_CALLBACK_SECRET` | Moolre callback (required when set in Coolify) |
| `MOOLRE_SMS_API_KEY` / `MOOLRE_API_KEY` | SMS |
| `HUBTEL_API_ID`, `HUBTEL_API_KEY`, `HUBTEL_MERCHANT_ACCOUNT_NUMBER` | Hubtel init/verify/callback |
| `RESEND_API_KEY`, `EMAIL_FROM` | Confirmation email |
| `CRON_SECRET` | Payment reminder cron |
| `NEXT_PUBLIC_APP_URL` | Callback/redirect URLs |

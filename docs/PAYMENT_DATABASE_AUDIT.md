# Payment Database Audit — Efes

**Gateways in production:** Moolre, Hubtel  
**Cash on delivery / MoMo:** Checkout paths; DB impact via orders metadata  
**Paystack:** Not implemented (no routes, no env vars)

---

## Data Model

Payment state is **not** normalized into a separate transactions table.

| Store | Table / column | Role |
|-------|----------------|------|
| Canonical status | `orders.payment_status` | pending, paid, failed, refunded, … |
| External reference | `orders.payment_transaction_id` | Set on paid; backfilled from metadata (2026-08-02) |
| Gateway payload | `orders.metadata` jsonb | Moolre/Hubtel keys, verification timestamps, stock flag |
| Callback audit | `payment_callback_events` | Idempotency, amounts, processing status |
| SMS trail | `sms_messages` | Schema ready; runtime writes optional |

### Metadata keys (live counts at audit)

| Key pattern | Orders with key |
|-------------|-----------------|
| Moolre (`moolre_externalref`, `moolre_reference`) | 21 |
| Hubtel (`hubtel_client_reference`, `hubtel_checkout_id`) | 4 |
| Paid orders total | 3 |

---

## Gateway Flows

Both gateways converge on Postgres RPC **`mark_order_paid(order_ref, moolre_ref)`** — second argument is a generic payment reference (name is historical).

| Step | Moolre | Hubtel |
|------|--------|--------|
| Initiate | `/api/payment/moolre/*` | `/api/payment/hubtel/*` |
| Callback | `/api/payment/moolre/callback` | `/api/payment/hubtel/callback` |
| Verify (client) | `/api/payment/moolre/verify` | `/api/payment/hubtel/verify` |
| Mark paid | `mark_order_paid` RPC | Same RPC |
| Post-paid | `update_customer_stats`, `sendOrderConfirmation` | Same |

---

## Callback Event Log

**Module:** `lib/payment-events.ts`  
**Table:** `payment_callback_events`

| Mechanism | Detail |
|-----------|--------|
| Insert on receive | Status `received`; SHA-256 `payload_hash` |
| Dedupe by hash | Unique index `(gateway, payload_hash)` |
| Dedupe by external id | Unique index `(gateway, external_event_id)` |
| Finalize | `processed`, `failed`, `duplicate`, `ignored` |

Wired in both Moolre and Hubtel callback routes before order mutation.

---

## `mark_order_paid` (post-repair)

```sql
mark_order_paid(order_ref text, moolre_ref text DEFAULT NULL) → jsonb
```

| Behavior | Detail |
|----------|--------|
| Idempotent | Re-call on already-paid order returns existing row |
| Sets `payment_status = 'paid'` | Moves order status pending/awaiting_payment → processing |
| Sets `payment_transaction_id` | COALESCE existing, new ref, metadata refs |
| Updates metadata | `moolre_reference`, `payment_verified_at` |
| Stock | Reduces product/variant qty once (`metadata.stock_reduced`) |

Prior version (20260209) did not set `payment_transaction_id`; repair migration backfilled 3 paid rows.

---

## Amount Validation

| Gateway | Rule |
|---------|------|
| **Moolre** | Callback amount required; must match `orders.total` within ±0.01 GHS; reject if missing |
| **Hubtel** | Re-query RMSC status API; compare settlement/`amountAfterCharges` or callback amount to `orders.total` within ±0.01 |

Mismatch → callback event `failed`, order not marked paid.

---

## Duplicate & Late-Failure Protection

| Scenario | Handling |
|----------|----------|
| Duplicate payload | `recordPaymentCallbackEvent` returns `duplicate: true`; finalize as `duplicate`; no re-pay |
| Already paid order | Early return; event `duplicate` |
| Late failure after paid | Moolre: skip metadata overwrite if `payment_status = 'paid'`; Hubtel: `.neq('payment_status', 'paid')` on failure update |
| Failed payment | Sets `payment_status = 'failed'` only when not paid |

---

## Security Controls (callback layer)

| Control | Moolre | Hubtel |
|---------|--------|--------|
| Shared secret | `MOOLRE_CALLBACK_SECRET` when set | N/A (unsigned webhooks) |
| Server re-verify | Callback field checks | RMSC status API |
| Rate limit | `RATE_LIMITS.callback` | Same |

---

## Paystack

| Item | Status |
|------|--------|
| API routes | None |
| Env vars | None |
| DB tables | None |
| `payment-events` type union | Includes `"paystack"` for future use only |

Do not document or promise Paystack in customer-facing copy.

---

## Open Items

| Item | Notes |
|------|-------|
| `sms_messages` population | Table exists; Moolre HTTP SMS not yet logging rows |
| Coupon `usage_count` | May increment at checkout, not on paid — see system audit |
| POS / exchange paths | Also call `mark_order_paid` — same RPC semantics |

---

## Verification Queries

```sql
-- Paid orders should have transaction id post-repair
SELECT order_number, payment_transaction_id, metadata->>'moolre_reference'
FROM orders WHERE payment_status = 'paid';

-- Recent callback events
SELECT gateway, order_number, processing_status, received_at
FROM payment_callback_events ORDER BY received_at DESC LIMIT 20;

-- No paid orders with bad totals (was 0 at audit)
SELECT count(*) FROM orders
WHERE payment_status = 'paid' AND (total <= 0);
```

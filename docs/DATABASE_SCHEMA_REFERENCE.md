# Database Schema Reference — Efes

**Database:** `efes` on `fleet-postgres` (PostgreSQL 16.14)  
**Schemas:** `auth` (minimal), `extensions`, `public`  
**Post-repair public tables:** 48

Payment references live in **`orders.metadata`** (gateway-specific keys) and **`orders.payment_transaction_id`**, with an audit log in **`payment_callback_events`**. There are no separate `payment_transactions`, `payment_attempts`, or `webhook_events` tables.

---

## Auth

| Table | PK | Key columns / FKs |
|-------|----|-------------------|
| `auth.users` | `id` uuid | Email, encrypted password, app metadata; sole auth table |

App creates users via supabase-compat `auth.admin.*`; profile row inserted by `handle_new_user` trigger.

---

## Users & RBAC

| Table | PK | Key FKs / indexes |
|-------|----|-------------------|
| `profiles` | `id` → `auth.users` | `role` (enum: admin, staff, customer, rider); idx on email |
| `roles` | `id` text | RBAC permissions JSON; system roles seeded |
| `addresses` | `id` | `user_id` → auth.users |
| `customers` | `id` | `user_id` → auth.users; unique email; secondary email/phone; `store_credit` |
| `audit_logs` | `id` | `user_id` → auth.users |

---

## Catalog

| Table | PK | Key FKs / indexes |
|-------|----|-------------------|
| `categories` | `id` | `parent_id` self-FK; unique slug |
| `products` | `id` | `category_id`; unique slug; status enum; quantity, pricing |
| `product_images` | `id` | `product_id`; sort order |
| `product_variants` | `id` | `product_id`; name, SKU, quantity |
| `coupons` | `id` | Code, discount type, usage limits |
| `reviews` | `id` | `product_id`, `user_id`; status enum |
| `review_images` | `id` | `review_id` |

---

## Orders & Cart

| Table | PK | Key FKs / indexes |
|-------|----|-------------------|
| `orders` | `id` | Unique `order_number`; `user_id` → auth.users (nullable = guest); `payment_status`, `payment_transaction_id`, `metadata` jsonb; idx: order_number, payment_status, payment_transaction_id, email, created_at |
| `order_items` | `id` | `order_id`, `product_id`, optional `variant_id` |
| `order_status_history` | `id` | `order_id`; status enum |
| `cart_items` | `id` | `user_id`, `product_id`, `variant_id` |
| `wishlist_items` | `id` | `user_id`, `product_id` |

**Guest orders:** `user_id IS NULL` (23 of 29 at audit time).

---

## Payments Metadata

No dedicated payment ledger table. Gateway data is split across:

| Location | Purpose |
|----------|---------|
| `orders.payment_transaction_id` | Canonical external reference after paid |
| `orders.metadata` | Gateway keys: `moolre_reference`, `moolre_externalref`, `hubtel_client_reference`, `hubtel_checkout_id`, `payment_verified_at`, `stock_reduced`, failure fields |
| `payment_callback_events` | Callback/webhook audit + idempotency (added 2026-08-02) |
| `sms_messages` | SMS attempt log (added 2026-08-02; schema ready) |

### `payment_callback_events`

| Column | Notes |
|--------|-------|
| `id` | PK uuid |
| `gateway` | moolre, hubtel, … |
| `external_event_id`, `payload_hash` | Dedupe (partial unique indexes) |
| `order_number`, `amount_expected`, `amount_reported` | Reconciliation |
| `processing_status` | received, processed, ignored, failed, duplicate |
| `received_at`, `processed_at` | Timestamps |

### `sms_messages`

| Column | Notes |
|--------|-------|
| `id` | PK uuid |
| `provider` | Default `moolre` |
| `recipient`, `message_type`, `status` | Delivery tracking |
| `idempotency_key` | Partial unique index |
| `related_order_number`, `related_payment_ref` | Correlation |

**RPC:** `mark_order_paid(order_ref, moolre_ref)` — sets paid status, transaction id, metadata, stock reduction (idempotent).

---

## Support & Chat

| Table | PK | Key FKs |
|-------|----|---------|
| `support_tickets` | `id` | Customer email/user; ticket_number |
| `support_ticket_messages` | `id` | `ticket_id`; `content` column (not `support_messages`) |
| `support_feedback` | `id` | Ticket linkage |
| `support_knowledge_base` | `id` | FAQ articles |
| `support_canned_responses` | `id` | Staff shortcuts |
| `support_escalation_rules` | `id` | Routing rules |
| `support_analytics_daily` | `id` | Aggregates |
| `chat_conversations` | `id` | `user_id`; session state |
| `ai_memory` | `id` | `source_conversation_id` |
| `customer_insights` | `id` | Email-keyed analytics |
| `contact_submissions` | `id` | Public contact form (added 2026-08-02); idx on created_at, email |

---

## Delivery

| Table | PK | Key FKs |
|-------|----|---------|
| `delivery_zones` | `id` | Zone pricing/rules |
| `riders` | `id` | `auth_user_id` → auth.users |
| `delivery_assignments` | `id` | `order_id`, `rider_id`, `zone_id` |
| `delivery_status_history` | `id` | `assignment_id` |

---

## CMS & Store Config

| Table | PK | Notes |
|-------|----|-------|
| `site_settings` | `id` | Key/value store settings |
| `store_settings` | `key` | Singleton config row |
| `store_modules` | `id` | Feature toggles |
| `pages` | `id` | Unique slug |
| `cms_content` | `id` | Structured CMS blocks |
| `banners` | `id` | Homepage/promo banners |
| `blog_posts` | `id` | Unique slug; author → auth.users |
| `navigation_menus` | `id` | Menu containers |
| `navigation_items` | `id` | `menu_id`; hierarchy |

---

## Returns, Exchanges & Store Credit

| Table | PK | Key FKs |
|-------|----|---------|
| `return_requests` | `id` | `order_id`, `user_id` |
| `return_items` | `id` | `return_request_id` |
| `exchanges` | `id` | Original/new order, customer; JSON returned items |
| `store_credit_transactions` | `id` | `customer_id`, optional `order_id`; ledger |

---

## Other

| Table | PK | Notes |
|-------|----|-------|
| `notifications` | `id` | In-app user notifications |

---

## Key Functions

| Function | Purpose |
|----------|---------|
| `mark_order_paid(order_ref, moolre_ref)` | Idempotent paid transition + stock reduction |
| `upsert_customer_from_order(...)` | Customer record from checkout |
| `update_customer_stats(email, total)` | Post-payment customer aggregates |
| `is_admin_or_staff()` | RLS helper (policies not active on live DB) |
| `handle_new_user()` | Profile bootstrap trigger |

---

## Storage

Files are on **disk** (`STORAGE_ROOT`), not Postgres. The `storage` schema has zero tables on live `efes`.

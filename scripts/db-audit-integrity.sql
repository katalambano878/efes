-- Read-only data integrity checks (no mutations). Safe for production.
\echo === MISSING TABLES CODE EXPECTS ===
SELECT t AS expected_table,
       EXISTS (
         SELECT 1 FROM information_schema.tables
         WHERE table_schema = 'public' AND table_name = t
       ) AS exists
FROM (VALUES
  ('contact_submissions'),
  ('support_messages'),
  ('payment_transactions'),
  ('payment_attempts'),
  ('webhook_events'),
  ('sms_messages'),
  ('store_credit_transactions'),
  ('exchanges')
) AS v(t);

\echo === ORDERS PAYMENT STATUS DISTRIBUTION ===
SELECT payment_status, status, count(*) FROM public.orders GROUP BY 1, 2 ORDER BY 3 DESC;

\echo === PAID ORDERS WITHOUT TRANSACTION ID ===
SELECT count(*) AS paid_missing_txn
FROM public.orders
WHERE payment_status = 'paid'
  AND (payment_transaction_id IS NULL OR payment_transaction_id = '');

\echo === DUPLICATE ORDER NUMBERS ===
SELECT order_number, count(*) FROM public.orders
GROUP BY 1 HAVING count(*) > 1;

\echo === DUPLICATE PRODUCT SLUGS ===
SELECT slug, count(*) FROM public.products
GROUP BY 1 HAVING count(*) > 1;

\echo === ORPHAN ORDER ITEMS ===
SELECT count(*) AS orphan_order_items
FROM public.order_items oi
LEFT JOIN public.orders o ON o.id = oi.order_id
WHERE o.id IS NULL;

\echo === ORPHAN PRODUCTS WITHOUT CATEGORY (nullable ok) ===
SELECT count(*) AS products_missing_category
FROM public.products p
LEFT JOIN public.categories c ON c.id = p.category_id
WHERE p.category_id IS NOT NULL AND c.id IS NULL;

\echo === PROFILES WITHOUT AUTH USER ===
SELECT count(*) AS profiles_missing_auth
FROM public.profiles p
LEFT JOIN auth.users u ON u.id = p.id
WHERE u.id IS NULL;

\echo === AUTH USERS WITHOUT PROFILE ===
SELECT count(*) AS auth_without_profile
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE p.id IS NULL;

\echo === NEGATIVE / ZERO TOTALS ON PAID ===
SELECT count(*) AS paid_bad_totals
FROM public.orders
WHERE payment_status = 'paid' AND (total IS NULL OR total <= 0);

\echo === GUEST ORDERS COUNT ===
SELECT count(*) AS guest_orders FROM public.orders WHERE user_id IS NULL;

\echo === METADATA PAYMENT KEYS SAMPLE (counts only) ===
SELECT
  count(*) FILTER (WHERE metadata ? 'moolre_externalref' OR metadata ? 'moolre_reference') AS moolre_meta,
  count(*) FILTER (WHERE metadata ? 'hubtel_client_reference' OR metadata ? 'hubtel_checkout_id') AS hubtel_meta,
  count(*) FILTER (WHERE metadata ? 'confirmation_sent_at') AS confirmation_sent,
  count(*) FILTER (WHERE payment_status = 'paid') AS paid_orders
FROM public.orders;

\echo === COUPON USAGE VS ORDERS ===
SELECT c.code, c.usage_count,
       (SELECT count(*) FROM public.orders o
        WHERE o.coupon_code = c.code OR o.metadata->>'coupon_code' = c.code) AS order_refs
FROM public.coupons c
ORDER BY c.usage_count DESC NULLS LAST
LIMIT 20;

\echo === INDEX COVERAGE KEY LOOKUPS ===
SELECT indexname FROM pg_indexes
WHERE schemaname = 'public'
  AND (
    indexdef ILIKE '%order_number%'
    OR indexdef ILIKE '%payment_transaction%'
    OR indexdef ILIKE '%email%'
    OR indexdef ILIKE '%slug%'
  )
ORDER BY 1;

\echo === mark_order_paid EXISTS ===
SELECT EXISTS (
  SELECT 1 FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'mark_order_paid'
) AS mark_order_paid_exists;

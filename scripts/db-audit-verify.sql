SELECT table_name FROM information_schema.tables
WHERE table_schema='public'
  AND table_name IN ('contact_submissions','payment_callback_events','sms_messages')
ORDER BY 1;

SELECT count(*) AS paid_missing_txn
FROM orders
WHERE payment_status='paid'
  AND (payment_transaction_id IS NULL OR payment_transaction_id='');

SELECT indexname FROM pg_indexes
WHERE schemaname='public'
  AND indexname IN (
    'idx_orders_payment_status',
    'idx_orders_payment_transaction_id',
    'idx_orders_email',
    'idx_orders_created_at',
    'idx_payment_callback_events_dedupe'
  )
ORDER BY 1;

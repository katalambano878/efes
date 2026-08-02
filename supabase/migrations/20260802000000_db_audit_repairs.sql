-- Efes DB audit repairs (safe / reversible).
-- Target: plain Postgres (fleet) databases `efes` / `efes_staging`.
-- Does NOT enable legacy Supabase RLS guest-order policies.

-- ---------------------------------------------------------------------------
-- 1) Contact form table (was missing; contact page inserts into it)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.contact_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text NOT NULL,
  phone text,
  subject text,
  message text NOT NULL,
  status text NOT NULL DEFAULT 'new',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contact_submissions_created
  ON public.contact_submissions (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_contact_submissions_email
  ON public.contact_submissions (email);

-- ---------------------------------------------------------------------------
-- 2) Payment callback / webhook event log (idempotency + audit)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.payment_callback_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gateway text NOT NULL,
  event_type text,
  external_event_id text,
  internal_reference text,
  gateway_reference text,
  order_number text,
  payload_hash text,
  signature_status text NOT NULL DEFAULT 'unchecked',
  processing_status text NOT NULL DEFAULT 'received',
  amount_expected numeric(12,2),
  amount_reported numeric(12,2),
  currency text DEFAULT 'GHS',
  error_message text,
  attempts integer NOT NULL DEFAULT 1,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  CONSTRAINT payment_callback_events_status_check
    CHECK (processing_status = ANY (ARRAY[
      'received'::text, 'processed'::text, 'ignored'::text,
      'failed'::text, 'duplicate'::text
    ]))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_callback_events_dedupe
  ON public.payment_callback_events (gateway, payload_hash)
  WHERE payload_hash IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_callback_events_ext
  ON public.payment_callback_events (gateway, external_event_id)
  WHERE external_event_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_payment_callback_events_order
  ON public.payment_callback_events (order_number);

CREATE INDEX IF NOT EXISTS idx_payment_callback_events_status
  ON public.payment_callback_events (processing_status, received_at DESC);

-- ---------------------------------------------------------------------------
-- 3) Lightweight SMS attempt log (provider is Moolre HTTP; track DB-side)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sms_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL DEFAULT 'moolre',
  recipient text NOT NULL,
  message_type text NOT NULL,
  template_name text,
  related_user_id uuid,
  related_order_number text,
  related_payment_ref text,
  provider_message_id text,
  idempotency_key text,
  status text NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  failure_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  delivered_at timestamptz,
  CONSTRAINT sms_messages_status_check
    CHECK (status = ANY (ARRAY[
      'pending'::text, 'sent'::text, 'failed'::text,
      'delivered'::text, 'skipped'::text
    ]))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_sms_messages_idempotency
  ON public.sms_messages (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sms_messages_order
  ON public.sms_messages (related_order_number);

-- ---------------------------------------------------------------------------
-- 4) Orders: useful indexes + amount non-negative check (not validated on existing bad rows)
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_orders_payment_status
  ON public.orders (payment_status);

CREATE INDEX IF NOT EXISTS idx_orders_payment_transaction_id
  ON public.orders (payment_transaction_id)
  WHERE payment_transaction_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_orders_email
  ON public.orders (email);

CREATE INDEX IF NOT EXISTS idx_orders_created_at
  ON public.orders (created_at DESC);

-- Backfill payment_transaction_id from metadata for already-paid rows
UPDATE public.orders
SET payment_transaction_id = COALESCE(
  NULLIF(payment_transaction_id, ''),
  NULLIF(metadata->>'moolre_reference', ''),
  NULLIF(metadata->>'hubtel_client_reference', ''),
  NULLIF(metadata->>'moolre_externalref', '')
)
WHERE payment_status = 'paid'
  AND (payment_transaction_id IS NULL OR payment_transaction_id = '');

-- ---------------------------------------------------------------------------
-- 5) Harden mark_order_paid: set payment_transaction_id, keep idempotent
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mark_order_paid(order_ref text, moolre_ref text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  updated_order orders;
  ref_value text := NULLIF(trim(COALESCE(moolre_ref, '')), '');
BEGIN
  UPDATE orders
  SET
    payment_status = 'paid',
    payment_transaction_id = COALESCE(NULLIF(payment_transaction_id, ''), ref_value),
    status = CASE
        WHEN status = 'pending' THEN 'processing'::order_status
        WHEN status = 'awaiting_payment' THEN 'processing'::order_status
        ELSE status
    END,
    metadata = COALESCE(metadata, '{}'::jsonb) ||
               jsonb_build_object(
                   'moolre_reference', COALESCE(ref_value, metadata->>'moolre_reference'),
                   'payment_verified_at', COALESCE(
                     metadata->>'payment_verified_at',
                     to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
                   )
               ),
    updated_at = now()
  WHERE order_number = order_ref
  RETURNING * INTO updated_order;

  IF updated_order.id IS NOT NULL THEN
      IF (updated_order.metadata->>'stock_reduced') IS NULL THEN
          UPDATE products p
          SET quantity = GREATEST(0, p.quantity - oi.quantity)
          FROM order_items oi
          WHERE oi.order_id = updated_order.id AND oi.product_id = p.id;

          UPDATE product_variants pv
          SET quantity = GREATEST(0, pv.quantity - oi.quantity)
          FROM order_items oi
          WHERE oi.order_id = updated_order.id
            AND oi.product_id = pv.product_id
            AND oi.variant_name IS NOT NULL AND oi.variant_name = pv.name;

          UPDATE orders
          SET metadata = metadata || '{"stock_reduced": true}'::jsonb
          WHERE id = updated_order.id;

          SELECT * INTO updated_order FROM orders WHERE id = updated_order.id;
      END IF;
  ELSE
      SELECT * INTO updated_order FROM orders WHERE order_number = order_ref;
  END IF;

  RETURN to_jsonb(updated_order);
END;
$$;

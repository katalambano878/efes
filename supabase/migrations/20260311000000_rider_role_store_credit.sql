-- ============================================================================
-- Rider role, store credit (top-up), and exchange/restock support
-- Apply this migration before using:
--   - Dispatch rider role (restricted admin login)
--   - Customer store credit / top-up during exchanges
--   - Exchange + restock workflow
-- NOTE: "ALTER TYPE ... ADD VALUE" cannot run inside a transaction block in
--       some Postgres versions. If applying manually, run the ALTER TYPE line
--       on its own first, then run the rest.
-- ============================================================================

-- 1. Add 'rider' to the user_role enum -------------------------------------
ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'rider';

-- 2. Seed the 'rider' RBAC role --------------------------------------------
INSERT INTO public.roles (id, name, description, enabled, is_system, permissions)
VALUES (
  'rider',
  'Dispatch Rider',
  'Delivery rider with access only to their own assigned deliveries',
  true,
  true,
  '{"my_deliveries": true}'
)
ON CONFLICT (id) DO UPDATE
  SET permissions = EXCLUDED.permissions,
      description = EXCLUDED.description;

-- 3. Link a rider login (auth user) to a rider record ----------------------
ALTER TABLE public.riders
  ADD COLUMN IF NOT EXISTS auth_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_riders_auth_user_id ON public.riders (auth_user_id);

-- 4. Customer store credit / wallet (top-up balance) -----------------------
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS store_credit numeric NOT NULL DEFAULT 0;

-- 5. Store credit ledger (audit of top-ups, exchange credits, usage) -------
CREATE TABLE IF NOT EXISTS public.store_credit_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid REFERENCES public.customers(id) ON DELETE CASCADE,
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  amount numeric NOT NULL,                    -- positive = credit added, negative = credit used
  balance_after numeric,
  type text NOT NULL DEFAULT 'adjustment',    -- topup | exchange_credit | usage | adjustment
  reason text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_store_credit_tx_customer ON public.store_credit_transactions (customer_id);

ALTER TABLE public.store_credit_transactions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Staff manage store credit tx" ON public.store_credit_transactions
    FOR ALL USING (public.is_admin_or_staff()) WITH CHECK (public.is_admin_or_staff());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Service role store credit tx" ON public.store_credit_transactions
    FOR ALL USING (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 6. Exchanges (records a return->restock + new item + top-up) --------------
CREATE TABLE IF NOT EXISTS public.exchanges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  original_order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  new_order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  returned_items jsonb DEFAULT '[]'::jsonb,   -- [{product_id, name, quantity, unit_price, restocked}]
  returned_value numeric DEFAULT 0,
  new_items_value numeric DEFAULT 0,
  topup_amount numeric DEFAULT 0,             -- extra cash paid by customer
  credit_used numeric DEFAULT 0,
  credit_issued numeric DEFAULT 0,            -- leftover value returned as store credit
  channel text DEFAULT 'pos',                 -- pos | website
  status text DEFAULT 'completed',
  notes text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_exchanges_customer ON public.exchanges (customer_id);

ALTER TABLE public.exchanges ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Staff manage exchanges" ON public.exchanges
    FOR ALL USING (public.is_admin_or_staff()) WITH CHECK (public.is_admin_or_staff());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Service role exchanges" ON public.exchanges
    FOR ALL USING (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 7. Riders RLS: allow a rider to read/update their own assignments ---------
DO $$ BEGIN
  CREATE POLICY "Rider reads own assignments" ON public.delivery_assignments
    FOR SELECT USING (
      rider_id IN (SELECT id FROM public.riders WHERE auth_user_id = auth.uid())
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Rider updates own assignments" ON public.delivery_assignments
    FOR UPDATE USING (
      rider_id IN (SELECT id FROM public.riders WHERE auth_user_id = auth.uid())
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

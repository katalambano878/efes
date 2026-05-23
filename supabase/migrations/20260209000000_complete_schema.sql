-- ============================================================================
-- COMPLETE E-COMMERCE DATABASE SCHEMA
-- 
-- This single migration creates the entire database from scratch.
-- Run this on a fresh Supabase project to get the full schema.
--
-- To duplicate this project for a new store:
--   1. Create a new Supabase project
--   2. Run this migration in the Supabase SQL Editor
--   3. Update .env.local with the new project URL and keys
--   4. Update branding in site_settings / CMS content
--   5. Create an admin user and set their role in profiles
--
-- No store-specific data or branding is included.
-- ============================================================================

-- ============================================================================
-- 1. EXTENSIONS
-- ============================================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;

-- ============================================================================
-- 2. CUSTOM ENUM TYPES
-- ============================================================================
CREATE TYPE user_role AS ENUM ('admin', 'staff', 'customer');
CREATE TYPE gender_type AS ENUM ('male', 'female', 'other', 'prefer_not_to_say');
CREATE TYPE address_type AS ENUM ('shipping', 'billing', 'both');
CREATE TYPE product_status AS ENUM ('active', 'draft', 'archived');
CREATE TYPE category_status AS ENUM ('active', 'inactive');
CREATE TYPE order_status AS ENUM ('pending', 'awaiting_payment', 'processing', 'shipped', 'dispatched_to_rider', 'delivered', 'cancelled', 'refunded');
CREATE TYPE payment_status AS ENUM ('pending', 'paid', 'failed', 'refunded', 'partially_refunded');
CREATE TYPE discount_type AS ENUM ('percentage', 'fixed_amount', 'free_shipping');
CREATE TYPE review_status AS ENUM ('pending', 'approved', 'rejected');
CREATE TYPE blog_status AS ENUM ('draft', 'published', 'archived');
CREATE TYPE return_status AS ENUM ('pending', 'approved', 'rejected', 'processing', 'completed');

-- ============================================================================
-- 3. HELPER FUNCTIONS (needed before tables for RLS policies & triggers)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.is_admin_or_staff()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
    AND role IN ('admin', 'staff')
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, role)
  VALUES (NEW.id, NEW.email, 'customer')
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_product_rating_stats()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE products
  SET rating_avg = (
    SELECT COALESCE(AVG(rating), 0)
    FROM reviews
    WHERE product_id = COALESCE(NEW.product_id, OLD.product_id)
    AND status = 'approved'
  ),
  review_count = (
    SELECT COUNT(*)
    FROM reviews
    WHERE product_id = COALESCE(NEW.product_id, OLD.product_id)
    AND status = 'approved'
  ),
  updated_at = now()
  WHERE id = COALESCE(NEW.product_id, OLD.product_id);
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE OR REPLACE FUNCTION public.upsert_customer_from_order(
  p_email text,
  p_phone text,
  p_full_name text,
  p_first_name text,
  p_last_name text,
  p_user_id uuid DEFAULT NULL,
  p_address jsonb DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_customer_id UUID;
  v_existing_email TEXT;
  v_existing_phone TEXT;
  v_existing_secondary_email TEXT;
  v_existing_secondary_phone TEXT;
BEGIN
  SELECT id, email, phone, secondary_email, secondary_phone 
  INTO v_customer_id, v_existing_email, v_existing_phone, v_existing_secondary_email, v_existing_secondary_phone 
  FROM customers 
  WHERE email = p_email OR secondary_email = p_email 
  LIMIT 1;
  
  IF v_customer_id IS NULL AND p_phone IS NOT NULL AND p_phone != '' THEN
    SELECT id, email, phone, secondary_email, secondary_phone 
    INTO v_customer_id, v_existing_email, v_existing_phone, v_existing_secondary_email, v_existing_secondary_phone 
    FROM customers 
    WHERE phone = p_phone OR secondary_phone = p_phone 
    LIMIT 1;
  END IF;
  
  IF v_customer_id IS NULL THEN
    INSERT INTO customers (email, phone, full_name, first_name, last_name, user_id, default_address)
    VALUES (p_email, p_phone, p_full_name, p_first_name, p_last_name, p_user_id, p_address)
    RETURNING id INTO v_customer_id;
  ELSE
    UPDATE customers SET
      secondary_email = CASE 
        WHEN p_email IS NOT NULL AND p_email != '' AND p_email != v_existing_email 
             AND (v_existing_secondary_email IS NULL OR v_existing_secondary_email = '' OR v_existing_secondary_email != p_email)
        THEN p_email ELSE secondary_email
      END,
      secondary_phone = CASE 
        WHEN p_phone IS NOT NULL AND p_phone != '' AND p_phone != v_existing_phone 
             AND (v_existing_secondary_phone IS NULL OR v_existing_secondary_phone = '' OR v_existing_secondary_phone != p_phone)
        THEN p_phone ELSE secondary_phone
      END,
      full_name = COALESCE(NULLIF(p_full_name, ''), full_name),
      first_name = COALESCE(NULLIF(p_first_name, ''), first_name),
      last_name = COALESCE(NULLIF(p_last_name, ''), last_name),
      user_id = COALESCE(p_user_id, user_id),
      default_address = COALESCE(p_address, default_address),
      updated_at = NOW()
    WHERE id = v_customer_id;
  END IF;
  
  RETURN v_customer_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_customer_stats(p_customer_email text, p_order_total numeric)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE customers
  SET total_orders = total_orders + 1,
      total_spent = total_spent + p_order_total,
      last_order_at = NOW(),
      updated_at = NOW()
  WHERE email = p_customer_email;
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_order_paid(order_ref text, moolre_ref text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  updated_order orders;
BEGIN
  UPDATE orders
  SET 
    payment_status = 'paid',
    status = CASE 
        WHEN status = 'pending' THEN 'processing'::order_status
        WHEN status = 'awaiting_payment' THEN 'processing'::order_status
        ELSE status
    END,
    metadata = COALESCE(metadata, '{}'::jsonb) || 
               jsonb_build_object(
                   'moolre_reference', moolre_ref,
                   'payment_verified_at', to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
               )
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
      END IF;
  ELSE
      SELECT * INTO updated_order FROM orders WHERE order_number = order_ref;
  END IF;

  RETURN to_jsonb(updated_order);
END;
$$;

CREATE OR REPLACE FUNCTION public.reduce_stock_on_order(p_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE products p
  SET quantity = GREATEST(p.quantity - oi.quantity, 0), updated_at = now()
  FROM order_items oi
  WHERE oi.order_id = p_order_id AND oi.product_id = p.id;

  UPDATE product_variants pv
  SET quantity = GREATEST(pv.quantity - oi.quantity, 0), updated_at = now()
  FROM order_items oi
  WHERE oi.order_id = p_order_id
    AND oi.product_id = pv.product_id
    AND oi.variant_name IS NOT NULL AND oi.variant_name = pv.name;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_all_customer_emails()
RETURNS TABLE(email text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT DISTINCT e.email
  FROM (
    SELECT c.email FROM customers c WHERE c.email IS NOT NULL AND c.email != ''
    UNION
    SELECT c.secondary_email FROM customers c WHERE c.secondary_email IS NOT NULL AND c.secondary_email != ''
  ) e
  ORDER BY e.email;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_all_customer_phones()
RETURNS TABLE(phone text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT DISTINCT p.phone
  FROM (
    SELECT c.phone FROM customers c WHERE c.phone IS NOT NULL AND c.phone != ''
    UNION
    SELECT c.secondary_phone FROM customers c WHERE c.secondary_phone IS NOT NULL AND c.secondary_phone != ''
  ) p
  ORDER BY p.phone;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_order_for_tracking(p_order_number text, p_email text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  o public.orders;
  items jsonb;
  result jsonb;
  search_term text;
BEGIN
  search_term := trim(p_order_number);
  IF search_term = '' OR p_email IS NULL OR trim(p_email) = '' THEN
    RETURN NULL;
  END IF;

  SELECT * INTO o FROM public.orders WHERE order_number = search_term LIMIT 1;
  IF o.id IS NULL THEN
    SELECT * INTO o FROM public.orders WHERE metadata->>'tracking_number' = search_term LIMIT 1;
  END IF;
  IF o.id IS NULL THEN RETURN NULL; END IF;
  IF lower(trim(o.email)) <> lower(trim(p_email)) THEN RETURN NULL; END IF;

  SELECT jsonb_agg(
    jsonb_build_object(
      'id', oi.id, 'product_name', oi.product_name, 'variant_name', oi.variant_name,
      'quantity', oi.quantity, 'unit_price', oi.unit_price,
      'metadata', COALESCE(oi.metadata, '{}'::jsonb) || jsonb_build_object(
        'image', (SELECT pi.url FROM public.product_images pi WHERE pi.product_id = oi.product_id LIMIT 1)
      )
    )
  ) INTO items FROM public.order_items oi WHERE oi.order_id = o.id;

  IF items IS NULL THEN items := '[]'::jsonb; END IF;

  result := jsonb_build_object(
    'id', o.id, 'order_number', o.order_number, 'status', o.status,
    'payment_status', o.payment_status, 'total', o.total, 'email', o.email,
    'created_at', o.created_at, 'shipping_address', COALESCE(o.shipping_address, '{}'::jsonb),
    'metadata', COALESCE(o.metadata, '{}'::jsonb), 'order_items', items
  );
  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.upsert_chat_conversation(
  p_session_id text,
  p_user_id uuid DEFAULT NULL,
  p_messages jsonb DEFAULT '[]'::jsonb,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id uuid;
BEGIN
  SELECT id INTO v_id FROM public.chat_conversations WHERE session_id = p_session_id LIMIT 1;
  IF v_id IS NOT NULL THEN
    UPDATE public.chat_conversations
    SET messages = p_messages, metadata = p_metadata, user_id = COALESCE(p_user_id, user_id), updated_at = now()
    WHERE id = v_id;
    RETURN v_id;
  ELSE
    INSERT INTO public.chat_conversations (session_id, user_id, messages, metadata)
    VALUES (p_session_id, p_user_id, p_messages, p_metadata)
    RETURNING id INTO v_id;
    RETURN v_id;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_chat_conversation(p_session_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'id', id, 'session_id', session_id, 'user_id', user_id,
    'messages', messages, 'metadata', metadata,
    'created_at', created_at, 'updated_at', updated_at
  ) INTO v_result
  FROM public.chat_conversations WHERE session_id = p_session_id LIMIT 1;
  RETURN COALESCE(v_result, NULL);
END;
$$;

CREATE OR REPLACE FUNCTION public.generate_ticket_number()
RETURNS text
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  v_num integer;
BEGIN
  SELECT COALESCE(MAX(CAST(SUBSTRING(ticket_number FROM '#(\d+)$') AS integer)), 0) + 1
  INTO v_num FROM support_tickets;
  RETURN 'TKT-' || LPAD(v_num::text, 5, '0');
END;
$$;

CREATE OR REPLACE FUNCTION public.get_ai_memories(
  p_customer_email text DEFAULT NULL,
  p_customer_id uuid DEFAULT NULL
)
RETURNS SETOF ai_memory
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT * FROM ai_memory
  WHERE (p_customer_email IS NOT NULL AND customer_email = p_customer_email)
     OR (p_customer_id IS NOT NULL AND customer_id = p_customer_id)
  ORDER BY created_at DESC
  LIMIT 50;
END;
$$;

CREATE OR REPLACE FUNCTION public.save_ai_memory(
  p_customer_email text DEFAULT NULL,
  p_customer_id uuid DEFAULT NULL,
  p_memory_type text DEFAULT 'context',
  p_content text DEFAULT '',
  p_importance text DEFAULT 'normal',
  p_source_conversation_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO ai_memory (customer_email, customer_id, memory_type, content, importance, source_conversation_id)
  VALUES (p_customer_email, p_customer_id, p_memory_type, p_content, p_importance, p_source_conversation_id)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.search_chat_conversations(
  p_search text DEFAULT NULL,
  p_sentiment text DEFAULT NULL,
  p_resolved text DEFAULT NULL,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS SETOF chat_conversations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT * FROM chat_conversations c
  WHERE (p_search IS NULL OR p_search = '' OR
         c.customer_name ILIKE '%' || p_search || '%' OR
         c.customer_email ILIKE '%' || p_search || '%' OR
         c.summary ILIKE '%' || p_search || '%' OR
         c.session_id ILIKE '%' || p_search || '%')
    AND (p_sentiment IS NULL OR p_sentiment = '' OR c.sentiment = p_sentiment)
    AND (p_resolved IS NULL OR p_resolved = '' OR
         (p_resolved = 'true' AND c.is_resolved = true) OR
         (p_resolved = 'false' AND (c.is_resolved = false OR c.is_resolved IS NULL)))
  ORDER BY c.updated_at DESC
  LIMIT p_limit OFFSET p_offset;
END;
$$;

CREATE OR REPLACE FUNCTION public.upsert_customer_insight(
  p_customer_id uuid,
  p_customer_email text DEFAULT NULL,
  p_customer_name text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_id uuid;
BEGIN
  SELECT id INTO v_id FROM customer_insights
  WHERE customer_id = p_customer_id OR (p_customer_email IS NOT NULL AND customer_email = p_customer_email)
  LIMIT 1;

  IF v_id IS NULL THEN
    INSERT INTO customer_insights (customer_id, customer_email, customer_name, first_contact_at, last_contact_at)
    VALUES (p_customer_id, p_customer_email, p_customer_name, now(), now())
    RETURNING id INTO v_id;
  ELSE
    UPDATE customer_insights SET
      customer_name = COALESCE(p_customer_name, customer_name),
      customer_email = COALESCE(p_customer_email, customer_email),
      last_contact_at = now(),
      updated_at = now()
    WHERE id = v_id;
  END IF;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.aggregate_support_analytics(p_date date DEFAULT CURRENT_DATE)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_start timestamptz;
  v_end timestamptz;
BEGIN
  v_start := p_date::timestamptz;
  v_end := (p_date + interval '1 day')::timestamptz;

  INSERT INTO support_analytics_daily (
    date, total_conversations, total_messages, total_tickets_created,
    total_tickets_resolved, avg_satisfaction, ai_handled_count,
    human_escalated_count, unique_customers
  )
  VALUES (
    p_date,
    (SELECT COUNT(*) FROM chat_conversations WHERE created_at >= v_start AND created_at < v_end),
    (SELECT COALESCE(SUM(message_count), 0) FROM chat_conversations WHERE updated_at >= v_start AND updated_at < v_end),
    (SELECT COUNT(*) FROM support_tickets WHERE created_at >= v_start AND created_at < v_end),
    (SELECT COUNT(*) FROM support_tickets WHERE resolved_at >= v_start AND resolved_at < v_end),
    (SELECT AVG(rating) FROM support_feedback WHERE created_at >= v_start AND created_at < v_end),
    (SELECT COUNT(*) FROM chat_conversations WHERE ai_handled = true AND created_at >= v_start AND created_at < v_end),
    (SELECT COUNT(*) FROM chat_conversations WHERE is_escalated = true AND escalated_at >= v_start AND escalated_at < v_end),
    (SELECT COUNT(DISTINCT customer_email) FROM chat_conversations WHERE customer_email IS NOT NULL AND created_at >= v_start AND created_at < v_end)
  )
  ON CONFLICT (date) DO UPDATE SET
    total_conversations = EXCLUDED.total_conversations,
    total_messages = EXCLUDED.total_messages,
    total_tickets_created = EXCLUDED.total_tickets_created,
    total_tickets_resolved = EXCLUDED.total_tickets_resolved,
    avg_satisfaction = EXCLUDED.avg_satisfaction,
    ai_handled_count = EXCLUDED.ai_handled_count,
    human_escalated_count = EXCLUDED.human_escalated_count,
    unique_customers = EXCLUDED.unique_customers;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_support_dashboard_stats()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'open_tickets', (SELECT COUNT(*) FROM support_tickets WHERE status IN ('open', 'in_progress')),
    'unresolved_chats', (SELECT COUNT(*) FROM chat_conversations WHERE (is_resolved = false OR is_resolved IS NULL) AND created_at > now() - interval '7 days'),
    'avg_satisfaction', (SELECT ROUND(AVG(rating)::numeric, 1) FROM support_feedback WHERE created_at > now() - interval '30 days'),
    'escalated_today', (SELECT COUNT(*) FROM chat_conversations WHERE is_escalated = true AND escalated_at::date = CURRENT_DATE),
    'total_today', (SELECT COUNT(*) FROM chat_conversations WHERE created_at::date = CURRENT_DATE)
  ) INTO result;
  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_rider_stats()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
    IF NEW.status = 'delivered' AND (OLD.status IS NULL OR OLD.status != 'delivered') THEN
        UPDATE public.riders
        SET total_deliveries = total_deliveries + 1,
            successful_deliveries = successful_deliveries + 1,
            status = 'active', updated_at = now()
        WHERE id = NEW.rider_id;
    END IF;
    IF NEW.status = 'failed' AND (OLD.status IS NULL OR OLD.status != 'failed') THEN
        UPDATE public.riders
        SET total_deliveries = total_deliveries + 1,
            status = 'active', updated_at = now()
        WHERE id = NEW.rider_id;
    END IF;
    IF NEW.status IN ('picked_up', 'in_transit') THEN
        UPDATE public.riders SET status = 'on_delivery', updated_at = now() WHERE id = NEW.rider_id;
    END IF;
    RETURN NEW;
END;
$$;

-- ============================================================================
-- 4. TABLES
-- ============================================================================

-- Profiles (extends auth.users)
CREATE TABLE public.profiles (
  id uuid NOT NULL PRIMARY KEY REFERENCES auth.users(id),
  email text UNIQUE,
  role user_role DEFAULT 'customer'::user_role,
  full_name text,
  phone text,
  avatar_url text,
  date_of_birth date,
  gender gender_type,
  preferences jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Roles (RBAC)
CREATE TABLE public.roles (
  id text PRIMARY KEY,
  name text NOT NULL,
  description text,
  enabled boolean DEFAULT true,
  is_system boolean DEFAULT false,
  permissions jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Addresses
CREATE TABLE public.addresses (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  user_id uuid REFERENCES auth.users(id),
  type address_type DEFAULT 'shipping'::address_type,
  is_default boolean DEFAULT false,
  label text,
  full_name text NOT NULL,
  phone text NOT NULL,
  address_line1 text NOT NULL,
  address_line2 text,
  city text NOT NULL,
  state text NOT NULL,
  postal_code text NOT NULL,
  country text NOT NULL,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Store Settings
CREATE TABLE public.store_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  description text,
  updated_at timestamptz DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id)
);

-- Site Settings (key-value with category)
CREATE TABLE public.site_settings (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  key text NOT NULL UNIQUE,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  category text NOT NULL DEFAULT 'general'::text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Audit Logs
CREATE TABLE public.audit_logs (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  user_id uuid REFERENCES auth.users(id),
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  details jsonb,
  ip_address text,
  created_at timestamptz DEFAULT now()
);

-- Categories
CREATE TABLE public.categories (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  description text,
  parent_id uuid REFERENCES public.categories(id),
  image_url text,
  position integer DEFAULT 0,
  status category_status DEFAULT 'active'::category_status,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Products
CREATE TABLE public.products (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  description text,
  short_description text,
  price numeric NOT NULL,
  compare_at_price numeric,
  cost_per_item numeric,
  sku text UNIQUE,
  barcode text,
  quantity integer DEFAULT 0,
  track_quantity boolean DEFAULT true,
  continue_selling boolean DEFAULT false,
  weight numeric,
  weight_unit text DEFAULT 'kg'::text,
  category_id uuid REFERENCES public.categories(id),
  brand text,
  vendor text,
  tags text[],
  status product_status DEFAULT 'active'::product_status,
  featured boolean DEFAULT false,
  options jsonb DEFAULT '[]'::jsonb,
  external_id text,
  external_source text,
  seo_title text,
  seo_description text,
  rating_avg numeric DEFAULT 0,
  review_count integer DEFAULT 0,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  moq integer DEFAULT 1 CHECK (moq >= 1)
);

-- Product Images
CREATE TABLE public.product_images (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  product_id uuid REFERENCES public.products(id),
  url text NOT NULL,
  alt_text text,
  position integer DEFAULT 0,
  width integer,
  height integer,
  created_at timestamptz DEFAULT now(),
  media_type text DEFAULT 'image' CHECK (media_type IN ('image', 'video'))
);

-- Product Variants
CREATE TABLE public.product_variants (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  product_id uuid REFERENCES public.products(id),
  name text NOT NULL,
  sku text UNIQUE,
  price numeric NOT NULL,
  compare_at_price numeric,
  cost_per_item numeric,
  quantity integer DEFAULT 0,
  weight numeric,
  option1 text,
  option2 text,
  option3 text,
  image_url text,
  barcode text,
  external_id text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Coupons
CREATE TABLE public.coupons (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  code text NOT NULL UNIQUE,
  description text,
  type discount_type NOT NULL,
  value numeric NOT NULL,
  minimum_purchase numeric DEFAULT 0,
  maximum_discount numeric,
  usage_limit integer,
  usage_count integer DEFAULT 0,
  per_user_limit integer DEFAULT 1,
  start_date timestamptz,
  end_date timestamptz,
  is_active boolean DEFAULT true,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Orders
CREATE TABLE public.orders (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  order_number text NOT NULL UNIQUE,
  user_id uuid REFERENCES auth.users(id),
  email text NOT NULL,
  phone text,
  status order_status DEFAULT 'pending'::order_status,
  payment_status payment_status DEFAULT 'pending'::payment_status,
  currency text DEFAULT 'USD'::text,
  subtotal numeric NOT NULL,
  tax_total numeric DEFAULT 0,
  shipping_total numeric DEFAULT 0,
  discount_total numeric DEFAULT 0,
  total numeric NOT NULL,
  shipping_method text,
  payment_method text,
  payment_provider text,
  payment_transaction_id text,
  notes text,
  cancel_reason text,
  shipping_address jsonb NOT NULL,
  billing_address jsonb NOT NULL,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  payment_reminder_sent boolean DEFAULT false,
  payment_reminder_sent_at timestamptz
);

-- Order Items
CREATE TABLE public.order_items (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  order_id uuid REFERENCES public.orders(id),
  product_id uuid REFERENCES public.products(id),
  variant_id uuid REFERENCES public.product_variants(id),
  product_name text NOT NULL,
  variant_name text,
  sku text,
  quantity integer NOT NULL,
  unit_price numeric NOT NULL,
  total_price numeric NOT NULL,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

-- Order Status History
CREATE TABLE public.order_status_history (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  order_id uuid REFERENCES public.orders(id),
  status order_status NOT NULL,
  notes text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now()
);

-- Cart Items
CREATE TABLE public.cart_items (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  user_id uuid REFERENCES auth.users(id),
  product_id uuid REFERENCES public.products(id),
  variant_id uuid REFERENCES public.product_variants(id),
  quantity integer NOT NULL DEFAULT 1,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, product_id, variant_id)
);

-- Wishlist Items
CREATE TABLE public.wishlist_items (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  user_id uuid REFERENCES auth.users(id),
  product_id uuid REFERENCES public.products(id),
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, product_id)
);

-- Reviews
CREATE TABLE public.reviews (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  product_id uuid REFERENCES public.products(id),
  user_id uuid REFERENCES auth.users(id),
  rating integer NOT NULL CHECK (rating >= 1 AND rating <= 5),
  title text,
  content text,
  status review_status DEFAULT 'pending'::review_status,
  verified_purchase boolean DEFAULT false,
  helpful_votes integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Review Images
CREATE TABLE public.review_images (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  review_id uuid REFERENCES public.reviews(id),
  url text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Blog Posts
CREATE TABLE public.blog_posts (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  title text NOT NULL,
  slug text NOT NULL UNIQUE,
  excerpt text,
  content text NOT NULL,
  featured_image text,
  author_id uuid REFERENCES auth.users(id),
  status blog_status DEFAULT 'draft'::blog_status,
  published_at timestamptz,
  seo_title text,
  seo_description text,
  tags text[],
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Return Requests
CREATE TABLE public.return_requests (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  order_id uuid REFERENCES public.orders(id),
  user_id uuid REFERENCES auth.users(id),
  status return_status DEFAULT 'pending'::return_status,
  reason text NOT NULL,
  description text,
  refund_amount numeric,
  refund_method text,
  admin_notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Return Items
CREATE TABLE public.return_items (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  return_request_id uuid REFERENCES public.return_requests(id),
  order_item_id uuid REFERENCES public.order_items(id),
  quantity integer NOT NULL,
  reason text,
  condition text,
  created_at timestamptz DEFAULT now()
);

-- Notifications
CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  user_id uuid REFERENCES auth.users(id),
  type text NOT NULL,
  title text NOT NULL,
  message text,
  data jsonb,
  read_at timestamptz,
  created_at timestamptz DEFAULT now()
);

-- Pages (CMS)
CREATE TABLE public.pages (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  title text NOT NULL,
  slug text NOT NULL UNIQUE,
  content text,
  status text DEFAULT 'draft'::text,
  seo_title text,
  seo_description text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- CMS Content blocks
CREATE TABLE public.cms_content (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  section text NOT NULL,
  block_key text NOT NULL,
  title text,
  subtitle text,
  content text,
  image_url text,
  button_text text,
  button_url text,
  metadata jsonb DEFAULT '{}'::jsonb,
  sort_order integer DEFAULT 0,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(section, block_key)
);

-- Banners
CREATE TABLE public.banners (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  name text NOT NULL,
  type text NOT NULL DEFAULT 'promotional'::text,
  title text,
  subtitle text,
  image_url text,
  background_color text DEFAULT '#000000'::text,
  text_color text DEFAULT '#FFFFFF'::text,
  button_text text,
  button_url text,
  start_date timestamptz,
  end_date timestamptz,
  is_active boolean DEFAULT true,
  position text DEFAULT 'top'::text,
  sort_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Navigation Menus
CREATE TABLE public.navigation_menus (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  name text NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Navigation Items
CREATE TABLE public.navigation_items (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  menu_id uuid REFERENCES public.navigation_menus(id),
  parent_id uuid REFERENCES public.navigation_items(id),
  label text NOT NULL,
  url text NOT NULL,
  icon text,
  is_external boolean DEFAULT false,
  is_active boolean DEFAULT true,
  sort_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Store Modules (feature flags)
CREATE TABLE public.store_modules (
  id text PRIMARY KEY,
  enabled boolean DEFAULT false,
  updated_at timestamptz DEFAULT now()
);

-- Customers (CRM / POS)
CREATE TABLE public.customers (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  email text NOT NULL UNIQUE,
  phone text,
  full_name text,
  first_name text,
  last_name text,
  user_id uuid REFERENCES auth.users(id),
  default_address jsonb,
  notes text,
  tags text[],
  total_orders integer DEFAULT 0,
  total_spent numeric DEFAULT 0,
  last_order_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  secondary_phone text,
  secondary_email text
);

-- Chat Conversations (AI chat widget persistence)
CREATE TABLE public.chat_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  session_id text NOT NULL,
  messages jsonb DEFAULT '[]'::jsonb,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  sentiment text DEFAULT 'neutral',
  sentiment_score numeric,
  category text,
  intent text,
  summary text,
  is_resolved boolean DEFAULT false,
  is_escalated boolean DEFAULT false,
  escalated_at timestamptz,
  message_count integer DEFAULT 0,
  customer_email text,
  customer_name text,
  ai_handled boolean DEFAULT true,
  first_response_ms integer,
  tags text[],
  page_context text,
  duration_seconds integer
);

-- AI Memory
CREATE TABLE public.ai_memory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid,
  customer_email text,
  memory_type text NOT NULL DEFAULT 'context',
  content text NOT NULL,
  importance text DEFAULT 'normal',
  expires_at timestamptz,
  source_conversation_id uuid REFERENCES public.chat_conversations(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

-- Customer Insights (CRM analytics)
CREATE TABLE public.customer_insights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid,
  customer_email text,
  customer_name text,
  total_conversations integer DEFAULT 0,
  total_tickets integer DEFAULT 0,
  total_messages_sent integer DEFAULT 0,
  avg_satisfaction numeric,
  preferred_categories text[],
  preferred_products text[],
  communication_style text,
  sentiment_trend text DEFAULT 'neutral',
  preferences jsonb DEFAULT '{}'::jsonb,
  ai_notes jsonb DEFAULT '{}'::jsonb,
  important_context text[],
  lifetime_value numeric DEFAULT 0,
  churn_risk text DEFAULT 'low',
  vip_status boolean DEFAULT false,
  first_contact_at timestamptz,
  last_contact_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Support Tickets
CREATE TABLE public.support_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_number text NOT NULL UNIQUE,
  conversation_id uuid REFERENCES public.chat_conversations(id) ON DELETE SET NULL,
  customer_id uuid,
  customer_email text,
  customer_name text,
  subject text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'open',
  priority text NOT NULL DEFAULT 'medium',
  category text,
  assigned_to text,
  channel text DEFAULT 'chat',
  tags text[],
  resolution text,
  resolved_at timestamptz,
  closed_at timestamptz,
  first_response_at timestamptz,
  sla_deadline timestamptz,
  satisfaction_rating integer,
  satisfaction_feedback text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Support Ticket Messages
CREATE TABLE public.support_ticket_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  sender_type text NOT NULL DEFAULT 'agent',
  sender_id text,
  sender_name text,
  content text NOT NULL,
  attachments jsonb,
  is_internal boolean DEFAULT false,
  metadata jsonb,
  created_at timestamptz DEFAULT now()
);

-- Support Feedback
CREATE TABLE public.support_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid REFERENCES public.chat_conversations(id) ON DELETE SET NULL,
  ticket_id uuid REFERENCES public.support_tickets(id) ON DELETE SET NULL,
  customer_id uuid,
  customer_email text,
  rating integer NOT NULL CHECK (rating >= 1 AND rating <= 5),
  feedback_text text,
  feedback_categories text[],
  created_at timestamptz DEFAULT now()
);

-- Support Knowledge Base
CREATE TABLE public.support_knowledge_base (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  content text NOT NULL,
  category text,
  tags text[],
  source text DEFAULT 'manual',
  source_ticket_id uuid REFERENCES public.support_tickets(id) ON DELETE SET NULL,
  helpful_count integer DEFAULT 0,
  not_helpful_count integer DEFAULT 0,
  is_published boolean DEFAULT true,
  created_by text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Support Canned Responses
CREATE TABLE public.support_canned_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  content text NOT NULL,
  category text,
  shortcut text,
  use_count integer DEFAULT 0,
  created_by text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Support Escalation Rules
CREATE TABLE public.support_escalation_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  condition_type text NOT NULL,
  condition_value jsonb NOT NULL,
  action_type text NOT NULL,
  action_value jsonb NOT NULL,
  is_active boolean DEFAULT true,
  priority integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Support Analytics Daily
CREATE TABLE public.support_analytics_daily (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date date NOT NULL UNIQUE,
  total_conversations integer DEFAULT 0,
  total_messages integer DEFAULT 0,
  total_tickets_created integer DEFAULT 0,
  total_tickets_resolved integer DEFAULT 0,
  avg_response_time_ms integer,
  avg_resolution_time_ms integer,
  avg_satisfaction numeric,
  top_categories jsonb,
  top_intents jsonb,
  sentiment_distribution jsonb,
  ai_handled_count integer DEFAULT 0,
  human_escalated_count integer DEFAULT 0,
  unique_customers integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- Delivery Zones
CREATE TABLE public.delivery_zones (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  name text NOT NULL,
  description text,
  regions text[] DEFAULT '{}',
  base_fee numeric DEFAULT 0,
  express_fee numeric DEFAULT 0,
  estimated_days text DEFAULT '1-3 days',
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Riders
CREATE TABLE public.riders (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  full_name text NOT NULL,
  phone text NOT NULL,
  email text,
  vehicle_type text DEFAULT 'motorcycle',
  license_plate text,
  status text DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'on_delivery', 'off_duty')),
  avatar_url text,
  zone_id uuid REFERENCES public.delivery_zones(id) ON DELETE SET NULL,
  total_deliveries integer DEFAULT 0,
  successful_deliveries integer DEFAULT 0,
  rating_avg numeric DEFAULT 0,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Delivery Assignments
CREATE TABLE public.delivery_assignments (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  rider_id uuid NOT NULL REFERENCES public.riders(id) ON DELETE CASCADE,
  status text DEFAULT 'assigned' CHECK (status IN ('assigned', 'picked_up', 'in_transit', 'delivered', 'failed', 'returned')),
  priority text DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  assigned_at timestamptz DEFAULT now(),
  picked_up_at timestamptz,
  in_transit_at timestamptz,
  delivered_at timestamptz,
  failed_at timestamptz,
  estimated_delivery timestamptz,
  delivery_notes text,
  failure_reason text,
  proof_of_delivery text,
  customer_signature text,
  delivery_fee numeric DEFAULT 0,
  assigned_by uuid REFERENCES auth.users(id),
  zone_id uuid REFERENCES public.delivery_zones(id) ON DELETE SET NULL,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Delivery Status History
CREATE TABLE public.delivery_status_history (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  assignment_id uuid NOT NULL REFERENCES public.delivery_assignments(id) ON DELETE CASCADE,
  old_status text,
  new_status text NOT NULL,
  changed_by uuid REFERENCES auth.users(id),
  notes text,
  created_at timestamptz DEFAULT now()
);

-- ============================================================================
-- 5. INDEXES
-- ============================================================================

-- Profiles
CREATE INDEX idx_profiles_email ON public.profiles USING btree (email);
CREATE INDEX idx_profiles_role ON public.profiles USING btree (role);

-- Addresses
CREATE INDEX idx_addresses_user_id ON public.addresses USING btree (user_id);

-- Audit Logs
CREATE INDEX idx_audit_logs_action ON public.audit_logs USING btree (action);
CREATE INDEX idx_audit_logs_user_id ON public.audit_logs USING btree (user_id);

-- Categories
CREATE INDEX idx_categories_parent ON public.categories USING btree (parent_id);
CREATE INDEX idx_categories_slug ON public.categories USING btree (slug);

-- Products
CREATE INDEX idx_products_category ON public.products USING btree (category_id);
CREATE INDEX idx_products_featured ON public.products USING btree (featured);
CREATE INDEX idx_products_slug ON public.products USING btree (slug);
CREATE INDEX idx_products_status ON public.products USING btree (status);
CREATE INDEX idx_products_tags ON public.products USING gin (tags);

-- Blog Posts
CREATE INDEX idx_blog_slug ON public.blog_posts USING btree (slug);
CREATE INDEX idx_blog_status ON public.blog_posts USING btree (status);

-- Coupons
CREATE INDEX idx_coupons_code ON public.coupons USING btree (code);

-- Orders
CREATE INDEX idx_orders_order_number ON public.orders USING btree (order_number);
CREATE INDEX idx_orders_status ON public.orders USING btree (status);
CREATE INDEX idx_orders_user ON public.orders USING btree (user_id);
CREATE INDEX idx_orders_pending_reminders ON public.orders USING btree (created_at)
  WHERE payment_status <> 'paid'::payment_status AND payment_reminder_sent = false;

-- Order Items
CREATE INDEX idx_order_items_order ON public.order_items USING btree (order_id);

-- Notifications
CREATE INDEX idx_notifications_user ON public.notifications USING btree (user_id);
CREATE INDEX idx_notifications_unread ON public.notifications USING btree (user_id) WHERE read_at IS NULL;

-- Reviews
CREATE INDEX idx_reviews_product ON public.reviews USING btree (product_id);
CREATE INDEX idx_reviews_status ON public.reviews USING btree (status);

-- Customers
CREATE INDEX idx_customers_email ON public.customers USING btree (email);
CREATE INDEX idx_customers_user_id ON public.customers USING btree (user_id);
CREATE INDEX idx_customers_secondary_email ON public.customers USING btree (secondary_email);
CREATE INDEX idx_customers_secondary_phone ON public.customers USING btree (secondary_phone);

-- Chat Conversations
CREATE INDEX idx_chat_conversations_session ON public.chat_conversations USING btree (session_id);
CREATE INDEX idx_chat_conversations_user ON public.chat_conversations USING btree (user_id) WHERE user_id IS NOT NULL;
CREATE INDEX idx_chat_conversations_updated ON public.chat_conversations USING btree (updated_at DESC);
CREATE INDEX idx_chat_conversations_email ON public.chat_conversations USING btree (customer_email) WHERE customer_email IS NOT NULL;
CREATE INDEX idx_chat_conversations_escalated ON public.chat_conversations USING btree (is_escalated) WHERE is_escalated = true;

-- AI Memory
CREATE INDEX idx_ai_memory_customer_email ON public.ai_memory USING btree (customer_email);
CREATE INDEX idx_ai_memory_customer_id ON public.ai_memory USING btree (customer_id);
CREATE INDEX idx_ai_memory_conversation ON public.ai_memory USING btree (source_conversation_id);

-- Customer Insights
CREATE INDEX idx_customer_insights_customer_id ON public.customer_insights USING btree (customer_id);
CREATE INDEX idx_customer_insights_email ON public.customer_insights USING btree (customer_email);

-- Support Tickets
CREATE INDEX idx_support_tickets_status ON public.support_tickets USING btree (status);
CREATE INDEX idx_support_tickets_conversation ON public.support_tickets USING btree (conversation_id);
CREATE INDEX idx_support_tickets_customer_email ON public.support_tickets USING btree (customer_email);

-- Support Ticket Messages
CREATE INDEX idx_support_ticket_messages_ticket ON public.support_ticket_messages USING btree (ticket_id);

-- Support Feedback
CREATE INDEX idx_support_feedback_conversation ON public.support_feedback USING btree (conversation_id);
CREATE INDEX idx_support_feedback_ticket ON public.support_feedback USING btree (ticket_id);

-- Support Analytics
CREATE INDEX idx_support_analytics_date ON public.support_analytics_daily USING btree (date);

-- Riders
CREATE INDEX idx_riders_status ON public.riders USING btree (status);
CREATE INDEX idx_riders_zone ON public.riders USING btree (zone_id);
CREATE INDEX idx_riders_phone ON public.riders USING btree (phone);

-- Delivery Assignments
CREATE INDEX idx_delivery_assignments_order ON public.delivery_assignments USING btree (order_id);
CREATE INDEX idx_delivery_assignments_rider ON public.delivery_assignments USING btree (rider_id);
CREATE INDEX idx_delivery_assignments_status ON public.delivery_assignments USING btree (status);
CREATE INDEX idx_delivery_assignments_assigned_at ON public.delivery_assignments USING btree (assigned_at);

-- Delivery Status History
CREATE INDEX idx_delivery_status_history_assignment ON public.delivery_status_history USING btree (assignment_id);

-- ============================================================================
-- 6. TRIGGERS
-- ============================================================================

-- updated_at triggers
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_addresses_updated_at BEFORE UPDATE ON public.addresses FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_categories_updated_at BEFORE UPDATE ON public.categories FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_products_updated_at BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_product_variants_updated_at BEFORE UPDATE ON public.product_variants FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_coupons_updated_at BEFORE UPDATE ON public.coupons FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_orders_updated_at BEFORE UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_cart_items_updated_at BEFORE UPDATE ON public.cart_items FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_reviews_updated_at BEFORE UPDATE ON public.reviews FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_blog_posts_updated_at BEFORE UPDATE ON public.blog_posts FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_support_tickets_updated_at BEFORE UPDATE ON public.support_tickets FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_return_requests_updated_at BEFORE UPDATE ON public.return_requests FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_store_settings_updated_at BEFORE UPDATE ON public.store_settings FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_pages_updated_at BEFORE UPDATE ON public.pages FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_chat_conversations_updated_at BEFORE UPDATE ON public.chat_conversations FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_customer_insights_updated_at BEFORE UPDATE ON public.customer_insights FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_support_knowledge_base_updated_at BEFORE UPDATE ON public.support_knowledge_base FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_support_canned_responses_updated_at BEFORE UPDATE ON public.support_canned_responses FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_support_escalation_rules_updated_at BEFORE UPDATE ON public.support_escalation_rules FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Review rating stats trigger
CREATE TRIGGER tr_update_product_rating AFTER INSERT OR DELETE OR UPDATE ON public.reviews FOR EACH ROW EXECUTE FUNCTION update_product_rating_stats();

-- Auth trigger: auto-create profile on signup
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Delivery: update rider stats on assignment status change
CREATE TRIGGER on_delivery_status_change AFTER UPDATE OF status ON public.delivery_assignments FOR EACH ROW EXECUTE FUNCTION public.update_rider_stats();

-- ============================================================================
-- 7. ENABLE ROW LEVEL SECURITY
-- ============================================================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.addresses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cart_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wishlist_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.review_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blog_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.return_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.return_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cms_content ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.banners ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.navigation_menus ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.navigation_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_memory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_insights ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_ticket_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_knowledge_base ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_canned_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_escalation_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_analytics_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_zones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.riders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_status_history ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 8. ROW LEVEL SECURITY POLICIES
-- ============================================================================

-- Profiles
CREATE POLICY "Users view own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Staff view any profile" ON public.profiles FOR SELECT USING (is_admin_or_staff());

-- Roles
CREATE POLICY "Public can read roles" ON public.roles FOR SELECT USING (true);
CREATE POLICY "Admin can manage roles" ON public.roles FOR ALL USING (is_admin_or_staff()) WITH CHECK (is_admin_or_staff());

-- Addresses
CREATE POLICY "Users manage own addresses" ON public.addresses FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Staff manage all addresses" ON public.addresses FOR ALL USING (is_admin_or_staff()) WITH CHECK (is_admin_or_staff());

-- Store Settings
CREATE POLICY "Staff view settings" ON public.store_settings FOR SELECT USING (true);
CREATE POLICY "Staff manage settings" ON public.store_settings FOR ALL USING (is_admin_or_staff()) WITH CHECK (is_admin_or_staff());

-- Site Settings
CREATE POLICY "Allow public read on site_settings" ON public.site_settings FOR SELECT USING (true);
CREATE POLICY "Allow admin write on site_settings" ON public.site_settings FOR ALL USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'::user_role));

-- Audit Logs
CREATE POLICY "Staff view audit logs" ON public.audit_logs FOR SELECT USING (is_admin_or_staff());
CREATE POLICY "Staff insert audit logs" ON public.audit_logs FOR INSERT WITH CHECK (is_admin_or_staff());

-- Categories
CREATE POLICY "Public view categories" ON public.categories FOR SELECT USING (true);
CREATE POLICY "Staff manage categories" ON public.categories FOR ALL USING (is_admin_or_staff()) WITH CHECK (is_admin_or_staff());

-- Products
CREATE POLICY "Public view active products" ON public.products FOR SELECT USING (status = 'active'::product_status OR is_admin_or_staff());
CREATE POLICY "Staff manage products" ON public.products FOR ALL USING (is_admin_or_staff()) WITH CHECK (is_admin_or_staff());

-- Product Images
CREATE POLICY "Public view images" ON public.product_images FOR SELECT USING (true);
CREATE POLICY "Staff manage images" ON public.product_images FOR ALL USING (is_admin_or_staff()) WITH CHECK (is_admin_or_staff());

-- Product Variants
CREATE POLICY "Public view variants" ON public.product_variants FOR SELECT USING (true);
CREATE POLICY "Staff manage variants" ON public.product_variants FOR ALL USING (is_admin_or_staff()) WITH CHECK (is_admin_or_staff());

-- Coupons
CREATE POLICY "Allow anon read access to coupons" ON public.coupons FOR SELECT TO anon USING (true);
CREATE POLICY "Allow authenticated read access to coupons" ON public.coupons FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow admin insert on coupons" ON public.coupons FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin', 'staff')));
CREATE POLICY "Allow admin update on coupons" ON public.coupons FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin', 'staff')));
CREATE POLICY "Allow admin delete on coupons" ON public.coupons FOR DELETE TO authenticated USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin', 'staff')));

-- Orders
CREATE POLICY "Enable insert for all users" ON public.orders FOR INSERT WITH CHECK (((auth.uid() IS NOT NULL) AND (auth.uid() = user_id)) OR ((auth.uid() IS NULL) AND (user_id IS NULL)));
CREATE POLICY "Users view own orders" ON public.orders FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Enable select for guest orders" ON public.orders FOR SELECT USING (user_id IS NULL);
CREATE POLICY "Staff manage all orders" ON public.orders FOR ALL USING (is_admin_or_staff()) WITH CHECK (is_admin_or_staff());

-- Order Items
CREATE POLICY "Users view own order items" ON public.order_items FOR SELECT USING (EXISTS (SELECT 1 FROM orders WHERE orders.id = order_items.order_id AND orders.user_id = auth.uid()));
CREATE POLICY "Enable select for guest order items" ON public.order_items FOR SELECT USING (EXISTS (SELECT 1 FROM orders WHERE orders.id = order_items.order_id AND orders.user_id IS NULL));
CREATE POLICY "Enable insert for order items" ON public.order_items FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM orders WHERE orders.id = order_items.order_id AND (orders.user_id = auth.uid() OR orders.user_id IS NULL)));
CREATE POLICY "Staff manage order items" ON public.order_items FOR ALL USING (is_admin_or_staff()) WITH CHECK (is_admin_or_staff());

-- Order Status History
CREATE POLICY "Users view order history" ON public.order_status_history FOR SELECT USING (EXISTS (SELECT 1 FROM orders WHERE orders.id = order_status_history.order_id AND orders.user_id = auth.uid()));
CREATE POLICY "Staff manage order history" ON public.order_status_history FOR ALL USING (is_admin_or_staff()) WITH CHECK (is_admin_or_staff());

-- Cart Items
CREATE POLICY "Users manage own cart" ON public.cart_items FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Wishlist Items
CREATE POLICY "Users manage own wishlist" ON public.wishlist_items FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Reviews
CREATE POLICY "Public view approved reviews" ON public.reviews FOR SELECT USING (status = 'approved'::review_status);
CREATE POLICY "Users view own reviews" ON public.reviews FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users create reviews" ON public.reviews FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own reviews" ON public.reviews FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Staff manage reviews" ON public.reviews FOR ALL USING (is_admin_or_staff()) WITH CHECK (is_admin_or_staff());

-- Review Images
CREATE POLICY "Public view review images" ON public.review_images FOR SELECT USING (EXISTS (SELECT 1 FROM reviews WHERE reviews.id = review_images.review_id AND reviews.status = 'approved'::review_status));
CREATE POLICY "Users manage review images" ON public.review_images FOR ALL USING (EXISTS (SELECT 1 FROM reviews WHERE reviews.id = review_images.review_id AND reviews.user_id = auth.uid())) WITH CHECK (EXISTS (SELECT 1 FROM reviews WHERE reviews.id = review_images.review_id AND reviews.user_id = auth.uid()));

-- Blog Posts
CREATE POLICY "Public view published posts" ON public.blog_posts FOR SELECT USING (status = 'published'::blog_status OR is_admin_or_staff());
CREATE POLICY "Staff manage blog" ON public.blog_posts FOR ALL USING (is_admin_or_staff()) WITH CHECK (is_admin_or_staff());

-- Return Requests
CREATE POLICY "Users view own returns" ON public.return_requests FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users create returns" ON public.return_requests FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Staff manage returns" ON public.return_requests FOR ALL USING (is_admin_or_staff()) WITH CHECK (is_admin_or_staff());

-- Return Items
CREATE POLICY "Users view return items" ON public.return_items FOR SELECT USING (EXISTS (SELECT 1 FROM return_requests WHERE return_requests.id = return_items.return_request_id AND return_requests.user_id = auth.uid()));
CREATE POLICY "Staff manage return items" ON public.return_items FOR ALL USING (is_admin_or_staff()) WITH CHECK (is_admin_or_staff());

-- Notifications
CREATE POLICY "Users manage own notifications" ON public.notifications FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Pages
CREATE POLICY "Public can view pages" ON public.pages FOR SELECT USING (true);
CREATE POLICY "Staff can manage pages" ON public.pages FOR ALL USING (is_admin_or_staff());

-- CMS Content
CREATE POLICY "Allow public read on cms_content" ON public.cms_content FOR SELECT USING (is_active = true);
CREATE POLICY "Allow admin all on cms_content" ON public.cms_content FOR ALL USING (is_admin_or_staff());

-- Banners
CREATE POLICY "Allow public read on banners" ON public.banners FOR SELECT USING (is_active = true);
CREATE POLICY "Allow admin all on banners" ON public.banners FOR ALL USING (is_admin_or_staff());

-- Navigation Menus
CREATE POLICY "Allow public read on navigation_menus" ON public.navigation_menus FOR SELECT USING (true);
CREATE POLICY "Allow admin all on navigation_menus" ON public.navigation_menus FOR ALL USING (is_admin_or_staff());

-- Navigation Items
CREATE POLICY "Allow public read on navigation_items" ON public.navigation_items FOR SELECT USING (is_active = true);
CREATE POLICY "Allow admin all on navigation_items" ON public.navigation_items FOR ALL USING (is_admin_or_staff());

-- Store Modules
CREATE POLICY "Allow public read access" ON public.store_modules FOR SELECT USING (true);
CREATE POLICY "Allow admin insert on store_modules" ON public.store_modules FOR INSERT TO authenticated WITH CHECK (is_admin_or_staff());
CREATE POLICY "Allow authenticated update" ON public.store_modules FOR UPDATE USING (auth.role() = 'authenticated' OR auth.role() = 'anon');

-- Customers
CREATE POLICY "Staff can view all customers" ON public.customers FOR SELECT USING (is_admin_or_staff());
CREATE POLICY "Staff can manage customers" ON public.customers FOR ALL USING (is_admin_or_staff());
CREATE POLICY "Service role full access to customers" ON public.customers FOR ALL USING (auth.role() = 'service_role');

-- Chat Conversations
CREATE POLICY "Users can view own conversations" ON public.chat_conversations FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own conversations" ON public.chat_conversations FOR INSERT WITH CHECK (auth.uid() = user_id OR user_id IS NULL);
CREATE POLICY "Users can update own conversations" ON public.chat_conversations FOR UPDATE USING (auth.uid() = user_id OR user_id IS NULL);
CREATE POLICY "Staff manage all conversations" ON public.chat_conversations FOR ALL USING (is_admin_or_staff()) WITH CHECK (is_admin_or_staff());
CREATE POLICY "Service role full access conversations" ON public.chat_conversations FOR ALL USING (auth.role() = 'service_role');

-- AI Memory
CREATE POLICY "Service role full access ai_memory" ON public.ai_memory FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Staff can view ai_memory" ON public.ai_memory FOR SELECT USING (is_admin_or_staff());

-- Customer Insights
CREATE POLICY "Service role full access customer_insights" ON public.customer_insights FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Staff can manage customer_insights" ON public.customer_insights FOR ALL USING (is_admin_or_staff()) WITH CHECK (is_admin_or_staff());

-- Support Tickets
CREATE POLICY "Staff manage support tickets" ON public.support_tickets FOR ALL USING (is_admin_or_staff()) WITH CHECK (is_admin_or_staff());
CREATE POLICY "Service role full access support tickets" ON public.support_tickets FOR ALL USING (auth.role() = 'service_role');

-- Support Ticket Messages
CREATE POLICY "Staff manage ticket messages" ON public.support_ticket_messages FOR ALL USING (is_admin_or_staff()) WITH CHECK (is_admin_or_staff());
CREATE POLICY "Service role full access ticket messages" ON public.support_ticket_messages FOR ALL USING (auth.role() = 'service_role');

-- Support Feedback
CREATE POLICY "Service role full access support_feedback" ON public.support_feedback FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Staff view support_feedback" ON public.support_feedback FOR SELECT USING (is_admin_or_staff());
CREATE POLICY "Anyone can insert feedback" ON public.support_feedback FOR INSERT WITH CHECK (true);

-- Support Knowledge Base
CREATE POLICY "Public can read published kb" ON public.support_knowledge_base FOR SELECT USING (is_published = true);
CREATE POLICY "Staff manage knowledge base" ON public.support_knowledge_base FOR ALL USING (is_admin_or_staff()) WITH CHECK (is_admin_or_staff());
CREATE POLICY "Service role full access kb" ON public.support_knowledge_base FOR ALL USING (auth.role() = 'service_role');

-- Support Canned Responses
CREATE POLICY "Staff manage canned responses" ON public.support_canned_responses FOR ALL USING (is_admin_or_staff()) WITH CHECK (is_admin_or_staff());

-- Support Escalation Rules
CREATE POLICY "Staff manage escalation rules" ON public.support_escalation_rules FOR ALL USING (is_admin_or_staff()) WITH CHECK (is_admin_or_staff());

-- Support Analytics
CREATE POLICY "Staff view analytics" ON public.support_analytics_daily FOR SELECT USING (is_admin_or_staff());
CREATE POLICY "Service role full access analytics" ON public.support_analytics_daily FOR ALL USING (auth.role() = 'service_role');

-- Delivery Zones
CREATE POLICY "Staff can manage delivery zones" ON public.delivery_zones FOR ALL USING (is_admin_or_staff()) WITH CHECK (is_admin_or_staff());
CREATE POLICY "Anyone can read active zones" ON public.delivery_zones FOR SELECT USING (is_active = true);

-- Riders
CREATE POLICY "Staff can manage riders" ON public.riders FOR ALL USING (is_admin_or_staff()) WITH CHECK (is_admin_or_staff());

-- Delivery Assignments
CREATE POLICY "Staff can manage delivery assignments" ON public.delivery_assignments FOR ALL USING (is_admin_or_staff()) WITH CHECK (is_admin_or_staff());

-- Delivery Status History
CREATE POLICY "Staff can view delivery history" ON public.delivery_status_history FOR ALL USING (is_admin_or_staff()) WITH CHECK (is_admin_or_staff());

-- ============================================================================
-- 9. FUNCTION GRANTS (for anon/authenticated access to SECURITY DEFINER RPCs)
-- ============================================================================
GRANT EXECUTE ON FUNCTION public.get_order_for_tracking(text, text) TO anon;
GRANT EXECUTE ON FUNCTION public.get_order_for_tracking(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_chat_conversation(text, uuid, jsonb, jsonb) TO anon;
GRANT EXECUTE ON FUNCTION public.upsert_chat_conversation(text, uuid, jsonb, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_chat_conversation(text) TO anon;
GRANT EXECUTE ON FUNCTION public.get_chat_conversation(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.generate_ticket_number() TO anon;
GRANT EXECUTE ON FUNCTION public.generate_ticket_number() TO authenticated;

-- ============================================================================
-- 10. STORAGE BUCKETS
-- ============================================================================
INSERT INTO storage.buckets (id, name, public) VALUES ('products', 'products', true);
INSERT INTO storage.buckets (id, name, public) VALUES ('avatars', 'avatars', true);
INSERT INTO storage.buckets (id, name, public) VALUES ('blog', 'blog', true);
INSERT INTO storage.buckets (id, name, public) VALUES ('media', 'media', true);
INSERT INTO storage.buckets (id, name, public) VALUES ('reviews', 'reviews', true);

-- ============================================================================
-- 11. STORAGE POLICIES
-- ============================================================================

-- Products bucket
CREATE POLICY "Public read access for products" ON storage.objects FOR SELECT USING (bucket_id = 'products');
CREATE POLICY "Admin upload access for products" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'products' AND is_admin_or_staff() = true);
CREATE POLICY "Admin update access for products" ON storage.objects FOR UPDATE USING (bucket_id = 'products' AND is_admin_or_staff() = true);
CREATE POLICY "Admin delete access for products" ON storage.objects FOR DELETE USING (bucket_id = 'products' AND is_admin_or_staff() = true);

-- Media bucket
CREATE POLICY "Public read access for media" ON storage.objects FOR SELECT USING (bucket_id = 'media');
CREATE POLICY "Admin upload access for media" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'media' AND is_admin_or_staff() = true);
CREATE POLICY "Admin delete access for media" ON storage.objects FOR DELETE USING (bucket_id = 'media' AND is_admin_or_staff() = true);

-- ============================================================================
-- 12. SEED DATA (default roles)
-- ============================================================================
INSERT INTO public.roles (id, name, description, enabled, is_system, permissions) VALUES
  ('admin', 'Administrator', 'Full system access', true, true, '{"dashboard":true,"orders":true,"products":true,"categories":true,"customers":true,"reviews":true,"inventory":true,"analytics":true,"coupons":true,"support":true,"customer_insights":true,"notifications":true,"sms_debugger":true,"blog":true,"delivery":true,"modules":true,"staff":true,"roles":true,"pos":true}'),
  ('staff', 'Staff', 'Limited system access based on permissions', true, true, '{"dashboard":true,"orders":true,"products":true,"categories":true,"customers":true,"reviews":true,"inventory":true,"pos":true}')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.store_modules (id, enabled) VALUES
  ('blog', false),
  ('customer-insights', true),
  ('notifications', true)
ON CONFLICT (id) DO NOTHING;

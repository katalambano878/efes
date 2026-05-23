-- Fix: product_images table had RLS enabled but no policies,
-- causing client-side queries to return empty results (broken images).

CREATE POLICY "Public read access for product images"
  ON public.product_images
  FOR SELECT
  USING (true);

CREATE POLICY "Staff manage product images"
  ON public.product_images
  FOR ALL
  USING (is_admin_or_staff());

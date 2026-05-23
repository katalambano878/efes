# Supabase Row Level Security (RLS) Setup — CRITICAL

## Why This Is Urgent

Your Supabase anon key is public (visible in browser JavaScript). Without RLS, **anyone** can query ALL your tables directly using that key. This is likely how the attacker accessed your customer data.

## How to Enable RLS

Go to your Supabase Dashboard:
**https://supabase.com/dashboard** (select your project)

Navigate to: **Database → Tables** (or **Table Editor**)

For EACH table below, click on the table, go to **RLS** (or **Policies**), and:
1. **Enable RLS** (toggle it ON)
2. **Add the policies listed below**

---

## Table: `orders`

### Enable RLS: YES

**Policy 1: Users can view their own orders**
```sql
CREATE POLICY "Users can view own orders"
ON orders FOR SELECT
USING (auth.uid() = user_id);
```

**Policy 2: Users can insert orders (during checkout)**
```sql
CREATE POLICY "Users can create orders"
ON orders FOR INSERT
WITH CHECK (auth.uid() = user_id OR user_id IS NULL);
```

**Policy 3: Service role can do everything (for API routes)**
- This is automatic — the service role key bypasses RLS.

---

## Table: `order_items`

### Enable RLS: YES

**Policy 1: Users can view items for their orders**
```sql
CREATE POLICY "Users can view own order items"
ON order_items FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM orders
    WHERE orders.id = order_items.order_id
    AND orders.user_id = auth.uid()
  )
);
```

**Policy 2: Allow insert during checkout**
```sql
CREATE POLICY "Users can insert order items"
ON order_items FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM orders
    WHERE orders.id = order_items.order_id
    AND (orders.user_id = auth.uid() OR orders.user_id IS NULL)
  )
);
```

---

## Table: `profiles`

### Enable RLS: YES

**Policy 1: Users can view their own profile**
```sql
CREATE POLICY "Users can view own profile"
ON profiles FOR SELECT
USING (auth.uid() = id);
```

**Policy 2: Users can update their own profile**
```sql
CREATE POLICY "Users can update own profile"
ON profiles FOR UPDATE
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);
```

---

## Table: `customers`

### Enable RLS: YES

**Policy 1: Only authenticated admins via service role**
No public policies needed — only the service role (API routes) should access this table.

If you need any read access:
```sql
CREATE POLICY "Admins only"
ON customers FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role IN ('admin', 'staff')
  )
);
```

---

## Table: `products`

### Enable RLS: YES

**Policy 1: Everyone can view published products**
```sql
CREATE POLICY "Public can view products"
ON products FOR SELECT
USING (status = 'active' OR status = 'published' OR status IS NULL);
```

---

## Table: `product_images`

### Enable RLS: YES

**Policy 1: Everyone can view product images**
```sql
CREATE POLICY "Public can view product images"
ON product_images FOR SELECT
USING (true);
```

---

## Table: `categories`

### Enable RLS: YES

**Policy 1: Everyone can view categories**
```sql
CREATE POLICY "Public can view categories"
ON categories FOR SELECT
USING (true);
```

---

## Table: `banners`

### Enable RLS: YES

**Policy 1: Everyone can view active banners**
```sql
CREATE POLICY "Public can view banners"
ON banners FOR SELECT
USING (active = true OR active IS NULL);
```

---

## Table: `store_modules`

### Enable RLS: YES

**Policy 1: Everyone can view modules**
```sql
CREATE POLICY "Public can view modules"
ON store_modules FOR SELECT
USING (true);
```

---

## Table: `reviews`

### Enable RLS: YES

**Policy 1: Public can view approved reviews**
```sql
CREATE POLICY "Public can view approved reviews"
ON reviews FOR SELECT
USING (status = 'approved' OR status IS NULL);
```

**Policy 2: Users can create reviews**
```sql
CREATE POLICY "Users can create reviews"
ON reviews FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL);
```

---

## Other Tables

For any other tables (coupons, blog_posts, etc.):
- **Enable RLS on ALL tables**
- Public data: Add `SELECT` policy with `USING (true)` or appropriate filter
- Private data: Add policy restricted to `auth.uid()` or admin role
- When in doubt: Enable RLS with NO policies (blocks all access via anon key)

---

## Environment Variable to Add

Add to your `.env.local`:
```
MOOLRE_CALLBACK_SECRET=<get this from Moolre dashboard or generate a strong random string>
```

This is used to verify payment callbacks are actually from Moolre.

---

## Verification

After setting up RLS, test by:
1. Open browser DevTools console on your store
2. Try: `const { data } = await supabase.from('customers').select('*')`
3. It should return an empty array or error — NOT customer data
4. Try: `const { data } = await supabase.from('orders').select('*')`
5. Should only return orders belonging to the logged-in user (or empty)

---

## Summary of Changes Made in Code

1. **Payment verify endpoint** — No longer trusts `fromRedirect` flag; only Moolre API verification
2. **Payment initiation** — Amount fetched from database, never trusted from client
3. **Payment callback** — Secret verification mandatory when configured; amount mismatches rejected
4. **Middleware** — Server-side auth check for all `/admin` routes
5. **Notifications API** — All sensitive types require admin auth; contact form validated
6. **Order tracking** — Email verification now required (mandatory)
7. **Test SMS** — Requires admin auth token
8. **HTML sanitization** — All user input escaped before HTML injection
9. **Security headers** — X-Content-Type-Options, X-Frame-Options, Referrer-Policy added

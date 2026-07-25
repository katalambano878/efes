# Store Hardening Playbook (reusable)

Use this when bringing another MultiMey / Next.js store to production on **big-vps + Coolify + plain Postgres**.

Distilled from:

| Store | When | Architecture |
|-------|------|----------------|
| **Affordable Perfumes GH** (`affordableperfume`) | Jul 2026 | Supabase-js → app shims + plain PG |
| **Mamator** (`mamator` / `ecrimah/tshirts`) | Jul 2026 | Native `lib/db` + `/api/*` (no Supabase runtime) |
| **Efescloset** (`efes`) | Jul 2026 | Shape A — shimmed Supabase-js → plain PG |

Projects differ in schema names, brand copy, and payment providers — follow the **intent**, then adapt the **paths**. Skip sections that do not exist on the target store.

Related docs in this repo:

| Doc | When to use |
|-----|-------------|
| [`SUPABASE_TO_POSTGRES_MIGRATION_GUIDE.md`](./SUPABASE_TO_POSTGRES_MIGRATION_GUIDE.md) | Short project-specific cutover notes + env checklist |

---

## 0. How to use this playbook

1. Clone / open the target store repo.
2. Skim each section. Mark **Apply / Skip / Adapt**.
3. Prefer copying **patterns** (helpers, scripts, aggregation logic) over blind file paste.
4. Deploy only after the verification checklist passes.
5. Never invent secrets; wait for real `.env` / Coolify env / `DATABASE_URL`.

**Staff VPS:**

```bash
ssh big-vps
sudo fleet apps
sudo fleet app <coolify-app-name>
sudo fleet deploy <coolify-app-name>
```

**Always confirm the live image matches the git SHA you expect** (Coolify can queue deploys while an older container keeps serving):

```bash
ssh big-vps "sudo docker ps --format '{{.Names}} {{.Image}} {{.Status}}' | grep <coolify-uuid-prefix>"
# Image tag looks like: <uuid>:<full-git-sha>
git rev-parse HEAD   # compare short SHA
```

Coolify stores encrypted env in its DB — editing only the on-disk container `.env` is not enough for durable changes.

---

## 1. Architecture baseline

### Two common shapes

| Shape | When | Pattern |
|-------|------|---------|
| **A. Shimmed** | App still uses `@supabase/*` clients | Keep `supabase.from` / auth / storage in app code, point at **this app** + plain PG (`lib/db/*`, `/rest/v1`, `/auth/v1`, `/storage/v1`) |
| **B. Native PG** | App already uses `pg` + Next API routes (Mamator) | Skip shims. Harden `/api/*`, `lib/db.ts`, JWT session cookies, disk uploads (`/uploads` or `STORAGE_ROOT`) |

### Shape A — must-have pieces

| Concern | Typical path | Notes |
|---------|--------------|-------|
| Mode switch | `lib/db/mode.ts` | `DATABASE_URL` → plain PG |
| Pool | `lib/db/pool.ts` | Shared `pg` pool; parse `numeric` as float |
| Query compat | `lib/db/supabase-compat.ts` | Select/embed/upsert; `.contains`; relation filters (`categories.slug`) |
| FK embeds | `lib/db/fk-map.ts` | **Per-project** |
| Auth shim | `lib/db/auth.ts` + `app/auth/v1/[...path]` | bcrypt + JWT |
| Storage shim | `lib/db/storage.ts` + `app/storage/v1/object/...` | Disk under `STORAGE_ROOT` |
| REST shim | `app/rest/v1/[table]` + `rpc/[fn]` | Browser supabase-js |

### Env cutover trio (shimmed stores — set together)

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | Enables in-process Postgres |
| `NEXT_PUBLIC_USE_PLAIN_PG=true` | Edge middleware JWT path (no `pg` on Edge) |
| `NEXT_PUBLIC_SUPABASE_URL` | **App origin**, not `*.supabase.co` |

Also usually required: `AUTH_JWT_SECRET` / `JWT_SECRET`, `NEXT_PUBLIC_APP_URL`, `STORAGE_ROOT` / `STORAGE_LOCAL_PATH`, `RESEND_API_KEY`, payment/SMS keys.

**Failure mode:** `DATABASE_URL` set but `NEXT_PUBLIC_USE_PLAIN_PG` unset → server on PG, middleware still hitting hosted Supabase → admin lockouts.

### Shim / API pitfalls (every project)

- Nested embeds need correct `fk-map` (and often auto-include join FK columns).
- Browser storage uploads: multipart / Content-Type handling.
- RPCs at checkout (`mark_order_paid`, `upsert_customer_from_order`, `update_customer_stats`) must exist in the live DB.
- Order lookups by `order_number` must not cast non-UUID strings to UUID.
- **Count / `Prefer: count=exact`:** return `Content-Range: */N` for head/empty responses (shop “12 of 0” bug) — shimmed stores.
- Auth routes that return **204** must not call `NextResponse.json(..., { status: 204 })`.
- Customer `GET /api/orders/[id]` must enforce ownership (staff OR matching `user_id`); do not leave guest-open reads.

---

## 2. Deploy & build hygiene (Coolify / Dockerfile)

### Workflow

1. Commit on `main` (or staging branch).
2. `git push origin HEAD`.
3. `sudo fleet deploy <app-name>`.
4. Confirm live image hash matches commit (`docker ps` image tag ≈ git SHA).
5. Smoke-test home, auth, shop, one admin write, one storefront read.
6. If the store is a PWA, **bump the service-worker cache version** whenever HTML/chunk strategy changes (see §16).

### Common build / deploy failures

| Symptom | Fix pattern |
|---------|-------------|
| `npm ci` `ECONNRESET` | Retry deploy (network); not a code bug |
| TypeScript: local `const sendEmail = Boolean(...)` shadows import | Rename local flag (`wantEmail`) |
| Invalid `eslint-disable` | Remove / fix directive so `next build` passes |
| Build OK but runtime 503 on `/auth/v1` or `/rest/v1` | Missing `DATABASE_URL` in Coolify env |
| Deploy queued but **old SHA still live** | Wait / check Coolify queue; confirm with `docker ps` image tag — do not trust “queued” alone |
| Palette / CSS “didn’t change” on production | Almost always stale container SHA, not Tailwind |

### Image optimizer on Coolify (critical)

Two failure modes:

1. `/_next/image?url=...` returns **HTTP 200 with `Content-Length: 0`** (sharp broken).
2. Logs: `EACCES: permission denied, mkdir '/app/.next/cache'` (standalone runs as non-root `nextjs`).

**Fix both:**

```ts
// next.config.ts
images: {
  unoptimized: true, // serve originals until sharp + cache are healthy
  // remotePatterns: your domain /uploads or /storage only — drop via.placeholder.com + old *.supabase.co when cut over
}
```

```dockerfile
# Dockerfile runner stage (after copying standalone + static)
RUN mkdir -p /app/.next/cache /var/www/<store>/uploads \
  && chown -R nextjs:nodejs /app/.next /var/www/<store>
USER nextjs
```

Static files under `public/` still work; Next Image just skips optimization when `unoptimized: true`.

### Uploads volume (Mamator pattern)

- Host path: `/var/www/mamator/uploads` (adapt slug).
- Coolify mount into the app container; public URL `/uploads/...`.
- After DB restore, copy restore tree: `sudo cp -a ~/mamator-restore/uploads/. /var/www/mamator/uploads/` then `chown 1000:1000` (or the container UID).
- Verify: `curl -sI https://<host>/uploads/<known-file>` → 200 + non-zero size.

---

## 3. Performance: images

### Apply on every store with heavy heroes / uploads

1. **Batch compress `public/`** → WebP (keep PWA icons as PNG if manifest requires).
2. **Batch compress production storage** on VPS (`STORAGE_ROOT` / uploads).
3. **Compress on upload** via `lib/image-compress.ts` (sharp) when the route exists.
4. Point code at `.webp` paths; keep a **resolver** for legacy `.png` CMS/DB URLs.
5. Prefer a **same-origin** placeholder (`/logo.png` or `/images/product-placeholder.svg`) over `via.placeholder.com`.

### Shared product-image helper (recommended)

Add something like `lib/product-display.ts` + `lib/storage-url.ts` when the store still has mixed absolute/relative image URLs.

### After converting heroes to WebP

Update both code defaults and **DB banner/category image URLs** (admin often still stores old `.png`).

---

## 4. Storefront UX (adapt per brand)

Apply only when the merchant wants them.

| Change | Intent | Adapt |
|--------|--------|-------|
| Remove homepage hero trust strip | Less clutter in first viewport | Don’t remove shipping facts from `/shipping` unless asked |
| Short promo copy | Long category descriptions as headlines look broken | Use **category name** as title; `line-clamp-1` on description |
| Footer Collection links | Dead links kill SEO/trust | Map to real routes |
| Shipping / returns copy | Match real ops | Remove “free shipping over X” and **“30-day returns”** if not offered |
| Duplicate CTAs | Less confusion | Drop footer Concierge if same as Contact |
| Social login stubs | Don’t tease dead features | Remove disabled Google/Facebook until OAuth is wired |
| Brand palette | Consistency | Prefer tokens (`store-navy`, `store-primary`) over `stone-*` / random charcoal CTAs; primary CTAs often match hero accent |

**Rule:** one job per section; don’t leave fake UI (`alert('coming soon')`, disabled social buttons, stub admin actions).

---

## 5. Shop grid reliability

### Symptoms seen in production

- “Showing 12 of **0** products”
- White screen: *Application error: a client-side exception…*
- Grid jumps / remounts while scrolling
- Uneven card rows

### Patterns

1. **Counts:** separate count query; REST `Content-Range: */N` for empty/head counts (§1) on shimmed stores.
2. **Active only:** `.eq('status', 'active')` / `status = 'active'` on shop, homepage featured, PDP.
3. **Client cache:** `lib/query-cache.ts` — do **not** cache `{ error: … }` responses.
4. **Stable scroll:** don’t put unstable `categories` identity in product-fetch deps; only skeleton when `products.length === 0`; fixed card heights; stable sort tie-break `id`.
5. **Price safety:** always `Number(price)` / `money()` before `.toFixed` (numeric/string edge cases white-screen the grid **and admin** — see §10a).
6. **CMS hook:** `useCMS()` should return a default context, not throw.
7. Add `app/error.tsx` (+ `app/admin/error.tsx`) with Recover / Shop / Dashboard CTAs.

---

## 6. Product detail page (PDP)

| Issue | Fix |
|-------|-----|
| “Image unavailable” | Often **service worker** image fallback (§16), not React; also resolve URLs |
| GH₵0.00 / Out of stock | Variant-aware commerce helper when variants exist |
| Draft/archived visible | Filter `status = 'active'` on client + `generateMetadata` |
| Placeholder host | Prefer same-origin placeholder over `via.placeholder.com` |

---

## 7. Checkout & saved addresses

### Problem

Address book UI is a stub (local state), or checkout only prefills **email**.

### Pattern (Mamator)

1. Table `addresses` already in schema — wire `GET/POST /api/addresses`, `PATCH/DELETE /api/addresses/[id]`.
2. Account `AddressBook` loads/saves via API (map UI fields ↔ `full_name`, `address_line1`, `state`, `postal_code`).
3. Checkout (logged-in): load addresses → default first → radio list; “new address” clears form.
4. On place order, if “Save this address” (default on) or no addresses yet → `POST /api/addresses`.
5. Keep mapping helpers in a **client-safe** file (`lib/address-map.ts`) — never import `lib/db` into client components.

Field map: account `state` ≈ checkout `region`; `address_line1` ≈ `address`. Use `postal_code: '-'` when Ghana checkout has no ZIP field.

---

## 8. Account order actions (no “coming soon”)

| Button | Behavior |
|--------|----------|
| Track Order | `/order-tracking?order=…&email=…` (email required for security) |
| Reorder | Resolve `product_id` / slug via storefront product API, `addToCart`, open cart |
| Invoice | Owner-only page e.g. `/account/invoice/[id]?print=true` |
| Get Help | `/contact?order=…&subject=…` and prefill contact form |

Never ship `alert('… coming soon!')` on primary commerce actions. Hide buttons that have no backend (e.g. bulk restock) instead of stubbing them.

---

## 9. Newsletter (replace fake subscribe)

1. `POST /api/newsletter/subscribe` (rate-limited).
2. Upsert into `customers` with tag `newsletter`.
3. Welcome email via `lib/notifications.ts`.
4. Promo code from `NEWSLETTER_PROMO_CODE` (create matching coupon if promised).

Env: `RESEND_API_KEY`, `ADMIN_EMAIL`, `NEWSLETTER_PROMO_CODE`.

---

## 10. Payments & notifications

- Set `MOOLRE_MERCHANT_EMAIL` (and fallbacks) to the real store inbox in Coolify.
- On payment confirm: `mark_order_paid` + `update_customer_stats` (or live admin aggregation — §11).
- Never shadow imported `sendEmail` with a boolean flag.

---

## 10a. Admin crashes: Postgres numerics as strings (Mamator lesson)

### Symptom

Whole admin section shows `app/error.tsx` (“Something went wrong”) after products/orders load. Layout/sidebar may still render.

### Cause

`pg` / JSON often returns `numeric` as **strings**. Render code like `product.price.toFixed(2)` throws `TypeError` and trips the error boundary.

### Pattern

```ts
// lib/format-money.ts
export function asNumber(value: unknown, fallback = 0): number { /* Number.isFinite */ }
export function money(value: unknown, digits = 2): string { /* asNumber().toFixed */ }
```

Use across admin (and storefront) before every `.toFixed` / money reduce. Also guard `(name || '').toLowerCase()` and `Array.isArray(apiData)` before `.map`.

Add `app/admin/error.tsx` that shows `error.message` + link back to `/admin` (not only Shop).

---

## 11. Admin: customers order counts

`customers.total_orders` / `total_spent` go stale if RPCs miss some paid paths.

**Recommended:** on admin customers list, load recent orders (cap ~5000), aggregate by email + `user_id`, merge onto rows, optionally append guest buyers. Prefer live aggregation even after SQL backfill.

---

## 12. Product SEO

1. `lib/product-seo.ts` (`slugify`, `buildProductSeo`).
2. Admin product form auto-fills SEO when empty / on name change.
3. Match DB status enum casing.
4. One-shot backfill script with `DATABASE_URL` when needed.

---

## 13. Blog (don’t leave stubs)

Real CRUD on `blog_posts`, slug uniqueness, featured image upload, storefront slug URLs, HTML sanitize. Or hide the module — don’t leave “coming soon”.

---

## 14. Admin reliability checklist

| Area | What to verify |
|------|----------------|
| Admin layout | Session resolves; no infinite “Loading Admin…”; don’t render chrome when unauthenticated |
| Products list | Loads without error boundary; prices display; filters work |
| Product create | Slug collision; images upload to `/uploads` |
| Categories | FK-safe delete |
| Orders list | Shows orders; resend payment link sends auth |
| Inventory | Export works; hide stub Bulk Restock until backend exists |
| Analytics / Coupons / POS | No `.toFixed` crashes on string numerics |
| Reviews | Status enum matches DB |
| Customers | Live order aggregation (§11) |
| Blog | Real editor or hidden module |
| Auth | Signup, login, logout, **address book → checkout autofill** |

---

## 15. Brand / ops copy (project-specific)

- Merchant emails (`MOOLRE_MERCHANT_EMAIL`, `ADMIN_EMAIL`)
- Shipping / returns: no free-shipping or 30-day returns promises if unpaid / no portal
- Footer: drop duplicate Concierge; fix support email / socials
- Auth: remove Google/Facebook stubs
- `site_settings` name, logo, phone
- Sitemap / canonical (`www` vs apex)
- Admin entry: prefer discreet footer © → `/admin/login` over a public “Admin Access” link

---

## 16. PWA / service worker (critical)

Stale SW caches are a top cause of **white screens** after deploys (old HTML → missing `/_next/static` chunks) and **“Image unavailable”** on product photos.

### Rules

1. **Bump `CACHE_VERSION`** on every SW behavior change (`sw-v2.4`, …).
2. **Never cache HTML / navigations / `/_next/data`.** Network-only; offline fallback = `/offline` only.
3. **Do not pre-cache `/`, `/shop`, etc.** Pre-cache only offline shell + tiny static assets (icons, manifest).
4. **Same-origin `/uploads/` and `/storage/`** — **network only** (cache-first + SVG “Image unavailable” poisons product images).
5. Hashed `/_next/static` can stay cache-first (MIME-guard: never cache HTML as JS/CSS).
6. On activate, delete caches that don’t match current version names.
7. Don’t force `user-select: text` on all links (blinking caret). Use `select-none` on header/nav/footer chrome.

After deploy, ask merchants on PWA installs to **hard refresh once** or reopen the app.

---

## 17. Verification checklist (copy per project)

Replace `$BASE`, uuid prefix, and app name.

```bash
# Deploy image matches commit
ssh big-vps "sudo docker ps --format '{{.Image}} {{.Status}}' | grep <uuid-prefix>"
git rev-parse --short HEAD

# Storefront
curl -s -o /dev/null -w "%{http_code}\n" "$BASE/"
curl -s -o /dev/null -w "%{http_code}\n" "$BASE/shop"
curl -s -o /dev/null -w "%{http_code}\n" "$BASE/blog"
curl -s -o /dev/null -w "%{http_code}\n" "$BASE/offline"
curl -s -o /dev/null -w "%{http_code}\n" "$BASE/admin/login"

# SW version bump visible
curl -s "$BASE/service-worker.js" | head -n 3

# Uploads (pick a known file from DB)
curl -sI "$BASE/uploads/<file>" | head -n 5

# Newsletter (use a real-looking email; some validators reject example.com)
curl -s -X POST "$BASE/api/newsletter/subscribe" \
  -H "Content-Type: application/json" \
  -d '{"email":"verify.newsletter@gmail.com"}'

# Storefront APIs
curl -s "$BASE/api/storefront/products?featured=true&limit=2" | head -c 300
curl -s "$BASE/api/storefront/categories" | head -c 200

# Auth (expect 401 on bad creds, not 500)
curl -s -o /dev/null -w "%{http_code}\n" -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"nobody@example.com","password":"wrong"}'

# Shimmed stores only:
# curl -s "$BASE/rest/v1/site_settings?select=key&limit=1"
```

Manual:

- [ ] Live docker image SHA == `git rev-parse HEAD`
- [ ] Homepage hero + category images load (not black / empty)
- [ ] Shop: total count correct; no white-screen; scroll stable
- [ ] PDP: image + price/stock match admin for active products
- [ ] Cart has no returns promise if returns aren’t offered
- [ ] Login has no dead Google/Facebook buttons
- [ ] Logged-in checkout autofills / selects saved address
- [ ] Order history: Track (with email) / Reorder / Invoice / Help work (no alerts)
- [ ] Admin → Products / Orders / POS load without error boundary
- [ ] Admin → Customers order counts sensible for known buyers
- [ ] Admin → Blog saves (or module hidden)
- [ ] Checkout / Moolre callback still marks paid
- [ ] After deploy, PWA hard-refresh once; no white-screen on `/shop`
- [ ] CSS has brand tokens (`store-*`); no leftover stone charcoal CTAs if rebranded

---

## 18. Suggested apply order on a new store

1. Confirm Coolify app + DB env (+ shim trio if Shape A).
2. Verify REST/auth/storage **or** native `/api/*` + uploads mount.
3. Fix build blockers; set `images.unoptimized` + writable `.next/cache` on Dockerfile runners.
4. Fix service worker (§16) before heavy PWA testing.
5. `lib/format-money` + admin/storefront `.toFixed` audit (§10a).
6. Wire newsletter + merchant emails.
7. Admin customers live aggregation.
8. Product SEO helper + backfill.
9. Blog real editor or hide module.
10. Address book API + checkout autofill + order history actions.
11. Storefront UX / shipping / returns / footer / auth stub audit.
12. Full verification checklist → deploy → **re-check image hash** + PWA refresh.

---

## 19. What differs between projects

| Area | Usually differs |
|------|-----------------|
| Shape A vs B | Shims vs native `lib/db` |
| `fk-map.ts` | Table/column names (Shape A) |
| Payment provider | Moolre vs other |
| Storage path / volume | Coolify mount (`/uploads` vs `/storage`) |
| Enum casings | `active` vs `Active` |
| Blog / wholesale / POS modules | Enabled set |
| Brand fonts/colors | Design system |
| Shipping / returns rules | Ops reality |

If a store was **never** on Supabase, skip Shape A cutover and still apply §2–§18 for quality.

---

## 20. Reference snapshots

### Affordable Perfumes GH

| Item | Value |
|------|--------|
| Repo | `katalambano878/affordableperfume` |
| Coolify app | `affordableperfume-app` |
| UUID prefix | `slrbujar86myr4hgjh4lzwb9` |
| Production | https://www.affordableperfumesgh.com |
| Shape | A — shimmed Supabase-js → plain PG |

Reusable: `lib/db/*`, compress scripts, `product-seo`, newsletter route, customers aggregation, blog form, shop scroll patterns, SW network-only HTML.

### Mamator (this repo)

| Item | Value |
|------|--------|
| Repo | `ecrimah/tshirts` |
| Coolify app | `mamator-app` |
| UUID prefix | `v4psxy3fysqewkdnj1ja1w0k` |
| Production | https://mamator.com |
| Shape | B — native Postgres (`lib/db.ts`, `/api/*`) |
| Uploads | `/var/www/mamator/uploads` → `/uploads/...` |
| Brand | Navy `#0a1931` / accent `#6ab0ff` (`store-*` tokens) |
| Notable (Jul 2026) | Domain+SSL → uploads restore → palette deploy SHA trap → SW v2.4 → addresses/checkout → order actions → admin `money()` + image cache EACCES |

Reusable artifacts in this repo:

- `lib/format-money.ts` — admin/storefront numeric safety  
- `lib/address-map.ts` + `lib/data/addresses.ts` + `/api/addresses`  
- `app/account/invoice/[id]` + hardened `OrderHistory`  
- `public/service-worker.js` (`sw-v2.4` rules)  
- `app/error.tsx` + `app/admin/error.tsx`  
- `lib/query-cache.ts` (skip caching errors)  
- `Dockerfile` `.next/cache` ownership + `next.config.ts` `images.unoptimized`  
- `app/api/newsletter/subscribe`  
- Admin customers live order aggregation in `app/api/admin/customers`

### Mamator quick verify

```bash
BASE=https://mamator.com
ssh big-vps "sudo docker ps --format '{{.Image}}' | grep v4psxy3"
curl -s -o /dev/null -w "%{http_code}\n" "$BASE/"
curl -s -o /dev/null -w "%{http_code}\n" "$BASE/shop"
curl -s "$BASE/service-worker.js" | head -n 3
curl -s "$BASE/api/storefront/products?featured=true&limit=2" | head -c 300
```

### Efescloset

| Item | Value |
|------|--------|
| Repo | `katalambano878/efes` |
| Coolify app | `efes-app` / `efes-staging` |
| UUID prefix | `f5iff1hstno90gvlr3etzl5i` |
| Production | https://www.efescloset.com |
| Shape | A — shimmed Supabase-js → plain PG |
| DB | `fleet-postgres` / `efes` |
| Storage | `STORAGE_ROOT` → `/storage/v1/...` |
| Branch | `staging/plain-postgres` |
| Payments | Moolre + Hubtel |
| Notable (Jul 2026) | Compat relation filters + `.contains`; SW v2.5 (no HTML shell); `money()`; newsletter API; invoice route |

```bash
BASE=https://www.efescloset.com
ssh big-vps "sudo docker ps --format '{{.Image}}' | grep f5iff1"
curl -s "$BASE/api/storefront/shop?categorySlugs=two-pieces" | head -c 300
curl -s "$BASE/service-worker.js" | head -n 3
```

---

*Keep this playbook updated when a new store invents a better pattern — add a short note under the relevant section, not a second competing doc.*

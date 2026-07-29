# Performance Report — Efescloset

**Scope:** Jul 2026 audit wave · Production `efes-app` on Coolify

---

## Incident: blank shop product images

### Root cause

Product images under `/storage/v1/object/public/` were served with **wrong `Content-Type`** (e.g. `image/webp` header on **PNG bytes**, or extension-based guess ignoring actual format). Combined with:

- `X-Content-Type-Options: nosniff` (middleware + `next.config.ts`)
- Browser strict MIME enforcement

→ Images failed to decode; shop grid showed empty/grey placeholders.

### Fix

1. **`lib/db/storage.ts` + `lib/image-compress.ts`:** `sniffImageContentType()` reads magic bytes; served `Content-Type` matches actual bytes.
2. **Batch compression:** Production storage ~**87 MB → ~7.4 MB** after WebP conversion on VPS.
3. **Upload path:** New admin uploads compressed to WebP via sharp when smaller.
4. **Public heroes:** `public/hero*.webp` and page heroes updated from PNG sources.
5. **`LazyImage`:** Uses native `<img>` for `/storage/` URLs (bypasses broken `/_next/image` on Coolify); retry query param on error.
6. **Service worker:** `/storage/`, `/uploads/`, `/_next/image` → **network-only** (no stale/wrong MIME cache poisoning).

---

## Image delivery stack

| Layer | Setting |
|-------|---------|
| `next.config.ts` | `images.unoptimized: true` — intentional on Coolify |
| Remote patterns | Same-origin `/storage/v1/object/public/**` only; no `via.placeholder.com` or `*.supabase.co` |
| Storage route | `Cache-Control: public, max-age=86400, immutable` |
| Middleware | `/storage/v1/object/public/` gets long cache; API/rest/auth get `no-store` |

### Why `unoptimized: true`

Coolify nixpacks/standalone commonly hits:

- `/_next/image` → HTTP 200 with **empty body** (sharp broken), or
- `EACCES` on `/app/.next/cache`

Serving originals from `/storage/` or `/public/` is correct until sharp + writable cache are fixed (Dockerfile `chown` — playbook §2).

---

## Service worker (`public/service-worker.js`)

Version: `sw-v2.6-efes-images-20260726`

| Asset class | Strategy |
|-------------|----------|
| HTML / admin | Network only |
| `/storage/`, `/uploads/` | **Network only** |
| `/api/storefront/*` | Network-first, short offline cache |
| `/public` static images | Cache-first (MIME guard) |
| Payment / auth API | Not intercepted |

Users need one hard refresh after deploy when SW version bumps.

---

## API caching

- Storefront API routes: `Cache-Control: public, s-maxage=900, stale-while-revalidate=1800` (next.config).
- Categories route: additional 30 min in-memory cache in handler.

---

## Remaining performance limits

| Item | Notes |
|------|-------|
| **In-memory rate limits** | `lib/rate-limit.ts` — per-process Map; not shared if Coolify scales to multiple containers |
| **Unoptimized Next images** | By design until Coolify image optimizer fixed |
| **Admin client REST** | Some admin pages hit `/rest/v1` directly — extra round trips vs consolidated APIs |
| **Chat OpenAI** | External latency; not store-critical |

---

## Verification

```bash
BASE=https://www.efescloset.com

# Content-Type matches bytes
curl -sI "$BASE/storage/v1/object/public/products/<file>" | grep -i content-type

# Shop loads with images
curl -s "$BASE/api/storefront/shop?limit=4" | head -c 500

# SW version
curl -s "$BASE/service-worker.js" | head -n 3
```

Manual: shop grid on mobile + desktop, PDP gallery, homepage hero slides, PWA offline shell (not product images).

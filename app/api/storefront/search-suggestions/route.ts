import { NextResponse } from 'next/server';
import { requireDbBackend } from '@/lib/api-gate';
import { supabaseAdmin } from '@/lib/supabase-admin';

const PRODUCT_SUGGEST_FIELDS = 'name, slug, price, product_images(url, position)';

/**
 * GET /api/storefront/search-suggestions?q=
 * Lightweight product hints for header search (name + slug match).
 */
export async function GET(request: Request) {
  const gate = requireDbBackend();
  if (gate) return gate;

  const { searchParams } = new URL(request.url);
  const raw = (searchParams.get('q') || '').trim();
  const term = raw.replace(/[%_]/g, '').replace(/"/g, '').slice(0, 80);

  if (term.length < 1) {
    return NextResponse.json(
      { products: [] },
      { headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120' } }
    );
  }

  const pattern = `%${term}%`;

  try {
    const [nameRes, slugRes] = await Promise.all([
      supabaseAdmin
        .from('products')
        .select(PRODUCT_SUGGEST_FIELDS)
        .eq('status', 'active')
        .ilike('name', pattern)
        .order('created_at', { ascending: false })
        .limit(10),
      supabaseAdmin
        .from('products')
        .select(PRODUCT_SUGGEST_FIELDS)
        .eq('status', 'active')
        .ilike('slug', pattern)
        .order('created_at', { ascending: false })
        .limit(10),
    ]);

    const rows = [...(nameRes.data || []), ...(slugRes.data || [])];
    const seen = new Set<string>();
    const merged = rows.filter((row) => {
      if (!row.slug || seen.has(row.slug)) return false;
      seen.add(row.slug);
      return true;
    }).slice(0, 10);

    const products = mapRows(merged);

    return NextResponse.json(
      { products },
      { headers: { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60' } }
    );
  } catch (e) {
    console.error('[search-suggestions]', e);
    return NextResponse.json(
      { products: [] },
      { headers: { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60' } }
    );
  }
}

function mapRows(
  rows: {
    name: string;
    slug: string;
    price: number;
    product_images: { url: string; position?: number | null }[] | null;
  }[]
) {
  return rows.map((row) => {
    const imgs = [...(row.product_images || [])].sort(
      (a, b) => (a.position ?? 0) - (b.position ?? 0)
    );
    return {
      name: row.name,
      slug: row.slug,
      price: row.price,
      image: imgs[0]?.url ?? null,
    };
  });
}

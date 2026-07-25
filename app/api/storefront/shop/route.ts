import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { isPlainPostgres } from '@/lib/db/mode';

/**
 * GET /api/storefront/shop
 * Returns products for the shop with product_images (service role so images always load).
 * Query params: search, categorySlugs (comma-separated or 'all'), priceMin, priceMax, rating, sortBy, page, limit
 */
export async function GET(request: Request) {
  if (!isPlainPostgres() && !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: 'Server misconfiguration' }, { status: 503 });
  }

  const { searchParams } = new URL(request.url);
  const search = searchParams.get('search') || '';
  const categorySlugs = searchParams.get('categorySlugs') || 'all';
  const priceMin = parseInt(searchParams.get('priceMin') || '0', 10);
  const priceMax = parseInt(searchParams.get('priceMax') || '5000', 10);
  const rating = parseInt(searchParams.get('rating') || '0', 10);
  const sortBy = searchParams.get('sortBy') || 'popular';
  const page = parseInt(searchParams.get('page') || '1', 10);
  const limit = Math.min(parseInt(searchParams.get('limit') || '9', 10), 100);
  const availability = searchParams.get('availability') || '';

  try {
    let query = supabaseAdmin
      .from('products')
      .select(
        `
        *,
        categories!inner(id, name, slug, parent_id),
        product_images(url, position),
        product_variants(id, name, price, quantity, option1, option2, image_url)
      `,
        { count: 'exact' }
      )
      .eq('status', 'active');

    if (availability === 'preorder') {
      query = query.contains('metadata', { availability_type: 'preorder' });
    }

    if (search.trim()) {
      query = query.ilike('name', `%${search.trim()}%`);
    }

    if (categorySlugs !== 'all') {
      const slugs = categorySlugs.split(',').map((s) => s.trim()).filter(Boolean);
      if (slugs.length > 0) {
        query = query.in('categories.slug', slugs);
      }
    }

    if (priceMax < 5000) {
      query = query.gte('price', priceMin).lte('price', priceMax);
    }

    if (rating > 0) {
      query = query.gte('rating_avg', rating);
    }

    switch (sortBy) {
      case 'price-low':
        query = query.order('price', { ascending: true });
        break;
      case 'price-high':
        query = query.order('price', { ascending: false });
        break;
      case 'rating':
        query = query.order('rating_avg', { ascending: false });
        break;
      case 'new':
        query = query.order('created_at', { ascending: false });
        break;
      case 'popular':
      default:
        query = query.order('created_at', { ascending: false });
        break;
    }

    const from = (page - 1) * limit;
    const to = from + limit - 1;
    query = query.range(from, to);

    const { data, error, count } = await query;

    if (error) {
      console.error('[Storefront Shop API] Error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(
      { data: data || [], count: count ?? 0 },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60',
        },
      }
    );
  } catch (e: any) {
    console.error('[Storefront Shop API] Error:', e);
    return NextResponse.json({ error: e?.message || 'Failed to fetch products' }, { status: 500 });
  }
}

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

interface DbCoupon {
  id: string;
  code: string;
  description: string | null;
  type: 'percentage' | 'fixed_amount' | 'free_shipping';
  value: number;
  minimum_purchase: number | null;
  maximum_discount: number | null;
  usage_limit: number | null;
  usage_count: number | null;
  start_date: string | null;
  end_date: string | null;
  is_active: boolean;
}

function normalize(c: DbCoupon) {
  return {
    code: c.code,
    description: c.description || '',
    type: c.type,
    value: Number(c.value) || 0,
    minimumPurchase: Number(c.minimum_purchase) || 0,
    maximumDiscount: c.maximum_discount != null ? Number(c.maximum_discount) : null,
  };
}

function isCurrentlyValid(c: DbCoupon): boolean {
  if (!c.is_active) return false;
  const now = new Date();
  if (c.start_date && new Date(c.start_date) > now) return false;
  if (c.end_date && new Date(c.end_date) < now) return false;
  if (c.usage_limit != null && (c.usage_count || 0) >= c.usage_limit) return false;
  return true;
}

// GET — list active, currently-valid coupons (for "view available coupons")
export async function GET() {
  const { data, error } = await supabaseAdmin
    .from('coupons')
    .select('id, code, description, type, value, minimum_purchase, maximum_discount, usage_limit, usage_count, start_date, end_date, is_active')
    .eq('is_active', true)
    .order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json({ coupons: [] });
  }

  const coupons = (data as DbCoupon[]).filter(isCurrentlyValid).map(normalize);
  return NextResponse.json({ coupons });
}

// POST — validate a coupon code against a subtotal
export async function POST(request: Request) {
  try {
    const { code, subtotal } = await request.json();
    if (!code || typeof code !== 'string') {
      return NextResponse.json({ valid: false, error: 'Enter a coupon code.' }, { status: 400 });
    }

    const sub = Number(subtotal) || 0;

    const { data, error } = await supabaseAdmin
      .from('coupons')
      .select('id, code, description, type, value, minimum_purchase, maximum_discount, usage_limit, usage_count, start_date, end_date, is_active')
      .ilike('code', code.trim())
      .single();

    if (error || !data) {
      return NextResponse.json({ valid: false, error: 'Invalid coupon code.' }, { status: 404 });
    }

    const c = data as DbCoupon;

    if (!c.is_active) {
      return NextResponse.json({ valid: false, error: 'This coupon is no longer active.' }, { status: 400 });
    }
    const now = new Date();
    if (c.start_date && new Date(c.start_date) > now) {
      return NextResponse.json({ valid: false, error: 'This coupon is not active yet.' }, { status: 400 });
    }
    if (c.end_date && new Date(c.end_date) < now) {
      return NextResponse.json({ valid: false, error: 'This coupon has expired.' }, { status: 400 });
    }
    if (c.usage_limit != null && (c.usage_count || 0) >= c.usage_limit) {
      return NextResponse.json({ valid: false, error: 'This coupon has reached its usage limit.' }, { status: 400 });
    }
    if (c.minimum_purchase && sub < Number(c.minimum_purchase)) {
      return NextResponse.json({
        valid: false,
        error: `Minimum purchase of GH₵${Number(c.minimum_purchase).toFixed(2)} required.`,
      }, { status: 400 });
    }

    // Compute discount
    let discount = 0;
    if (c.type === 'percentage') {
      discount = sub * (Number(c.value) / 100);
      if (c.maximum_discount != null) discount = Math.min(discount, Number(c.maximum_discount));
    } else if (c.type === 'fixed_amount') {
      discount = Math.min(Number(c.value), sub);
    } else if (c.type === 'free_shipping') {
      discount = 0; // applied to shipping, not subtotal
    }
    discount = Math.max(0, Math.round(discount * 100) / 100);

    return NextResponse.json({
      valid: true,
      coupon: normalize(c),
      discount,
    });
  } catch (e: any) {
    return NextResponse.json({ valid: false, error: e.message || 'Validation failed.' }, { status: 500 });
  }
}

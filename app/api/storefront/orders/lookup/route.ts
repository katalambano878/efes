import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { checkRateLimit, getClientIdentifier } from '@/lib/rate-limit';

/**
 * POST /api/storefront/orders/lookup
 * Guest-safe order read: requires order_number + email. Never returns other guests' orders.
 */
export async function POST(request: Request) {
  try {
    const clientId = getClientIdentifier(request);
    const rate = checkRateLimit(`order-lookup:${clientId}`, { maxRequests: 30, windowSeconds: 60 });
    if (!rate.success) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
    }

    const body = await request.json().catch(() => ({}));
    const orderNumber = typeof body.orderNumber === 'string' ? body.orderNumber.trim() : '';
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';

    if (!orderNumber || !/^ORD-\d+-\d+$/.test(orderNumber)) {
      return NextResponse.json({ error: 'Invalid order number' }, { status: 400 });
    }
    if (!email || !email.includes('@')) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }

    const { data: order, error } = await supabaseAdmin
      .from('orders')
      .select(
        'id, order_number, status, payment_status, total, subtotal, shipping_total, discount_total, currency, created_at, payment_method, shipping_method, shipping_address, metadata, email'
      )
      .eq('order_number', orderNumber)
      .maybeSingle();

    if (error || !order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    if (String(order.email || '').trim().toLowerCase() !== email) {
      // Same message as not-found to avoid enumeration
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    const { data: items } = await supabaseAdmin
      .from('order_items')
      .select('id, product_name, variant_name, quantity, unit_price, total_price, metadata')
      .eq('order_id', order.id);

    return NextResponse.json({
      order: {
        ...order,
        order_items: items || [],
      },
    });
  } catch (e: any) {
    console.error('[order lookup]', e);
    return NextResponse.json({ error: 'Lookup failed' }, { status: 500 });
  }
}

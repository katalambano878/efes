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
    const phoneDigits =
      typeof body.phone === 'string' ? body.phone.replace(/\D/g, '') : '';

    if (!orderNumber || !/^ORD-\d+-\d+$/.test(orderNumber)) {
      return NextResponse.json({ error: 'Invalid order number' }, { status: 400 });
    }

    const { data: order, error } = await supabaseAdmin
      .from('orders')
      .select(
        'id, order_number, status, payment_status, total, subtotal, shipping_total, discount_total, currency, created_at, payment_method, shipping_method, shipping_address, metadata, email, phone'
      )
      .eq('order_number', orderNumber)
      .maybeSingle();

    if (error || !order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    const orderEmail = String(order.email || '').trim().toLowerCase();
    const orderPhoneDigits = String(order.phone || '').replace(/\D/g, '');
    const emailOk = Boolean(email && orderEmail && orderEmail === email);
    const phoneOk =
      Boolean(phoneDigits && orderPhoneDigits) &&
      (orderPhoneDigits === phoneDigits ||
        orderPhoneDigits.endsWith(phoneDigits.slice(-9)) ||
        phoneDigits.endsWith(orderPhoneDigits.slice(-9)));

    // Prefer email match when the order has an email; otherwise allow phone match.
    if (orderEmail) {
      if (!emailOk) {
        return NextResponse.json({ error: 'Order not found' }, { status: 404 });
      }
    } else if (!phoneOk) {
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

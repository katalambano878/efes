import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { asNumber } from '@/lib/format-money';
import { checkRateLimit, getClientIdentifier } from '@/lib/rate-limit';

const isValidUUID = (str: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);

/**
 * POST /api/storefront/checkout
 * Creates an order using server-side product/variant prices (never trust client totals).
 */
export async function POST(request: Request) {
  try {
    const clientId = getClientIdentifier(request);
    const rate = checkRateLimit(`checkout:${clientId}`, { maxRequests: 20, windowSeconds: 60 });
    if (!rate.success) {
      return NextResponse.json({ error: 'Too many requests. Please wait a moment.' }, { status: 429 });
    }

    const body = await request.json();
    const {
      orderNumber,
      trackingNumber,
      userId,
      email,
      phone,
      tax,
      shippingCost,
      discountTotal,
      couponCode,
      deliveryMethod,
      paymentMethod,
      shippingData,
      cart,
    } = body;

    if (!orderNumber || !email || !cart?.length || !shippingData) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Resolve products + variants and reprice from DB
    const lineItems: Array<{
      product_id: string;
      product_name: string;
      variant_name: string | null;
      variant_id: string | null;
      quantity: number;
      unit_price: number;
      total_price: number;
      metadata: Record<string, unknown>;
    }> = [];

    let subtotal = 0;

    for (const item of cart) {
      const qty = Math.max(1, Math.floor(asNumber(item.quantity, 1)));
      let productId = item.id;
      let productRow: any = null;

      if (!isValidUUID(String(productId || ''))) {
        const { data: product } = await supabaseAdmin
          .from('products')
          .select('id, name, price, quantity, status, track_quantity, continue_selling, metadata, slug')
          .or(`slug.eq.${productId},id.eq.${productId}`)
          .maybeSingle();
        if (!product || product.status !== 'active') {
          return NextResponse.json(
            { error: `Product not found: ${item.name || productId}. Remove it from your cart and try again.` },
            { status: 400 }
          );
        }
        productId = product.id;
        productRow = product;
      } else {
        const { data: product } = await supabaseAdmin
          .from('products')
          .select('id, name, price, quantity, status, track_quantity, continue_selling, metadata, slug')
          .eq('id', productId)
          .maybeSingle();
        if (!product || product.status !== 'active') {
          return NextResponse.json(
            { error: `Product not available: ${item.name || productId}` },
            { status: 400 }
          );
        }
        productRow = product;
      }

      let unitPrice = asNumber(productRow.price);
      let variantName: string | null = item.variant || null;
      let variantId: string | null = item.variantId || item.variant_id || null;
      let availableQty = asNumber(productRow.quantity, 0);

      if (variantId && isValidUUID(String(variantId))) {
        const { data: variant } = await supabaseAdmin
          .from('product_variants')
          .select('id, name, price, quantity, option1, option2')
          .eq('id', variantId)
          .eq('product_id', productId)
          .maybeSingle();
        if (!variant) {
          return NextResponse.json({ error: `Variant not found for ${productRow.name}` }, { status: 400 });
        }
        unitPrice = asNumber(variant.price, unitPrice);
        variantName = variant.name || [variant.option1, variant.option2].filter(Boolean).join(' / ') || variantName;
        availableQty = asNumber(variant.quantity, 0);
      } else if (variantName) {
        // Best-effort match by name/options
        const { data: variants } = await supabaseAdmin
          .from('product_variants')
          .select('id, name, price, quantity, option1, option2')
          .eq('product_id', productId);
        const match = (variants || []).find(
          (v: any) =>
            v.name === variantName ||
            v.option2 === variantName ||
            `${v.option1} / ${v.option2}` === variantName
        );
        if (match) {
          variantId = match.id;
          unitPrice = asNumber(match.price, unitPrice);
          availableQty = asNumber(match.quantity, 0);
        }
      }

      if (productRow.track_quantity !== false && !productRow.continue_selling && availableQty < qty) {
        return NextResponse.json(
          { error: `Insufficient stock for ${productRow.name}${variantName ? ` (${variantName})` : ''}` },
          { status: 400 }
        );
      }

      const lineTotal = unitPrice * qty;
      subtotal += lineTotal;
      lineItems.push({
        product_id: productId,
        product_name: productRow.name || item.name,
        variant_name: variantName,
        variant_id: variantId,
        quantity: qty,
        unit_price: unitPrice,
        total_price: lineTotal,
        metadata: {
          image: item.image || null,
          slug: productRow.slug || item.slug || null,
          preorder_shipping: productRow.metadata?.preorder_shipping || null,
        },
      });
    }

    const shippingTotal = Math.max(0, asNumber(shippingCost, 0));
    let discount = Math.max(0, asNumber(discountTotal, 0));
    let appliedCoupon: string | null = null;

    if (couponCode) {
      const code = String(couponCode).trim();
      const { data: coupon } = await supabaseAdmin
        .from('coupons')
        .select('*')
        .ilike('code', code)
        .maybeSingle();
      if (coupon && (coupon.status === 'active' || coupon.is_active === true)) {
        appliedCoupon = coupon.code;
        if (coupon.type === 'percentage' || coupon.discount_type === 'percentage') {
          discount = Math.min(subtotal, (subtotal * asNumber(coupon.value || coupon.amount)) / 100);
        } else {
          discount = Math.min(subtotal, asNumber(coupon.value || coupon.amount));
        }
      } else {
        discount = 0;
      }
    }

    const taxTotal = Math.max(0, asNumber(tax, 0));
    const total = Math.max(0, subtotal + shippingTotal + taxTotal - discount);

    const { data: order, error: orderError } = await supabaseAdmin
      .from('orders')
      .insert([
        {
          order_number: orderNumber,
          user_id: userId || null,
          email,
          phone,
          status: 'pending',
          payment_status: 'pending',
          currency: 'GHS',
          subtotal,
          tax_total: taxTotal,
          shipping_total: shippingTotal,
          discount_total: discount,
          total,
          shipping_method: deliveryMethod,
          payment_method: paymentMethod,
          shipping_address: shippingData,
          billing_address: shippingData,
          metadata: {
            guest_checkout: !userId,
            first_name: shippingData.firstName,
            last_name: shippingData.lastName,
            tracking_number: trackingNumber,
            coupon_code: appliedCoupon,
            server_priced: true,
          },
        },
      ])
      .select()
      .single();

    if (orderError) {
      console.error('Order insert error:', orderError);
      return NextResponse.json({ error: orderError.message }, { status: 500 });
    }

    const { error: itemsError } = await supabaseAdmin.from('order_items').insert(
      lineItems.map((li) => ({ ...li, order_id: order.id }))
    );
    if (itemsError) {
      console.error('Order items insert error:', itemsError);
      await supabaseAdmin.from('orders').delete().eq('id', order.id);
      return NextResponse.json({ error: itemsError.message }, { status: 500 });
    }

    const fullName = `${shippingData.firstName || ''} ${shippingData.lastName || ''}`.trim();
    try {
      await supabaseAdmin.rpc('upsert_customer_from_order', {
        p_email: shippingData.email || email,
        p_phone: shippingData.phone || phone,
        p_full_name: fullName,
        p_first_name: shippingData.firstName,
        p_last_name: shippingData.lastName,
        p_user_id: userId || null,
        p_address: shippingData,
      });
    } catch (e: any) {
      console.warn('upsert_customer_from_order warning:', e.message);
    }

    // Coupon usage should increment on paid — still best-effort at checkout for now
    if (appliedCoupon) {
      try {
        const { data: coupon } = await supabaseAdmin
          .from('coupons')
          .select('id, usage_count')
          .ilike('code', appliedCoupon)
          .single();
        if (coupon) {
          await supabaseAdmin
            .from('coupons')
            .update({ usage_count: (coupon.usage_count || 0) + 1 })
            .eq('id', coupon.id);
        }
      } catch (e: any) {
        console.warn('coupon usage increment warning:', e.message);
      }
    }

    return NextResponse.json({ order });
  } catch (error: any) {
    console.error('Checkout API error:', error);
    return NextResponse.json({ error: error.message || 'Checkout failed' }, { status: 500 });
  }
}

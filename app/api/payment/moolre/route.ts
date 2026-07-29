import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { checkRateLimit, getClientIdentifier, RATE_LIMITS } from '@/lib/rate-limit';

export async function POST(req: Request) {
    try {
        // Rate limiting
        const clientId = getClientIdentifier(req);
        const rateLimitResult = checkRateLimit(`payment:${clientId}`, RATE_LIMITS.payment);

        if (!rateLimitResult.success) {
            return NextResponse.json(
                { success: false, message: 'Too many requests. Please try again later.' },
                {
                    status: 429,
                    headers: {
                        'X-RateLimit-Remaining': '0',
                        'X-RateLimit-Reset': rateLimitResult.resetIn.toString()
                    }
                }
            );
        }

        const body = await req.json();
        const { orderId, customerEmail } = body;

        if (!orderId || typeof orderId !== 'string') {
            return NextResponse.json({ success: false, message: 'Missing or invalid orderId' }, { status: 400 });
        }

        // Ensure environment variables are set
        if (!process.env.MOOLRE_API_USER || !process.env.MOOLRE_API_PUBKEY || !process.env.MOOLRE_ACCOUNT_NUMBER) {
            console.error('Missing Moolre credentials');
            return NextResponse.json({ success: false, message: 'Payment gateway configuration error' }, { status: 500 });
        }

        // SECURITY: Fetch the order from the database and use its total.
        // NEVER trust the amount from the client.
        const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(orderId);
        const query = supabaseAdmin
            .from('orders')
            .select('id, order_number, total, email, payment_status');

        const { data: order, error: orderError } = isUUID
            ? await query.eq('id', orderId).single()
            : await query.eq('order_number', orderId).single();

        if (orderError || !order) {
            console.error('[Payment] Order not found:', orderId);
            return NextResponse.json({ success: false, message: 'Order not found' }, { status: 404 });
        }

        // Don't allow payment for already-paid orders
        if (order.payment_status === 'paid') {
            return NextResponse.json({ success: false, message: 'Order is already paid' }, { status: 400 });
        }

        // Use the database amount, NOT the client-provided amount
        const amount = Number(order.total);
        if (!amount || amount <= 0) {
            return NextResponse.json({ success: false, message: 'Invalid order amount' }, { status: 400 });
        }

        const orderRef = order.order_number || orderId;

        const requestUrl = new URL(req.url);
        const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || requestUrl.origin).replace(/\/+$/, '');

        // Generate a unique external reference for Moolre
        const uniqueRef = `${orderRef}-R${Date.now()}`;

        // Persist latest payment attempt reference so verification/callback can reliably reconcile retries.
        const { data: existingOrderForMeta, error: metaFetchError } = await supabaseAdmin
            .from('orders')
            .select('metadata')
            .eq('order_number', orderRef)
            .single();

        const mergedMetadata = {
            ...(existingOrderForMeta?.metadata || {}),
            payment_method: 'moolre',
            moolre_externalref: uniqueRef,
            payment_attempted_at: new Date().toISOString()
        };

        const { error: orderUpdateError } = await supabaseAdmin
            .from('orders')
            .update({
                payment_status: 'pending',
                metadata: mergedMetadata
            })
            .eq('order_number', orderRef);

        if (orderUpdateError) {
            console.error('[Payment] Failed to update order metadata:', orderUpdateError.message);
            return NextResponse.json({ success: false, message: `Failed to prepare payment: ${orderUpdateError.message}` }, { status: 500 });
        }

        // Moolre Payload
        const payload = {
            type: 1,
            amount: amount.toString(),
            email: process.env.MOOLRE_MERCHANT_EMAIL || 'admin@example.com',
            externalref: uniqueRef,
            callback: `${baseUrl}/api/payment/moolre/callback`,
            redirect: `${baseUrl}/order-success?order=${encodeURIComponent(orderRef)}&email=${encodeURIComponent(customerEmail || order.email || '')}&payment_success=true`,
            reusable: "0",
            currency: "GHS",
            accountnumber: process.env.MOOLRE_ACCOUNT_NUMBER,
            metadata: {
                customer_email: customerEmail || order.email,
                original_order_number: orderRef
            }
        };

        console.log('[Payment] Initiating for order:', orderRef, '| Amount from DB:', amount, '| ExternalRef:', uniqueRef, '| Callback:', payload.callback);

        const response = await fetch('https://api.moolre.com/embed/link', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-API-USER': process.env.MOOLRE_API_USER,
                'X-API-PUBKEY': process.env.MOOLRE_API_PUBKEY
            },
            body: JSON.stringify(payload)
        });

        const result = await response.json();
        console.log('[Payment] Response status:', result.status, '| Has URL:', !!result.data?.authorization_url);

        if (result.status === 1 && result.data?.authorization_url) {
            return NextResponse.json({ success: true, url: result.data.authorization_url, reference: result.data.reference });
        } else {
            return NextResponse.json({ success: false, message: result.message || 'Failed to generate payment link' }, { status: 400 });
        }

    } catch (error: any) {
        console.error('Payment API Error:', error);
        return NextResponse.json({ success: false, message: 'Internal Server Error' }, { status: 500 });
    }
}

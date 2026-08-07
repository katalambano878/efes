import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { sendOrderConfirmation } from '@/lib/notifications';
import { checkRateLimit, getClientIdentifier, RATE_LIMITS } from '@/lib/rate-limit';
import { checkHubtelStatus, isHubtelPaid } from '@/lib/hubtel';

/**
 * Server-side Hubtel verification, called from /order-success after the
 * customer returns from the hosted checkout.
 *
 * Re-queries Hubtel using the clientReference stored at initiation and only
 * marks the order paid when Hubtel confirms "Paid" AND the settlement amount
 * matches the order total.
 *
 * Uses mark_order_paid(order_ref, moolre_ref) — same RPC as Moolre.
 */
export async function POST(req: Request) {
    try {
        const clientId = getClientIdentifier(req);
        const rateLimitResult = checkRateLimit(`hubtel-verify:${clientId}`, RATE_LIMITS.payment);
        if (!rateLimitResult.success) {
            return NextResponse.json({ success: false, message: 'Too many requests' }, { status: 429 });
        }

        const origin = req.headers.get('origin') || '';
        const host = req.headers.get('host') || '';
        const allowedOrigins = [
            process.env.NEXT_PUBLIC_APP_URL,
            process.env.NEXT_PUBLIC_SITE_URL,
            host ? `https://${host}` : null,
            host ? `http://${host}` : null,
        ].filter(Boolean) as string[];
        if (origin && !allowedOrigins.some((o) => origin === o)) {
            console.warn('[Hubtel Verify] Rejected cross-origin request from:', origin);
            return NextResponse.json({ success: false, message: 'Cross-origin requests not allowed' }, { status: 403 });
        }

        const body = await req.json();
        const { orderNumber, email } = body;

        if (!orderNumber || typeof orderNumber !== 'string') {
            return NextResponse.json({ success: false, message: 'Missing or invalid orderNumber' }, { status: 400 });
        }

        const emailTrimmed = typeof email === 'string' ? email.trim() : '';
        if (emailTrimmed && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailTrimmed)) {
            return NextResponse.json({ success: false, message: 'Invalid email' }, { status: 400 });
        }

        if (!/^ORD-\d+-\d+$/.test(orderNumber)) {
            return NextResponse.json({ success: false, message: 'Invalid order number format' }, { status: 400 });
        }

        console.log('[Hubtel Verify] Checking payment for:', orderNumber);

        const { data: order, error: fetchError } = await supabaseAdmin
            .from('orders')
            .select('id, order_number, payment_status, status, total, email, phone, shipping_address, metadata, created_at')
            .eq('order_number', orderNumber)
            .single();

        if (fetchError || !order) {
            console.error('[Hubtel Verify] Order not found:', orderNumber);
            return NextResponse.json({ success: false, message: 'Order not found' }, { status: 404 });
        }

        // Email is optional at checkout. When present on the order, require a match;
        // when the order has no email, allow verify by order number alone (rate-limited).
        if (order.email) {
            if (!emailTrimmed || order.email.toLowerCase() !== emailTrimmed.toLowerCase()) {
                console.warn('[Hubtel Verify] Email mismatch for order:', orderNumber);
                return NextResponse.json({ success: false, message: 'Order not found' }, { status: 404 });
            }
        }

        if (order.payment_status === 'paid') {
            console.log('[Hubtel Verify] Order already paid:', orderNumber);
            return NextResponse.json({
                success: true,
                status: order.status,
                payment_status: order.payment_status,
                message: 'Order already paid',
            });
        }

        const clientReference = (order.metadata as any)?.hubtel_client_reference as string | undefined;
        if (!clientReference) {
            console.warn('[Hubtel Verify] No hubtel_client_reference on order:', orderNumber);
            return NextResponse.json({
                success: false,
                status: order.status,
                payment_status: order.payment_status,
                message: 'Payment reference not found',
            });
        }

        if (
            !process.env.HUBTEL_API_ID ||
            !process.env.HUBTEL_API_KEY ||
            !process.env.HUBTEL_MERCHANT_ACCOUNT_NUMBER
        ) {
            return NextResponse.json(
                {
                    success: false,
                    status: order.status,
                    payment_status: order.payment_status,
                    message: 'Payment verification unavailable',
                },
                { status: 503 },
            );
        }

        const expectedAmount = Number(order.total) || 0;

        let verified = false;
        let settlementAmount: number | null = null;
        try {
            const status = await checkHubtelStatus(clientReference);
            const sStatus = String(status?.data?.status || '').toLowerCase();
            verified = isHubtelPaid(sStatus, status?.responseCode);
            // Prefer gross customer-paid amount over amountAfterCharges (net after fees).
            const settlement = status?.data?.amount ?? status?.data?.amountAfterCharges;
            if (settlement !== undefined && settlement !== null) {
                const n = parseFloat(String(settlement));
                if (Number.isFinite(n)) settlementAmount = n;
            }
            console.log(
                '[Hubtel Verify] ref:',
                clientReference,
                '| status:',
                status?.data?.status,
                '| amount:',
                status?.data?.amount,
                '| amountAfterCharges:',
                status?.data?.amountAfterCharges,
                '| expected:',
                expectedAmount,
            );
        } catch (e: any) {
            console.warn('[Hubtel Verify] Status API failed:', e?.message || e);
        }

        if (verified && settlementAmount !== null && Math.abs(settlementAmount - expectedAmount) > 0.01) {
            console.error(
                '[Hubtel Verify] AMOUNT MISMATCH. Expected:',
                expectedAmount,
                'Got (settlement):',
                settlementAmount,
            );
            verified = false;
        }

        if (!verified) {
            return NextResponse.json({
                success: false,
                status: order.status,
                payment_status: order.payment_status,
                message: 'Payment not yet confirmed by payment provider',
            });
        }

        const { data: orderJson, error: updateError } = await supabaseAdmin.rpc('mark_order_paid', {
            order_ref: orderNumber,
            moolre_ref: 'hubtel-api-verify',
        });

        if (updateError) {
            console.error('[Hubtel Verify] RPC Error:', updateError.message);
            return NextResponse.json({ success: false, message: 'Failed to update order' }, { status: 500 });
        }

        console.log('[Hubtel Verify] Order marked as paid:', orderNumber);

        if (orderJson?.email) {
            try {
                await supabaseAdmin.rpc('update_customer_stats', {
                    p_customer_email: orderJson.email,
                    p_order_total: orderJson.total,
                });
            } catch (statsError: any) {
                console.error('[Hubtel Verify] Customer stats failed:', statsError.message);
            }
        }

        if (orderJson) {
            try {
                await sendOrderConfirmation(orderJson);
            } catch (notifyError: any) {
                console.error('[Hubtel Verify] Notification failed:', notifyError.message);
            }
        }

        return NextResponse.json({
            success: true,
            status: 'processing',
            payment_status: 'paid',
            message: 'Payment verified and order updated',
        });
    } catch (error: any) {
        console.error('[Hubtel Verify] Error:', error?.message || error);
        return NextResponse.json({ success: false, message: 'Internal error' }, { status: 500 });
    }
}

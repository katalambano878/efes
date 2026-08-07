import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { sendOrderConfirmation } from '@/lib/notifications';
import { checkRateLimit, getClientIdentifier, RATE_LIMITS } from '@/lib/rate-limit';
import { checkHubtelStatus, isHubtelPaid, stripHubtelReferenceSuffix } from '@/lib/hubtel';
import { finalizePaymentCallbackEvent, recordPaymentCallbackEvent } from '@/lib/payment-events';

/**
 * Hubtel Online Checkout callback handler.
 *
 * Security note: Hubtel doesn't sign callbacks, so on top of accepting the
 * webhook we re-query the RMSC status endpoint with the same clientReference
 * and only mark the order paid if Hubtel's own API agrees the transaction is
 * "Paid" AND the amount matches what we expected to charge.
 *
 * Uses the same mark_order_paid(order_ref, moolre_ref) RPC as Moolre —
 * the second arg is a generic payment reference field name in the schema.
 */
export async function POST(req: Request) {
    console.log('[Hubtel Callback] POST received at', new Date().toISOString());

    try {
        const clientId = getClientIdentifier(req);
        const rateLimitResult = checkRateLimit(`hubtel-callback:${clientId}`, RATE_LIMITS.callback);
        if (!rateLimitResult.success) {
            return NextResponse.json({ success: false, message: 'Too many requests' }, { status: 429 });
        }

        let body: any = {};
        const contentType = req.headers.get('content-type') || '';
        try {
            if (contentType.includes('application/json')) {
                body = await req.json();
            } else if (contentType.includes('form')) {
                const formData = await req.formData();
                body = Object.fromEntries(formData.entries());
            } else {
                const raw = await req.text();
                try {
                    body = JSON.parse(raw);
                } catch {
                    body = Object.fromEntries(new URLSearchParams(raw).entries());
                }
            }
        } catch {
            return NextResponse.json({ success: false, message: 'Invalid request body' }, { status: 400 });
        }

        const responseCode = body.ResponseCode ?? body.responseCode ?? body.code;
        const topStatus = body.Status ?? body.status;
        const data = body.Data ?? body.data ?? {};

        const rawClientReference = (
            data.ClientReference ??
            data.clientReference ??
            body.ClientReference ??
            body.clientReference ??
            ''
        ).toString();
        const merchantOrderRef = stripHubtelReferenceSuffix(rawClientReference);

        const checkoutId = (data.CheckoutId ?? data.checkoutId ?? body.CheckoutId ?? '').toString();
        const callbackAmount =
            data.Amount !== undefined && data.Amount !== null
                ? parseFloat(String(data.Amount))
                : null;

        console.log(
            '[Hubtel Callback] ref:',
            merchantOrderRef,
            '| ResponseCode:',
            responseCode,
            '| Status:',
            topStatus,
            '| innerStatus:',
            data.Status,
            '| amount:',
            callbackAmount,
            '| checkoutId:',
            checkoutId,
        );

        if (!merchantOrderRef) {
            console.error('[Hubtel Callback] Missing client reference. Body:', JSON.stringify(body).slice(0, 500));
            return NextResponse.json({ success: false, message: 'Missing client reference' }, { status: 400 });
        }

        const { id: eventId, duplicate } = await recordPaymentCallbackEvent({
            gateway: 'hubtel',
            eventType: 'payment_callback',
            externalEventId: checkoutId || null,
            internalReference: rawClientReference || null,
            gatewayReference: checkoutId || null,
            orderNumber: merchantOrderRef,
            payload: { ResponseCode: responseCode, Status: topStatus, Data: data },
            signatureStatus: 'unchecked',
            amountReported: callbackAmount,
        });
        if (duplicate) {
            await finalizePaymentCallbackEvent(eventId, 'duplicate');
            return NextResponse.json({ success: true, message: 'Duplicate callback ignored' });
        }

        const innerStatus = String(data.Status ?? topStatus ?? '').toLowerCase();
        const looksSuccessful =
            isHubtelPaid(String(topStatus || ''), responseCode) || isHubtelPaid(innerStatus, responseCode);

        const { data: existingOrder, error: fetchError } = await supabaseAdmin
            .from('orders')
            .select('id, order_number, payment_status, total, email, metadata')
            .eq('order_number', merchantOrderRef)
            .maybeSingle();

        if (fetchError || !existingOrder) {
            console.error('[Hubtel Callback] Order not found:', merchantOrderRef);
            await finalizePaymentCallbackEvent(eventId, 'failed', 'Order not found');
            return NextResponse.json({ success: false, message: 'Order not found' }, { status: 404 });
        }

        if (existingOrder.payment_status === 'paid') {
            await finalizePaymentCallbackEvent(eventId, 'duplicate');
            return NextResponse.json({ success: true, message: 'Order already processed' });
        }

        const expectedAmount = Number(existingOrder.total) || 0;

        if (!looksSuccessful) {
            console.log('[Hubtel Callback] Recording failure for', merchantOrderRef);
            await supabaseAdmin
                .from('orders')
                .update({
                    payment_status: 'failed',
                    metadata: {
                        ...(existingOrder.metadata || {}),
                        hubtel_checkout_id: checkoutId || null,
                        hubtel_response_code: String(responseCode || ''),
                        failure_reason: data.Description || body.Message || 'Payment failed',
                        failure_at: new Date().toISOString(),
                    },
                })
                .eq('order_number', merchantOrderRef)
                .neq('payment_status', 'paid');

            await finalizePaymentCallbackEvent(eventId, 'processed', 'Payment not successful');
            return NextResponse.json({ success: false, message: 'Payment not successful' });
        }

        let serverConfirmed = false;
        let confirmedSettlement: number | null = null;
        try {
            const status = await checkHubtelStatus(rawClientReference || merchantOrderRef);
            const sStatus = String(status?.data?.status || '').toLowerCase();
            serverConfirmed = isHubtelPaid(sStatus, status?.responseCode);
            // Prefer gross amount the customer paid — NOT amountAfterCharges
            // (merchant settlement after Hubtel fees), which is lower and was
            // incorrectly rejecting paid callbacks as amount mismatches.
            const settlement = status?.data?.amount ?? status?.data?.amountAfterCharges;
            if (settlement !== undefined && settlement !== null) {
                const n = parseFloat(String(settlement));
                if (Number.isFinite(n)) confirmedSettlement = n;
            }
            console.log(
                '[Hubtel Callback] RMSC status:',
                status?.data?.status,
                '| responseCode:',
                status?.responseCode,
                '| amount:',
                status?.data?.amount,
                '| amountAfterCharges:',
                status?.data?.amountAfterCharges,
                '| expected:',
                expectedAmount,
            );
        } catch (e: any) {
            console.warn('[Hubtel Callback] Status re-verification failed:', e?.message || e);
        }

        if (!serverConfirmed) {
            console.error('[Hubtel Callback] Status endpoint did not confirm payment. Rejecting.');
            await finalizePaymentCallbackEvent(eventId, 'failed', 'Not confirmed by gateway');
            return NextResponse.json(
                { success: false, message: 'Payment not confirmed by gateway' },
                { status: 400 },
            );
        }

        const amountToCheck = confirmedSettlement ?? callbackAmount;
        if (amountToCheck !== null && Math.abs(amountToCheck - expectedAmount) > 0.01) {
            console.error(
                '[Hubtel Callback] AMOUNT MISMATCH! Expected:',
                expectedAmount,
                'Got:',
                amountToCheck,
            );
            await finalizePaymentCallbackEvent(eventId, 'failed', 'Amount mismatch');
            return NextResponse.json(
                { success: false, message: 'Payment amount does not match expected charge' },
                { status: 400 },
            );
        }

        // Schema RPC param is still named moolre_ref (generic payment reference)
        const { data: orderJson, error: updateError } = await supabaseAdmin.rpc('mark_order_paid', {
            order_ref: merchantOrderRef,
            moolre_ref: checkoutId || 'hubtel-callback',
        });

        if (updateError) {
            console.error('[Hubtel Callback] RPC error:', updateError.message);
            await finalizePaymentCallbackEvent(eventId, 'failed', updateError.message);
            return NextResponse.json({ success: false, message: 'Database update failed' }, { status: 500 });
        }
        if (!orderJson) {
            await finalizePaymentCallbackEvent(eventId, 'failed', 'Order not found after RPC');
            return NextResponse.json({ success: false, message: 'Order not found' }, { status: 404 });
        }

        console.log('[Hubtel Callback] Order updated! ID:', orderJson.id, '| Status:', orderJson.status);
        await finalizePaymentCallbackEvent(eventId, 'processed');

        try {
            if (orderJson.email) {
                await supabaseAdmin.rpc('update_customer_stats', {
                    p_customer_email: orderJson.email,
                    p_order_total: orderJson.total,
                });
            }
        } catch (e: any) {
            console.error('[Hubtel Callback] Customer stats failed:', e?.message || e);
        }

        try {
            await sendOrderConfirmation(orderJson);
        } catch (e: any) {
            console.error('[Hubtel Callback] Notification failed:', e?.message || e);
        }

        return NextResponse.json({ success: true, message: 'Payment verified and order updated' });
    } catch (error: any) {
        console.error('[Hubtel Callback] Critical error:', error?.message || error);
        return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 });
    }
}

export async function GET() {
    return new NextResponse(null, { status: 405, headers: { Allow: 'POST' } });
}

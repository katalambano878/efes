import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { sendOrderConfirmation } from '@/lib/notifications';
import { checkRateLimit, getClientIdentifier, RATE_LIMITS } from '@/lib/rate-limit';
import { finalizePaymentCallbackEvent, recordPaymentCallbackEvent } from '@/lib/payment-events';

/**
 * Moolre Callback Payload Structure (from their actual API):
 * {
 *   "status": 1,
 *   "code": "P01",
 *   "message": "Transaction Successful",
 *   "data": {
 *     "txtstatus": 1,
 *     "payer": "233535998837",
 *     "terminalid": "",
 *     "accountnumber": "10789906062911",
 *     "name": "",
 *     "amount": "2",
 *     "value": "2",
 *     "transactionid": "42252702",
 *     "externalref": "ORD-1770330034217-441",
 *     "thirdpartyref": "74658410493"
 *   },
 *   "secret": "c23bc2ab-...",
 *   "ts": "2026-02-05 22:21:16",
 *   "go": null
 * }
 */

export async function POST(req: Request) {
    console.log('[Callback] POST received at', new Date().toISOString());

    try {
        // Rate limiting
        const clientId = getClientIdentifier(req);
        const rateLimitResult = checkRateLimit(`callback:${clientId}`, RATE_LIMITS.callback);

        if (!rateLimitResult.success) {
            console.warn('[Callback] Rate limited:', clientId);
            return NextResponse.json({ success: false, message: 'Too many requests' }, { status: 429 });
        }

        let body: any = {};
        const contentType = req.headers.get('content-type') || '';

        // Parse body
        try {
            if (contentType.includes('application/json')) {
                body = await req.json();
            } else if (contentType.includes('form')) {
                const formData = await req.formData();
                body = Object.fromEntries(formData.entries());
            } else {
                const rawText = await req.text();
                try {
                    body = JSON.parse(rawText);
                } catch {
                    try {
                        body = Object.fromEntries(new URLSearchParams(rawText).entries());
                    } catch {
                        console.warn('[Callback] Could not parse body');
                    }
                }
            }
        } catch (parseError) {
            console.error('[Callback] Body parsing failed');
            return NextResponse.json({ success: false, message: 'Invalid Request Body' }, { status: 400 });
        }

        console.log('[Callback] Body keys:', Object.keys(body).join(', '));
        console.log('[Callback] Data keys:', body.data ? Object.keys(body.data).join(', ') : 'no data object');

        // ============================================================
        // EXTRACT FIELDS - Moolre nests payment data inside body.data
        // ============================================================
        const data = body.data || {};

        // ============================================================
        // SECURITY: Require callback secret when configured
        // Live callbacks put `secret` inside data (and sometimes top-level).
        // ============================================================
        const expectedSecret = (process.env.MOOLRE_CALLBACK_SECRET || '').trim();
        const providedSecret = String(
            body.secret ?? data.secret ?? data?.metadata?.secret ?? '',
        ).trim();
        if (expectedSecret) {
            if (!providedSecret || providedSecret !== expectedSecret) {
                console.error(
                    '[Callback] Missing or invalid secret — rejecting.',
                    'provided=',
                    providedSecret ? `${providedSecret.slice(0, 4)}… len=${providedSecret.length}` : 'none',
                    'expected_len=',
                    expectedSecret.length,
                );
                return NextResponse.json({ success: false, message: 'Invalid secret' }, { status: 403 });
            }
        }

        // Order reference: check body.data.externalref first, then top-level fallbacks
        const rawExternalRef =
            data.externalref ||
            data.external_reference ||
            data.orderRef ||
            body.externalref ||
            body.orderRef ||
            body.external_reference;

        // Strip retry suffix (e.g., "ORD-123-R1770000000" -> "ORD-123")
        const merchantOrderRef = rawExternalRef
            ? rawExternalRef.replace(/-R\d+$/, '')
            : (data.metadata?.original_order_number || body.metadata?.original_order_number);

        // Moolre's transaction reference
        const moolreReference =
            data.transactionid ||
            data.thirdpartyref ||
            body.reference ||
            'callback';

        // Payment status: body.status === 1 means API call succeeded,
        // body.data.txtstatus === 1 means transaction was successful
        const apiStatus = body.status;
        const txStatus = data.txtstatus;
        const messageStr = String(body.message || '').toLowerCase();

        console.log('[Callback] Order ref:', merchantOrderRef,
            '| API status:', apiStatus,
            '| TX status:', txStatus,
            '| Message:', body.message,
            '| Moolre ref:', moolreReference);

        if (!merchantOrderRef) {
            console.error('[Callback] Missing order reference. Body:', JSON.stringify(body).substring(0, 500));
            return NextResponse.json({ success: false, message: 'Missing order reference' }, { status: 400 });
        }

        const callbackAmountEarly = data.amount ? parseFloat(data.amount) : (body.amount ? parseFloat(body.amount) : null);
        const { id: eventId, duplicate } = await recordPaymentCallbackEvent({
            gateway: 'moolre',
            eventType: 'payment_callback',
            externalEventId: data.transactionid ? String(data.transactionid) : null,
            internalReference: rawExternalRef ? String(rawExternalRef) : null,
            gatewayReference: String(moolreReference),
            orderNumber: merchantOrderRef,
            payload: { status: body.status, data, ts: body.ts },
            signatureStatus: expectedSecret
                ? (String(providedSecret || '') === expectedSecret ? 'valid' : 'invalid')
                : 'unchecked',
            amountReported: Number.isFinite(callbackAmountEarly as number) ? (callbackAmountEarly as number) : null,
        });
        if (duplicate) {
            await finalizePaymentCallbackEvent(eventId, 'duplicate');
            return NextResponse.json({ success: true, message: 'Duplicate callback ignored' });
        }

        // ============================================================
        // Verify payment success
        // Moolre: status=1 + data.txtstatus=1 + message contains "successful"
        // ============================================================
        const apiOk = (apiStatus === 1 || apiStatus === '1');
        const txOk = (txStatus === 1 || txStatus === '1');

        const hasFailureSignal =
            txStatus === 0 || txStatus === '0' ||
            txStatus === -1 || txStatus === '-1' ||
            messageStr.includes('fail') ||
            messageStr.includes('cancel') ||
            messageStr.includes('declin') ||
            messageStr.includes('error');
        const hasSuccessSignal =
            ((apiOk) && (txOk)) ||
            messageStr.includes('successful') ||
            messageStr.includes('completed') ||
            messageStr.includes('paid');
        const isSuccess = hasSuccessSignal && !hasFailureSignal;

        if (isSuccess) {
            console.log(`[Callback] Payment SUCCESS for Order ${merchantOrderRef}`);

            // Check if order exists
            const { data: existingOrder, error: fetchError } = await supabaseAdmin
                .from('orders')
                .select('id, order_number, payment_status, total')
                .eq('order_number', merchantOrderRef)
                .single();

            if (fetchError || !existingOrder) {
                console.error('[Callback] Order not found:', merchantOrderRef);
                await finalizePaymentCallbackEvent(eventId, 'failed', 'Order not found');
                return NextResponse.json({ success: false, message: 'Order not found' }, { status: 404 });
            }

            // Already paid - idempotent
            if (existingOrder.payment_status === 'paid') {
                console.log('[Callback] Order already paid, skipping:', merchantOrderRef);
                await finalizePaymentCallbackEvent(eventId, 'duplicate');
                return NextResponse.json({ success: true, message: 'Order already processed' });
            }

            // ============================================================
            // SECURITY: Amount required + must match order total
            // ============================================================
            const callbackAmount = callbackAmountEarly;
            if (callbackAmount === null || !Number.isFinite(callbackAmount)) {
                console.error('[Callback] Missing amount — REJECTING. Order:', merchantOrderRef);
                await finalizePaymentCallbackEvent(eventId, 'failed', 'Missing payment amount');
                return NextResponse.json({ success: false, message: 'Missing payment amount' }, { status: 400 });
            }
            const expectedAmount = Number(existingOrder.total);
            if (Math.abs(callbackAmount - expectedAmount) > 0.01) {
                console.error('[Callback] AMOUNT MISMATCH — REJECTING! Expected:', expectedAmount, 'Got:', callbackAmount, 'Order:', merchantOrderRef);
                await finalizePaymentCallbackEvent(eventId, 'failed', 'Amount mismatch');
                return NextResponse.json({
                    success: false,
                    message: 'Payment amount does not match order total'
                }, { status: 400 });
            }

            // Re-verify with Moolre status API (same pattern as Hubtel RMSC check)
            const externalRefToCheck =
                String(rawExternalRef || merchantOrderRef) ||
                merchantOrderRef;
            try {
                if (
                    process.env.MOOLRE_API_USER &&
                    process.env.MOOLRE_API_PUBKEY &&
                    process.env.MOOLRE_ACCOUNT_NUMBER
                ) {
                    const statusRes = await fetch('https://api.moolre.com/open/transact/status', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'X-API-USER': process.env.MOOLRE_API_USER,
                            'X-API-PUBKEY': process.env.MOOLRE_API_PUBKEY,
                            'X-API-KEY': process.env.MOOLRE_API_PUBKEY,
                        },
                        body: JSON.stringify({
                            type: 1,
                            idtype: '1',
                            id: externalRefToCheck,
                            accountnumber: process.env.MOOLRE_ACCOUNT_NUMBER,
                        }),
                    });
                    const statusJson: any = await statusRes.json().catch(() => ({}));
                    const sData = statusJson.data || {};
                    const sTx = sData.txstatus ?? sData.txtstatus;
                    const sOk =
                        statusJson.status === 1 &&
                        (sTx === 1 || sTx === '1');
                    const sAmount =
                        sData.amount != null ? parseFloat(String(sData.amount)) : null;
                    console.log(
                        '[Callback] Moolre status re-check:',
                        statusJson.message,
                        '| txstatus:',
                        sTx,
                        '| amount:',
                        sAmount,
                    );
                    if (!sOk) {
                        await finalizePaymentCallbackEvent(eventId, 'failed', 'Not confirmed by gateway');
                        return NextResponse.json(
                            { success: false, message: 'Payment not confirmed by gateway' },
                            { status: 400 },
                        );
                    }
                    if (
                        sAmount != null &&
                        Number.isFinite(sAmount) &&
                        Math.abs(sAmount - expectedAmount) > 0.01
                    ) {
                        await finalizePaymentCallbackEvent(eventId, 'failed', 'Amount mismatch');
                        return NextResponse.json(
                            { success: false, message: 'Payment amount does not match order total' },
                            { status: 400 },
                        );
                    }
                }
            } catch (recheckErr: any) {
                console.warn('[Callback] Status re-check failed:', recheckErr?.message || recheckErr);
                // Fail closed — do not mark paid without gateway confirmation
                await finalizePaymentCallbackEvent(eventId, 'failed', 'Status re-check failed');
                return NextResponse.json(
                    { success: false, message: 'Payment not confirmed by gateway' },
                    { status: 400 },
                );
            }

            // Mark order as paid via RPC
            const { data: orderJson, error: updateError } = await supabaseAdmin
                .rpc('mark_order_paid', {
                    order_ref: merchantOrderRef,
                    moolre_ref: String(moolreReference)
                });

            if (updateError) {
                console.error('[Callback] RPC Error:', updateError.message);
                await finalizePaymentCallbackEvent(eventId, 'failed', updateError.message);
                return NextResponse.json({ success: false, message: 'Database update failed' }, { status: 500 });
            }

            if (!orderJson) {
                console.error('[Callback] Order not found after RPC:', merchantOrderRef);
                await finalizePaymentCallbackEvent(eventId, 'failed', 'Order not found after RPC');
                return NextResponse.json({ success: false, message: 'Order not found' }, { status: 404 });
            }

            console.log('[Callback] Order updated! ID:', orderJson.id, '| Status:', orderJson.status);
            await finalizePaymentCallbackEvent(eventId, 'processed');

            // Update customer stats
            try {
                if (orderJson.email) {
                    await supabaseAdmin.rpc('update_customer_stats', {
                        p_customer_email: orderJson.email,
                        p_order_total: orderJson.total
                    });
                }
            } catch (statsError: any) {
                console.error('[Callback] Customer stats failed:', statsError.message);
            }

            // Send SMS + Email notifications
            try {
                console.log('[Callback] Sending notifications for:', orderJson.order_number);
                await sendOrderConfirmation(orderJson);
                console.log('[Callback] Notifications sent!');
            } catch (notifyError: any) {
                console.error('[Callback] Notification failed:', notifyError.message);
            }

            return NextResponse.json({ success: true, message: 'Payment verified and Order Updated' });

        } else {
            // Payment failed — never overwrite an already-paid order
            console.log(`[Callback] Payment FAILED for ${merchantOrderRef} | Status: ${apiStatus} | TX: ${txStatus}`);

            const { data: failedOrderMeta } = await supabaseAdmin
                .from('orders')
                .select('metadata, payment_status')
                .eq('order_number', merchantOrderRef)
                .single();

            if (failedOrderMeta?.payment_status === 'paid') {
                await finalizePaymentCallbackEvent(eventId, 'ignored', 'Late failure after paid');
                return NextResponse.json({ success: true, message: 'Order already paid; failure ignored' });
            }

            const mergedFailureMetadata = {
                ...(failedOrderMeta?.metadata || {}),
                moolre_reference: moolreReference,
                failure_reason: body.message || 'Payment failed'
            };

            await supabaseAdmin
                .from('orders')
                .update({
                    payment_status: 'failed',
                    metadata: mergedFailureMetadata
                })
                .eq('order_number', merchantOrderRef)
                .neq('payment_status', 'paid');

            await finalizePaymentCallbackEvent(eventId, 'processed', body.message || 'Payment failed');

            return NextResponse.json({ success: false, message: 'Payment not successful' });
        }

    } catch (error: any) {
        console.error('[Callback] Critical Error:', error.message);
        return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 });
    }
}

export async function GET(req: Request) {
    return NextResponse.json({ message: 'Moolre callback endpoint ready', timestamp: new Date().toISOString() });
}

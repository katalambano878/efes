import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

function getAccessToken(request: Request): string | null {
    const authHeader = request.headers.get('authorization');
    if (authHeader?.startsWith('Bearer ')) return authHeader.slice(7).trim();
    const cookieHeader = request.headers.get('cookie') || '';
    const match = cookieHeader.match(/\bsb-access-token=([^;]+)/);
    if (match) return decodeURIComponent(match[1].trim());
    const authCookie = cookieHeader
        .split(';')
        .map((c) => c.trim())
        .find((c) => c.startsWith('sb-') && (c.includes('-auth-token') || c.includes('auth')));
    if (!authCookie) return null;
    const value = authCookie.split('=').slice(1).join('=').trim();
    const decoded = decodeURIComponent(value);
    try {
        const parsed = JSON.parse(decoded);
        if (Array.isArray(parsed) && parsed[0]) return parsed[0];
        if (parsed?.access_token) return parsed.access_token;
        if (typeof parsed === 'string') return parsed;
    } catch {
        return decoded;
    }
    return null;
}

async function getStaff(request: Request) {
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return { error: 'Server misconfiguration', status: 503 as const };
    const token = getAccessToken(request);
    if (!token) return { error: 'Not authenticated', status: 401 as const };
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !user) return { error: 'Invalid session', status: 401 as const };
    const { data: profile } = await supabaseAdmin.from('profiles').select('role').eq('id', user.id).single();
    const role = profile?.role != null ? String(profile.role) : '';
    if (role !== 'admin' && role !== 'staff') return { error: 'Forbidden', status: 403 as const };
    return { user };
}

const round2 = (n: number) => Math.max(0, Math.round((Number(n) || 0) * 100) / 100);

/**
 * POST /api/admin/pos/exchange
 * Process an exchange: restock returned items, credit their value toward new items,
 * collect any top-up difference, and issue leftover value as store credit.
 *
 * Body:
 *   returnedItems: [{ product_id, product_name, quantity, unit_price, restock }]
 *   newItems:      [{ product_id, product_name, variant_name, quantity, unit_price, total_price, metadata }]
 *   customer:      { id?, email?, phone?, full_name? }   (optional — needed to bank store credit)
 *   channel:       'pos' | 'website'
 *   original_order_number?: string
 *   payment_method: 'cash' | 'card' | 'momo'
 *   use_store_credit?: boolean    (deferred — apply existing credit toward top-up)
 *   notes?: string
 *   cashier?: string
 */
export async function POST(request: Request) {
    const auth = await getStaff(request);
    if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    try {
        const body = await request.json();
        const {
            returnedItems = [],
            newItems = [],
            customer = null,
            channel = 'pos',
            original_order_number = null,
            payment_method = 'cash',
            use_store_credit = false,
            notes = null,
            cashier = null,
        } = body;

        if (!Array.isArray(returnedItems) || returnedItems.length === 0) {
            return NextResponse.json({ error: 'At least one returned item is required.' }, { status: 400 });
        }

        const returnedValue = round2(returnedItems.reduce(
            (s: number, it: any) => s + (Number(it.unit_price) || 0) * (Number(it.quantity) || 0), 0));
        const newItemsValue = round2(newItems.reduce(
            (s: number, it: any) => s + (Number(it.total_price) != null ? Number(it.total_price) : (Number(it.unit_price) || 0) * (Number(it.quantity) || 0)), 0));

        // ── Resolve / create the customer record (needed to bank store credit) ──
        let customerId: string | null = customer?.id || null;
        let availableCredit = 0;

        if (!customerId && customer && (customer.email || customer.phone)) {
            const lookup = customer.email
                ? supabaseAdmin.from('customers').select('id, store_credit').ilike('email', customer.email).maybeSingle()
                : supabaseAdmin.from('customers').select('id, store_credit').eq('phone', customer.phone).maybeSingle();
            const { data: found } = await lookup;
            if (found) { customerId = found.id; availableCredit = Number(found.store_credit) || 0; }
        } else if (customerId) {
            const { data: c } = await supabaseAdmin.from('customers').select('store_credit').eq('id', customerId).single();
            availableCredit = Number(c?.store_credit) || 0;
        }

        // ── Money math ──────────────────────────────────────────────────────
        // Returned value is credited against the new items first.
        const creditFromReturn = Math.min(returnedValue, newItemsValue);
        let remainingDue = round2(newItemsValue - creditFromReturn); // what the customer still owes (top-up)

        // Deferred: apply existing store credit toward the remaining top-up (not in original scope).
        const existingCreditUsed = 0;
        // if (use_store_credit && availableCredit > 0 && remainingDue > 0) {
        //     existingCreditUsed = Math.min(availableCredit, remainingDue);
        //     remainingDue = round2(remainingDue - existingCreditUsed);
        // }

        const topupAmount = remainingDue; // cash the customer pays
        const creditIssued = round2(returnedValue - newItemsValue); // leftover banked as store credit

        // ── 1. Restock returned items ─────────────────────────────────────────
        const restockResults: any[] = [];
        for (const it of returnedItems) {
            if (it.restock === false || !it.product_id) {
                restockResults.push({ product_id: it.product_id, restocked: false });
                continue;
            }
            const { data: prod } = await supabaseAdmin
                .from('products')
                .select('id, quantity')
                .eq('id', it.product_id)
                .single();
            if (prod) {
                const newQty = (Number(prod.quantity) || 0) + (Number(it.quantity) || 0);
                await supabaseAdmin.from('products').update({ quantity: newQty, updated_at: new Date().toISOString() }).eq('id', it.product_id);
                restockResults.push({ product_id: it.product_id, restocked: true, new_quantity: newQty });
            } else {
                restockResults.push({ product_id: it.product_id, restocked: false });
            }
        }

        // ── 2. Create the new order (if the customer is taking new items) ──────
        let newOrder: any = null;
        if (newItems.length > 0) {
            const orderNumber = `EXC-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
            const isCashOrCard = payment_method === 'cash' || payment_method === 'card';
            const addr = {
                firstName: customer?.full_name?.split(' ')[0] || '',
                lastName: customer?.full_name?.split(' ').slice(1).join(' ') || '',
                email: customer?.email || '', phone: customer?.phone || '', pos_sale: true,
            };

            const { data: order, error: orderErr } = await supabaseAdmin
                .from('orders')
                .insert({
                    order_number: orderNumber,
                    user_id: null,
                    email: customer?.email || null,
                    phone: customer?.phone || null,
                    status: isCashOrCard ? 'processing' : 'pending',
                    payment_status: topupAmount <= 0 ? 'paid' : (isCashOrCard ? 'paid' : 'pending'),
                    currency: 'GHS',
                    subtotal: newItemsValue,
                    tax_total: 0,
                    shipping_total: 0,
                    discount_total: round2(creditFromReturn + existingCreditUsed),
                    total: topupAmount,
                    shipping_method: 'pickup',
                    payment_method: payment_method === 'momo' ? 'moolre' : payment_method,
                    shipping_address: addr,
                    billing_address: addr,
                    metadata: {
                        pos_sale: channel === 'pos',
                        exchange: true,
                        original_order_number,
                        returned_value: returnedValue,
                        credit_from_return: creditFromReturn,
                        store_credit_used: existingCreditUsed,
                        cashier: cashier || undefined,
                    },
                })
                .select()
                .single();

            if (orderErr) return NextResponse.json({ error: orderErr.message }, { status: 500 });
            newOrder = order;

            const orderItems = newItems.map((item: any) => ({
                order_id: order.id,
                product_id: item.product_id,
                product_name: item.product_name,
                variant_name: item.variant_name || null,
                quantity: item.quantity,
                unit_price: Number(item.unit_price) || 0,
                total_price: Number(item.total_price) != null ? Number(item.total_price) : (Number(item.unit_price) || 0) * (Number(item.quantity) || 0),
                metadata: item.metadata || {},
            }));
            await supabaseAdmin.from('order_items').insert(orderItems);

            // Mark paid (this also decrements stock for the new items via the existing RPC)
            if (order.payment_status === 'paid') {
                try {
                    await supabaseAdmin.rpc('mark_order_paid', {
                        order_ref: orderNumber,
                        moolre_ref: `EXC-${(payment_method || 'cash').toUpperCase()}-${Date.now()}`,
                    });
                } catch (e) {
                    console.error('mark_order_paid (exchange) error:', e);
                }
            }
        }

        // ── 3. Adjust store credit (issue leftover / deduct used) ─────────────
        let newBalance = availableCredit;
        if (customerId) {
            const delta = round2(creditIssued) - round2(existingCreditUsed);
            if (delta !== 0) {
                newBalance = round2(availableCredit + delta);
                await supabaseAdmin.from('customers').update({ store_credit: newBalance, updated_at: new Date().toISOString() }).eq('id', customerId);

                if (creditIssued > 0) {
                    await supabaseAdmin.from('store_credit_transactions').insert({
                        customer_id: customerId, order_id: newOrder?.id || null,
                        amount: creditIssued, balance_after: newBalance,
                        type: 'exchange_credit', reason: 'Leftover value from exchange',
                        created_by: auth.user.id,
                    });
                }
                // deferred: deduct applied store credit
                // if (existingCreditUsed > 0) {
                //     await supabaseAdmin.from('store_credit_transactions').insert({ ... });
                // }
            }
        }

        // ── 4. Record the exchange ────────────────────────────────────────────
        const { data: exchange } = await supabaseAdmin
            .from('exchanges')
            .insert({
                original_order_id: null,
                new_order_id: newOrder?.id || null,
                customer_id: customerId,
                returned_items: restockResults.map((r, i) => ({ ...returnedItems[i], restocked: r.restocked })),
                returned_value: returnedValue,
                new_items_value: newItemsValue,
                topup_amount: topupAmount,
                credit_used: existingCreditUsed,
                credit_issued: creditIssued,
                channel,
                status: 'completed',
                notes,
                created_by: auth.user.id,
            })
            .select()
            .single();

        return NextResponse.json({
            success: true,
            exchange,
            order: newOrder,
            summary: {
                returnedValue,
                newItemsValue,
                creditFromReturn,
                storeCreditUsed: existingCreditUsed,
                topupAmount,
                creditIssued,
                newStoreCreditBalance: newBalance,
                restocked: restockResults,
            },
        });
    } catch (e: any) {
        console.error('Exchange API error:', e);
        return NextResponse.json({ error: e?.message || 'Exchange failed' }, { status: 500 });
    }
}

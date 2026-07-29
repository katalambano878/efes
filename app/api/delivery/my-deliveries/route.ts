import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

function getToken(req: NextRequest): string | null {
    const auth = req.headers.get('authorization');
    if (auth?.startsWith('Bearer ')) return auth.slice(7).trim();
    return req.cookies.get('sb-access-token')?.value || null;
}

/**
 * Resolve the rider record for the authenticated user.
 * A rider login is linked via riders.auth_user_id, with a fallback to matching email.
 */
async function getRiderContext(req: NextRequest) {
    const token = getToken(req);
    if (!token) return { error: 'Not authenticated', status: 401 as const };

    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !user) return { error: 'Invalid session', status: 401 as const };

    const { data: profile } = await supabaseAdmin
        .from('profiles')
        .select('role, email, full_name')
        .eq('id', user.id)
        .single();

    const role = profile?.role ? String(profile.role) : '';
    if (!['rider', 'admin', 'staff'].includes(role)) {
        return { error: 'Forbidden', status: 403 as const };
    }

    // Find the linked rider record
    let { data: rider } = await supabaseAdmin
        .from('riders')
        .select('id, full_name, phone, status')
        .eq('auth_user_id', user.id)
        .maybeSingle();

    // Fallback: match by email and self-link
    if (!rider && profile?.email) {
        const { data: byEmail } = await supabaseAdmin
            .from('riders')
            .select('id, full_name, phone, status')
            .ilike('email', profile.email)
            .maybeSingle();
        if (byEmail) {
            rider = byEmail;
            await supabaseAdmin.from('riders').update({ auth_user_id: user.id }).eq('id', byEmail.id);
        }
    }

    return { user, role, rider };
}

// GET — the rider's own assignments
export async function GET(req: NextRequest) {
    const ctx = await getRiderContext(req);
    if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

    if (!ctx.rider) {
        return NextResponse.json({ assignments: [], rider: null, message: 'No rider profile is linked to this account.' });
    }

    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status');

    let query = supabaseAdmin
        .from('delivery_assignments')
        .select(`
            *,
            orders (id, order_number, email, phone, shipping_address, shipping_method, total, status, created_at)
        `)
        .eq('rider_id', ctx.rider.id)
        .order('assigned_at', { ascending: false });

    if (status && status !== 'all') query = query.eq('status', status);

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ assignments: data || [], rider: ctx.rider });
}

// PATCH — update status / delivery fee on the rider's own assignment
export async function PATCH(req: NextRequest) {
    const ctx = await getRiderContext(req);
    if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
    if (!ctx.rider) return NextResponse.json({ error: 'No rider profile linked to this account.' }, { status: 403 });

    const body = await req.json();
    const { id, status, delivery_notes, failure_reason, delivery_fee } = body;
    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

    // Verify ownership
    const { data: current } = await supabaseAdmin
        .from('delivery_assignments')
        .select('id, rider_id, status, order_id')
        .eq('id', id)
        .single();

    if (!current || current.rider_id !== ctx.rider.id) {
        return NextResponse.json({ error: 'This delivery is not assigned to you.' }, { status: 403 });
    }

    const validStatuses = ['assigned', 'picked_up', 'in_transit', 'delivered', 'failed', 'returned'];
    const now = new Date().toISOString();
    const updateData: any = { updated_at: now };

    if (status) {
        if (!validStatuses.includes(status)) return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
        updateData.status = status;
        if (status === 'picked_up') updateData.picked_up_at = now;
        if (status === 'in_transit') updateData.in_transit_at = now;
        if (status === 'delivered') updateData.delivered_at = now;
        if (status === 'failed') {
            updateData.failed_at = now;
            updateData.failure_reason = failure_reason || null;
        }
    }
    if (delivery_notes) updateData.delivery_notes = delivery_notes;
    if (delivery_fee !== undefined && delivery_fee !== null && delivery_fee !== '') {
        const fee = parseFloat(String(delivery_fee));
        if (!isNaN(fee) && fee >= 0) updateData.delivery_fee = fee;
    }

    const { data: updated, error } = await supabaseAdmin
        .from('delivery_assignments')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Sync order status
    if (status) {
        const orderStatusMap: Record<string, string> = { delivered: 'delivered', failed: 'processing' };
        if (orderStatusMap[status]) {
            await supabaseAdmin.from('orders').update({ status: orderStatusMap[status], updated_at: now }).eq('id', current.order_id);
        }
        await supabaseAdmin.from('delivery_status_history').insert({
            assignment_id: id,
            old_status: current.status,
            new_status: status,
            changed_by: ctx.user.id,
            notes: delivery_notes || failure_reason || `Status changed to ${status} by rider`,
        });
    }

    return NextResponse.json({ assignment: updated });
}

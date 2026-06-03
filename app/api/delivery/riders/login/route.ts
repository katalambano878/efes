import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
);

function getToken(req: NextRequest): string | null {
    const auth = req.headers.get('authorization');
    if (auth?.startsWith('Bearer ')) return auth.slice(7).trim();
    return req.cookies.get('sb-access-token')?.value || null;
}

async function requireAdmin(req: NextRequest) {
    const token = getToken(req);
    if (!token) return null;
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !user) return null;
    const { data: profile } = await supabaseAdmin.from('profiles').select('role').eq('id', user.id).single();
    if (!profile || profile.role !== 'admin') return null;
    return user;
}

// POST — create (or link) a login account for a rider, granting the 'rider' role
export async function POST(req: NextRequest) {
    const admin = await requireAdmin(req);
    if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { riderId, email, password } = await req.json();
    if (!riderId || !email || !password) {
        return NextResponse.json({ error: 'riderId, email and password are required.' }, { status: 400 });
    }
    if (password.length < 6) {
        return NextResponse.json({ error: 'Password must be at least 6 characters.' }, { status: 400 });
    }

    const { data: rider } = await supabaseAdmin
        .from('riders')
        .select('id, full_name, phone, auth_user_id')
        .eq('id', riderId)
        .single();
    if (!rider) return NextResponse.json({ error: 'Rider not found.' }, { status: 404 });

    const cleanEmail = email.toLowerCase().trim();

    // If a profile already exists for this email, promote + link it
    const { data: existingProfile } = await supabaseAdmin
        .from('profiles')
        .select('id')
        .eq('email', cleanEmail)
        .maybeSingle();

    let authUserId: string;

    if (existingProfile) {
        authUserId = existingProfile.id;
        await supabaseAdmin.from('profiles').update({
            role: 'rider',
            full_name: rider.full_name,
            phone: rider.phone,
            updated_at: new Date().toISOString(),
        }).eq('id', authUserId);
        // Reset their password so the admin can hand it over
        await supabaseAdmin.auth.admin.updateUserById(authUserId, { password });
    } else {
        const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
            email: cleanEmail,
            password,
            email_confirm: true,
            user_metadata: { full_name: rider.full_name, phone: rider.phone },
        });
        if (createErr || !created?.user) {
            return NextResponse.json({ error: createErr?.message || 'Failed to create login.' }, { status: 500 });
        }
        authUserId = created.user.id;
        await supabaseAdmin.from('profiles').update({
            role: 'rider',
            full_name: rider.full_name,
            phone: rider.phone,
            updated_at: new Date().toISOString(),
        }).eq('id', authUserId);
    }

    // Link the rider record to the auth user, and store the login email
    const { error: linkErr } = await supabaseAdmin
        .from('riders')
        .update({ auth_user_id: authUserId, email: cleanEmail, updated_at: new Date().toISOString() })
        .eq('id', riderId);
    if (linkErr) return NextResponse.json({ error: linkErr.message }, { status: 500 });

    return NextResponse.json({
        success: true,
        message: `Login enabled for ${rider.full_name}. They can sign in at the admin login with ${cleanEmail}.`,
        email: cleanEmail,
    });
}

// DELETE — revoke a rider's login (demote profile, unlink)
export async function DELETE(req: NextRequest) {
    const admin = await requireAdmin(req);
    if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const riderId = searchParams.get('riderId');
    if (!riderId) return NextResponse.json({ error: 'riderId is required.' }, { status: 400 });

    const { data: rider } = await supabaseAdmin.from('riders').select('auth_user_id').eq('id', riderId).single();
    if (rider?.auth_user_id) {
        await supabaseAdmin.from('profiles').update({ role: 'customer', updated_at: new Date().toISOString() }).eq('id', rider.auth_user_id);
    }
    await supabaseAdmin.from('riders').update({ auth_user_id: null, updated_at: new Date().toISOString() }).eq('id', riderId);

    return NextResponse.json({ success: true, message: 'Rider login revoked.' });
}

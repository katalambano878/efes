import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

function getAccessToken(request: Request): string | null {
  const authHeader = request.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) return authHeader.slice(7).trim();

  const cookieHeader = request.headers.get('cookie') || '';
  const match = cookieHeader.match(/\bsb-access-token=([^;]+)/);
  if (match) return decodeURIComponent(match[1].trim());

  // Fallback: Supabase may store as sb-<project>-auth-token (JSON array)
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

/**
 * GET /api/admin/me
 * Returns current admin/staff user and profile using service role (bypasses RLS).
 */
export async function GET(request: Request) {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json(
      { error: 'Server misconfiguration: SUPABASE_SERVICE_ROLE_KEY not set' },
      { status: 503 }
    );
  }

  const token = getAccessToken(request);
  if (!token) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);
  if (userError || !user) {
    return NextResponse.json({ error: 'Invalid or expired session' }, { status: 401 });
  }

  const { data: profile, error: profileError } = await supabaseAdmin
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profileError || !profile) {
    return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
  }

  const role = profile.role != null ? String(profile.role) : '';
  if (role !== 'admin' && role !== 'staff') {
    return NextResponse.json({ error: 'Not admin or staff' }, { status: 403 });
  }

  const { data: roleConfig } = await supabaseAdmin
    .from('roles')
    .select('permissions, enabled')
    .eq('id', role)
    .single();

  if (roleConfig && !roleConfig.enabled) {
    return NextResponse.json({ error: 'Role disabled' }, { status: 403 });
  }

  return NextResponse.json({
    user: { id: user.id, email: user.email },
    profile: { role },
    permissions: roleConfig?.permissions ?? {},
  });
}

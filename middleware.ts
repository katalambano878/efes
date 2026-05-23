import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export async function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl;
    const response = NextResponse.next();

    // ============================================================
    // Security headers for ALL routes
    // ============================================================
    response.headers.set('X-Content-Type-Options', 'nosniff');
    response.headers.set('X-Frame-Options', 'DENY');
    response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');

    // ============================================================
    // Admin route protection
    // ============================================================
    if (pathname.startsWith('/admin')) {
        response.headers.set('X-Robots-Tag', 'noindex, nofollow');
        response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate');

        if (pathname === '/admin/login') {
            return response;
        }

        let token: string | undefined;
        token = request.cookies.get('sb-access-token')?.value;

        if (!token) {
            const projectRef = supabaseUrl?.split('//')[1]?.split('.')[0];
            token = request.cookies.get(`sb-${projectRef}-auth-token`)?.value;
        }

        if (!token) {
            for (const [name, cookie] of request.cookies) {
                if (name.startsWith('sb-') && (name.endsWith('-auth-token') || name.includes('auth'))) {
                    try {
                        const parsed = JSON.parse(cookie.value);
                        if (Array.isArray(parsed) && parsed[0]) {
                            token = parsed[0];
                        } else if (typeof parsed === 'object' && parsed.access_token) {
                            token = parsed.access_token;
                        } else if (typeof parsed === 'string') {
                            token = parsed;
                        }
                    } catch {
                        token = cookie.value;
                    }
                    if (token) break;
                }
            }
        }

        if (!token) {
            const loginUrl = new URL('/admin/login', request.url);
            loginUrl.searchParams.set('redirect', pathname);
            return NextResponse.redirect(loginUrl);
        }

        if (supabaseServiceKey) {
            try {
                const supabase = createClient(supabaseUrl, supabaseServiceKey, {
                    auth: { autoRefreshToken: false, persistSession: false }
                });

                const { data: { user }, error } = await supabase.auth.getUser(token);

                if (error || !user) {
                    const loginUrl = new URL('/admin/login', request.url);
                    loginUrl.searchParams.set('redirect', pathname);
                    loginUrl.searchParams.set('error', 'session_expired');
                    return NextResponse.redirect(loginUrl);
                }

                const { data: profile } = await supabase
                    .from('profiles')
                    .select('role')
                    .eq('id', user.id)
                    .single();

                if (!profile || (profile.role !== 'admin' && profile.role !== 'staff')) {
                    const loginUrl = new URL('/admin/login', request.url);
                    loginUrl.searchParams.set('error', 'unauthorized');
                    return NextResponse.redirect(loginUrl);
                }

                const { data: roleConfig } = await supabase
                    .from('roles')
                    .select('enabled')
                    .eq('id', profile.role)
                    .single();

                if (roleConfig && !roleConfig.enabled) {
                    const loginUrl = new URL('/admin/login', request.url);
                    loginUrl.searchParams.set('error', 'role_disabled');
                    return NextResponse.redirect(loginUrl);
                }

                response.headers.set('x-user-id', user.id);
                response.headers.set('x-user-role', profile.role);

            } catch (err) {
                console.error('[Middleware] Auth check error:', err);
            }
        }
    }

    // ============================================================
    // API route security headers
    // ============================================================
    if (pathname.startsWith('/api/')) {
        response.headers.set('X-Content-Type-Options', 'nosniff');
        response.headers.set('Cache-Control', 'no-store');
    }

    return response;
}

export const config = {
    matcher: [
        '/admin/:path*',
        '/api/:path*',
    ],
};

import { createClient } from '@supabase/supabase-js';

/**
 * Server-side Supabase client with service role key.
 * ONLY use this in API routes and server actions — NEVER in client components.
 * This bypasses RLS, so always verify the caller is authorized first.
 */

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL');
}

if (!supabaseServiceKey) {
    console.error('CRITICAL: Missing SUPABASE_SERVICE_ROLE_KEY — admin operations will fail');
}

export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey || '', {
    auth: {
        autoRefreshToken: false,
        persistSession: false,
    },
});

import { NextResponse } from 'next/server';
import { isPlainPostgres } from '@/lib/db/mode';

/** Allow when plain Postgres is active OR a service-role key is configured. */
export function requireDbBackend(): NextResponse | null {
  if (isPlainPostgres() || process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return null;
  }
  return NextResponse.json({ error: 'Server misconfiguration' }, { status: 503 });
}

export function hasDbBackend(): boolean {
  return isPlainPostgres() || !!process.env.SUPABASE_SERVICE_ROLE_KEY;
}

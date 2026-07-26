import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { isPlainPostgres } from '@/lib/db/mode';
import { compressImageBuffer } from '@/lib/image-compress';

export const runtime = 'nodejs';

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

async function requireAdmin(request: Request): Promise<NextResponse | null> {
  if (!isPlainPostgres() && !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: 'Server misconfiguration' }, { status: 503 });
  }
  const token = getAccessToken(request);
  if (!token) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);
  if (userError || !user) return NextResponse.json({ error: 'Invalid session' }, { status: 401 });
  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();
  const role = profile?.role != null ? String(profile.role) : '';
  if (role !== 'admin' && role !== 'staff') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  return null;
}

function extFromFile(file: File): string {
  const fromName = file.name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1];
  if (fromName) return fromName;
  const fromType = file.type.split('/')[1];
  return fromType || 'jpg';
}

function extForContentType(contentType: string, fallbackExt: string): string {
  const ct = contentType.toLowerCase();
  if (ct.includes('webp')) return 'webp';
  if (ct.includes('png')) return 'png';
  if (ct.includes('jpeg') || ct.includes('jpg')) return 'jpg';
  if (ct.includes('gif')) return 'gif';
  return fallbackExt;
}

/**
 * POST /api/admin/upload
 * Body: multipart/form-data with field "file" (optional "bucket", default "products"; optional "folder").
 * Images are compressed server-side before storage upload.
 * Returns { url: string } public URL. Uses service role so storage RLS is bypassed.
 */
export async function POST(request: Request) {
  const err = await requireAdmin(request);
  if (err) return err;

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const bucket = (formData.get('bucket') as string) || 'products';
    const folderRaw = (formData.get('folder') as string) || '';
    const folder = folderRaw.replace(/^\/+|\/+$/g, '');

    if (!file || !(file instanceof Blob)) {
      return NextResponse.json({ error: 'Missing file' }, { status: 400 });
    }

    const rawExt = extFromFile(file);
    let contentType = file.type || 'application/octet-stream';
    const raw = Buffer.from(await file.arrayBuffer());
    const compressed = await compressImageBuffer(raw, contentType);
    const buffer = Buffer.from(compressed.buffer);
    contentType = compressed.contentType;

    const ext = extForContentType(contentType, rawExt);
    const baseName = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const path = folder ? `${folder}/${baseName}` : baseName;

    const { error } = await supabaseAdmin.storage.from(bucket).upload(path, buffer, {
      cacheControl: '31536000',
      upsert: false,
      contentType,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const { data: { publicUrl } } = supabaseAdmin.storage.from(bucket).getPublicUrl(path);
    return NextResponse.json({ url: publicUrl });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Upload failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

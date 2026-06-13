import sharp from 'sharp';

const MAX_WIDTH = 1600;
const MAX_HEIGHT = 1600;
const WEBP_QUALITY = 82;

export type OptimizedImage = {
  buffer: Buffer;
  contentType: string;
  ext: string;
  optimized: boolean;
};

function extFromName(name: string, fallback: string): string {
  const m = name.toLowerCase().match(/\.([a-z0-9]+)$/);
  return m ? m[1] : fallback;
}

/**
 * Resize and compress admin uploads to WebP for faster storefront loads.
 * Best-effort: if sharp cannot process the file (e.g. HEIC without libheif,
 * or an unexpected runtime error), the original buffer is returned so the
 * upload still succeeds.
 */
export async function optimizeUploadedImage(
  input: Buffer,
  originalName: string,
  originalType: string
): Promise<OptimizedImage> {
  try {
    const meta = await sharp(input, { failOn: 'none' }).metadata();
    if (!meta.width && !meta.height) {
      throw new Error('not a raster image sharp can read');
    }

    const buffer = await sharp(input, { failOn: 'none' })
      .rotate()
      .resize(MAX_WIDTH, MAX_HEIGHT, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: WEBP_QUALITY, effort: 4 })
      .toBuffer();

    return { buffer, contentType: 'image/webp', ext: 'webp', optimized: true };
  } catch {
    // Fallback: upload the original unmodified so the admin is never blocked.
    return {
      buffer: input,
      contentType: originalType || 'application/octet-stream',
      ext: extFromName(originalName, 'jpg'),
      optimized: false,
    };
  }
}

export function isLikelyImageFile(file: File): boolean {
  if (file.type.startsWith('image/')) return true;
  return /\.(jpe?g|png|gif|webp|avif|heic|heif|bmp|tiff?)$/i.test(file.name);
}

export function isHeic(file: File): boolean {
  return /heic|heif/i.test(file.type) || /\.(heic|heif)$/i.test(file.name);
}

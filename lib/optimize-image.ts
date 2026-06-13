import sharp from 'sharp';

const MAX_WIDTH = 1600;
const MAX_HEIGHT = 1600;
const WEBP_QUALITY = 82;

/** Resize and compress admin uploads to WebP for faster storefront loads. */
export async function optimizeUploadedImage(input: Buffer): Promise<{
  buffer: Buffer;
  contentType: string;
  ext: string;
}> {
  const meta = await sharp(input, { failOn: 'none' }).metadata();
  if (!meta.width && !meta.height) {
    throw new Error('File is not a valid image');
  }

  const buffer = await sharp(input, { failOn: 'none' })
    .rotate()
    .resize(MAX_WIDTH, MAX_HEIGHT, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality: WEBP_QUALITY, effort: 4 })
    .toBuffer();

  return { buffer, contentType: 'image/webp', ext: 'webp' };
}

export function isLikelyImageFile(file: File): boolean {
  if (file.type.startsWith('image/')) return true;
  return /\.(jpe?g|png|gif|webp|avif|heic|heif|bmp|tiff?)$/i.test(file.name);
}

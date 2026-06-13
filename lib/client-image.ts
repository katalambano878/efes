const MAX_DIMENSION = 1600;
const QUALITY = 0.82;
const SIZE_THRESHOLD = 300 * 1024; // skip tiny files (< 300KB) that won't benefit

/**
 * Resize + compress an image in the browser before upload.
 * - Converts to WebP at max 1600px (keeps aspect ratio).
 * - Returns the original file untouched if it can't be processed
 *   (e.g. HEIC, SVG, decode failure) or is already small.
 */
export async function compressImageForUpload(file: File): Promise<File> {
  if (typeof window === 'undefined') return file;
  if (!file.type.startsWith('image/')) return file; // HEIC, etc. — leave as-is
  if (file.type === 'image/gif' || file.type === 'image/svg+xml') return file;

  try {
    const bitmap = await loadBitmap(file);
    const { width, height } = bitmap;

    const scale = Math.min(1, MAX_DIMENSION / Math.max(width, height));
    const targetW = Math.max(1, Math.round(width * scale));
    const targetH = Math.max(1, Math.round(height * scale));

    // Nothing to gain: small file and no resize needed.
    if (scale === 1 && file.size < SIZE_THRESHOLD) {
      closeBitmap(bitmap);
      return file;
    }

    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      closeBitmap(bitmap);
      return file;
    }
    ctx.drawImage(bitmap, 0, 0, targetW, targetH);
    closeBitmap(bitmap);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/webp', QUALITY)
    );
    if (!blob || blob.size === 0) return file;

    // If compression somehow made it bigger, keep the original.
    if (blob.size >= file.size && scale === 1) return file;

    const baseName = file.name.replace(/\.[^.]+$/, '') || 'image';
    return new File([blob], `${baseName}.webp`, { type: 'image/webp' });
  } catch {
    return file;
  }
}

async function loadBitmap(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if ('createImageBitmap' in window) {
    try {
      return await createImageBitmap(file);
    } catch {
      /* fall through to <img> */
    }
  }
  return await new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('decode failed'));
    };
    img.src = url;
  });
}

function closeBitmap(bitmap: ImageBitmap | HTMLImageElement) {
  if ('close' in bitmap && typeof bitmap.close === 'function') {
    bitmap.close();
  }
}

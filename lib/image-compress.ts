import sharp from 'sharp';

const MAX_DIMENSION = 2000;
const JPEG_QUALITY = 82;
const WEBP_QUALITY = 78;

/** Detect image format from magic bytes (ignores filename / Content-Type meta). */
export function sniffImageContentType(buf: Buffer): string | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    return 'image/png';
  }
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return 'image/jpeg';
  }
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x38) {
    return 'image/gif';
  }
  if (
    buf[0] === 0x52 &&
    buf[1] === 0x49 &&
    buf[2] === 0x46 &&
    buf[3] === 0x46 &&
    buf[8] === 0x57 &&
    buf[9] === 0x45 &&
    buf[10] === 0x42 &&
    buf[11] === 0x50
  ) {
    return 'image/webp';
  }
  return null;
}

/** Shrink uploads; prefer WebP when it reduces size vs JPEG/PNG/WebP sources. */
export async function compressImageBuffer(
  input: Buffer,
  contentType: string
): Promise<{ buffer: Buffer; contentType: string }> {
  const sniffed = sniffImageContentType(input);
  let ct = (sniffed || contentType || '').toLowerCase();
  if (!ct.startsWith('image/')) {
    return { buffer: input, contentType: contentType || 'application/octet-stream' };
  }
  if (ct.includes('gif') || ct.includes('svg+xml')) {
    return { buffer: input, contentType: ct };
  }

  try {
    let pipeline = sharp(input, { failOn: 'none' }).rotate();
    const meta = await pipeline.metadata();
    if (!meta.width) return { buffer: input, contentType: ct };

    if (
      (meta.width && meta.width > MAX_DIMENSION) ||
      (meta.height && meta.height > MAX_DIMENSION)
    ) {
      pipeline = pipeline.resize(MAX_DIMENSION, MAX_DIMENSION, {
        fit: 'inside',
        withoutEnlargement: true,
      });
    }

    const webpBuffer = await pipeline.clone().webp({ quality: WEBP_QUALITY }).toBuffer();
    if (webpBuffer.length < input.length) {
      return { buffer: webpBuffer, contentType: 'image/webp' };
    }

    if (ct.includes('jpeg') || ct.includes('jpg')) {
      const buffer = await pipeline.jpeg({ quality: JPEG_QUALITY, mozjpeg: true }).toBuffer();
      return buffer.length < input.length
        ? { buffer, contentType: 'image/jpeg' }
        : { buffer: input, contentType: ct };
    }

    if (ct.includes('webp')) {
      const buffer = await pipeline.webp({ quality: WEBP_QUALITY }).toBuffer();
      return buffer.length < input.length
        ? { buffer, contentType: 'image/webp' }
        : { buffer: input, contentType: ct };
    }

    if (ct.includes('png')) {
      const buffer = await pipeline
        .png({ compressionLevel: 9, effort: 7, palette: !meta.hasAlpha })
        .toBuffer();
      return buffer.length < input.length
        ? { buffer, contentType: 'image/png' }
        : { buffer: input, contentType: ct };
    }
  } catch {
    /* keep original */
  }

  return { buffer: input, contentType: ct };
}

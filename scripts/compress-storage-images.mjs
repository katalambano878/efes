#!/usr/bin/env node
/**
 * Recompress on-disk storage images (keeps filenames / DB URLs unchanged).
 *
 * Usage:
 *   STORAGE_ROOT=/path/to/.storage node scripts/compress-storage-images.mjs
 *   node scripts/compress-storage-images.mjs /path/to/.storage
 *
 * Do not run against production without a backup.
 */

import { promises as fs } from 'fs';
import path from 'path';
import sharp from 'sharp';

const MAX_DIMENSION = 1600;
const WEBP_QUALITY = 78;
const MIN_RECOMPRESS_BYTES = 200 * 1024;

const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);

function sniffImageContentType(buf) {
  if (buf.length < 12) return null;
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'image/png';
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x38) return 'image/gif';
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

function contentTypeFromExt(ext) {
  const map = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
  };
  return map[ext.toLowerCase()] || null;
}

function extensionMismatch(filePath, sniffed) {
  if (!sniffed) return false;
  const ext = path.extname(filePath).toLowerCase();
  const expected = contentTypeFromExt(ext);
  return Boolean(expected && expected !== sniffed);
}

async function walkDir(dir, files = []) {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return files;
  }
  for (const ent of entries) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      await walkDir(full, files);
    } else if (ent.isFile() && !ent.name.endsWith('.meta.json')) {
      files.push(full);
    }
  }
  return files;
}

async function recompressFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (!IMAGE_EXT.has(ext)) return { skipped: true };

  const before = await fs.readFile(filePath);
  const sniffed = sniffImageContentType(before);
  if (sniffed === 'image/gif') return { skipped: true };

  const needsWork =
    before.length > MIN_RECOMPRESS_BYTES || extensionMismatch(filePath, sniffed);
  if (!needsWork) return { skipped: true };

  let pipeline = sharp(before, { failOn: 'none' }).rotate();
  const meta = await pipeline.metadata();
  if (!meta.width) return { skipped: true };

  if (
    (meta.width && meta.width > MAX_DIMENSION) ||
    (meta.height && meta.height > MAX_DIMENSION)
  ) {
    pipeline = pipeline.resize(MAX_DIMENSION, MAX_DIMENSION, {
      fit: 'inside',
      withoutEnlargement: true,
    });
  }

  const out = await pipeline.webp({ quality: WEBP_QUALITY }).toBuffer();
  await fs.writeFile(filePath, out);
  const metaPath = filePath + '.meta.json';
  await fs.writeFile(metaPath, JSON.stringify({ contentType: 'image/webp' }));

  return {
    skipped: false,
    before: before.length,
    after: out.length,
    path: filePath,
  };
}

async function main() {
  const rootArg = process.argv[2];
  const storageRoot = path.resolve(
    rootArg || process.env.STORAGE_ROOT || path.join(process.cwd(), '.storage')
  );

  const buckets = ['products'];
  let processed = 0;
  let skipped = 0;
  let saved = 0;

  console.log(`Storage root: ${storageRoot}`);

  for (const bucket of buckets) {
    const bucketDir = path.join(storageRoot, bucket);
    const files = await walkDir(bucketDir);
    for (const file of files) {
      const result = await recompressFile(file);
      if (result.skipped) {
        skipped++;
        continue;
      }
      processed++;
      saved += result.before - result.after;
      console.log(
        `[${bucket}] ${path.relative(storageRoot, result.path)}: ${result.before} → ${result.after} bytes`
      );
    }
  }

  console.log(
    `Done. Recompressed ${processed} file(s), skipped ${skipped}, saved ~${Math.round(saved / 1024)} KB total.`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

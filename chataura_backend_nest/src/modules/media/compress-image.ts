import sharp from 'sharp';

/**
 * Shrinks a still JPEG/PNG/WebP to WebP (max `maxSide` px, quality 80).
 * Returns null when it should be stored as-is: animated image, unreadable file, or no size gain.
 */
export async function toWebp(buf: Buffer, maxSide = 1024): Promise<Buffer | null> {
  try {
    const meta = await sharp(buf).metadata();
    if ((meta.pages ?? 1) > 1) return null;
    const out = await sharp(buf)
      .rotate()
      .resize({ width: maxSide, height: maxSide, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer();
    return out.length < buf.length ? out : null;
  } catch {
    return null;
  }
}

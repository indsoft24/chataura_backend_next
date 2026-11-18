import sharp from 'sharp';
import { toWebp } from './compress-image';

describe('toWebp', () => {
  it('shrinks a big photo to a smaller WebP within the max side', async () => {
    const noise = Buffer.alloc(2000 * 1500 * 3);
    for (let i = 0; i < noise.length; i++) noise[i] = (i * 7919) % 256;
    const jpg = await sharp(noise, { raw: { width: 2000, height: 1500, channels: 3 } }).jpeg({ quality: 95 }).toBuffer();
    const out = await toWebp(jpg);
    expect(out).not.toBeNull();
    const m = await sharp(out!).metadata();
    expect(m.format).toBe('webp');
    expect(Math.max(m.width!, m.height!)).toBeLessThanOrEqual(1024);
    expect(out!.length).toBeLessThan(jpg.length);
  });
  it('returns null for non-image bytes', async () => {
    expect(await toWebp(Buffer.from('not an image'))).toBeNull();
  });
});

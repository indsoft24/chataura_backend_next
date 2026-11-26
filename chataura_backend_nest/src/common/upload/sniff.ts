/** What a file really is, from its first bytes (never from its name or the client's mime type). */
export type SniffKind = 'jpg' | 'png' | 'gif' | 'webp' | 'mp4' | 'mov' | 'm4a' | 'webm' | 'mp3' | 'aac';

export function sniffKind(h: Buffer): SniffKind | null {
  if (h.length < 12) return null;
  if (h[0] === 0xff && h[1] === 0xd8 && h[2] === 0xff) return 'jpg';
  if (h.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (/^GIF8[79]a$/.test(h.subarray(0, 6).toString('latin1'))) return 'gif';
  if (h.subarray(0, 4).toString('latin1') === 'RIFF' && h.subarray(8, 12).toString('latin1') === 'WEBP') return 'webp';
  if (h.subarray(4, 8).toString('latin1') === 'ftyp') {
    const brand = h.subarray(8, 12).toString('latin1');
    return brand === 'qt  ' ? 'mov' : brand === 'M4A ' ? 'm4a' : 'mp4';
  }
  if (h[0] === 0x1a && h[1] === 0x45 && h[2] === 0xdf && h[3] === 0xa3) return 'webm';
  if (h.subarray(0, 3).toString('latin1') === 'ID3') return 'mp3';
  if (h[0] === 0xff && (h[1] & 0xf6) === 0xf0) return 'aac'; // ADTS sync
  if (h[0] === 0xff && (h[1] & 0xe0) === 0xe0) return 'mp3';
  return null;
}

/** Extensions a user may upload, and which real content each one may hold. */
const ALLOWED: Record<string, SniffKind[]> = {
  jpg: ['jpg'], jpeg: ['jpg'], png: ['png'], gif: ['gif'], webp: ['webp'],
  mp4: ['mp4', 'mov'], m4v: ['mp4', 'mov'], mov: ['mov', 'mp4'], webm: ['webm'],
  mp3: ['mp3'], m4a: ['m4a', 'mp4'], aac: ['aac', 'm4a'],
};

export function contentMatchesExt(ext: string, head: Buffer): SniffKind | null {
  const kind = sniffKind(head);
  return kind && ALLOWED[ext.toLowerCase()]?.includes(kind) ? kind : null;
}

export const isImageKind = (k: SniffKind) => k === 'jpg' || k === 'png' || k === 'gif' || k === 'webp';

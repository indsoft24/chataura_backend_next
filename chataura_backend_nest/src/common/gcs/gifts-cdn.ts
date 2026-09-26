/**
 * Gift media CDN base under GCS gifts/v1 (or legacy Nest uploads fallback).
 */
export function resolveGiftsCdnBase(): string {
  const explicit = (process.env.GIFTS_PUBLIC_BASE ?? '').trim().replace(/\/+$/, '');
  if (explicit) return explicit;

  const bucket = (process.env.GCS_BUCKET ?? '').trim();
  if (bucket) {
    return `https://storage.googleapis.com/${bucket}/gifts/v1`;
  }

  const nestBase = (
    process.env.PUBLIC_BASE_URL ||
    process.env.APP_PUBLIC_URL ||
    'https://chataura.in'
  )
    .trim()
    .replace(/\/+$/, '');
  return `${nestBase}/uploads/gifts`;
}

/** CP thumb: gifts/v1/cp/cp_gift_*.png */
export function giftsCdnCpImageUrl(file: string): string {
  const name = file.replace(/^\/+/, '').split('/').pop()!;
  return `${resolveGiftsCdnBase()}/cp/${name}`;
}

/** CP motion: gifts/v1/cp/cp_fx_*.webm (or legacy json under same folder if present) */
export function giftsCdnCpFxUrl(file: string): string {
  const name = file.replace(/^\/+/, '').split('/').pop()!;
  return `${resolveGiftsCdnBase()}/cp/${name}`;
}

/**
 * Extra catalog paths are stored as `gifts/flags/...` under Nest uploads.
 * On GCS CDN base (…/gifts/v1) strip the leading `gifts/` segment.
 */
export function giftsCdnExtraUrl(uploadsRelativePath: string): string {
  let rel = uploadsRelativePath.replace(/^\/+/, '');
  if (rel.startsWith('gifts/')) {
    rel = rel.slice('gifts/'.length);
  }
  return `${resolveGiftsCdnBase()}/${rel}`;
}

export function isGiftsGcsCdn(): boolean {
  const base = resolveGiftsCdnBase();
  return (
    base.includes('storage.googleapis.com') ||
    Boolean((process.env.GIFTS_PUBLIC_BASE ?? '').trim())
  );
}

const LEGACY_HOST = 'chataura.indsoft24.com';
const PUBLIC_HOST = 'chataura.in';

const STATIC_IMAGE_RE = /\.(png|jpe?g|webp|gif)(\?|#|$)/i;
const LOTTIE_RE = /\.json(\?|#|$)/i;

/** Normalize a stored media URL: rewrite dead hosts, reject non-http junk. */
export function sanitizeMediaUrl(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const trimmed = String(raw).trim();
  if (!trimmed) return null;

  // Windows / local paths uploaded by mistake
  if (/^[a-zA-Z]:[\\/]/.test(trimmed) || trimmed.startsWith('file:')) {
    return null;
  }

  let url = trimmed;
  if (url.includes(LEGACY_HOST)) {
    url = url.replaceAll(`https://${LEGACY_HOST}`, `https://${PUBLIC_HOST}`);
    url = url.replaceAll(`http://${LEGACY_HOST}`, `https://${PUBLIC_HOST}`);
  }

  if (!/^https?:\/\//i.test(url)) {
    return null;
  }
  return url;
}

export function isStaticImageUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  try {
    return STATIC_IMAGE_RE.test(new URL(url).pathname);
  } catch {
    return STATIC_IMAGE_RE.test(url);
  }
}

export function isLottieUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  try {
    return LOTTIE_RE.test(new URL(url).pathname);
  } catch {
    return LOTTIE_RE.test(url);
  }
}

export type CatalogMedia = {
  image_url: string | null;
  animation_url: string | null;
};

/**
 * Resolve catalog preview + animation URLs for gifts/stickers.
 * - Prefer a usable HTTP image for image_url
 * - Promote static animation files to image_url when image is missing
 * - Keep Lottie .json (and other non-static anims) only on animation_url
 * - Never copy a PNG into animation_url as a fake animation
 */
export function resolveCatalogMedia(
  imageUrl: string | null | undefined,
  animationUrl: string | null | undefined,
): CatalogMedia {
  const image = sanitizeMediaUrl(imageUrl);
  const animation = sanitizeMediaUrl(animationUrl);

  let resolvedImage = image;
  if (!resolvedImage && animation && isStaticImageUrl(animation)) {
    resolvedImage = animation;
  }

  let resolvedAnimation: string | null = null;
  if (animation) {
    if (isLottieUrl(animation) || !isStaticImageUrl(animation)) {
      resolvedAnimation = animation;
    }
  }

  return {
    image_url: resolvedImage,
    animation_url: resolvedAnimation,
  };
}

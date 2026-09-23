const LEGACY_HOST = 'chataura.indsoft24.com';
const PUBLIC_HOST = 'chataura.in';

const STATIC_IMAGE_RE = /\.(png|jpe?g|svg)(\?|#|$)/i;
const ANIMATED_IMAGE_RE = /\.(gif|webp)(\?|#|$)/i;
const LOTTIE_RE = /\.json(\?|#|$)/i;
const SVGA_RE = /\.svga(\?|#|$)/i;
const VIDEO_RE = /\.(mp4|webm)(\?|#|$)/i;
const GIF_RE = /\.gif(\?|#|$)/i;

export type CatalogMediaType =
  | 'image'
  | 'animated_image'
  | 'svga'
  | 'lottie'
  | 'video';

export type FrameComposite = 'alpha' | 'screen';

export type CatalogMedia = {
  image_url: string | null;
  animation_url: string | null;
  media_type: CatalogMediaType;
  loop: boolean;
};

export type FrameMedia = CatalogMedia & {
  animation_url_lite: string | null;
  preview_url: string | null;
  composite: FrameComposite;
};

/** Normalize a stored media URL: rewrite dead hosts, keep local uploads, reject junk. */
export function sanitizeMediaUrl(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const trimmed = String(raw).trim();
  if (!trimmed) return null;

  if (/^[a-zA-Z]:[\\/]/.test(trimmed) || trimmed.startsWith('file:')) {
    return null;
  }

  if (trimmed.startsWith('/uploads/')) {
    return trimmed;
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

/** Asset key or relative path that is not an HTTP URL (legacy bundled frames). */
export function legacyAssetUrl(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const trimmed = String(raw).trim();
  if (!trimmed) return null;
  if (/^[a-zA-Z]:[\\/]/.test(trimmed) || trimmed.startsWith('file:')) {
    return null;
  }
  return trimmed;
}

export function mediaPathname(url: string): string {
  try {
    if (/^https?:\/\//i.test(url)) return new URL(url).pathname;
  } catch {
    /* relative or malformed */
  }
  return url.split(/[?#]/)[0];
}

export function classifyMediaUrl(
  url: string | null | undefined,
): CatalogMediaType | null {
  if (!url) return null;
  const path = mediaPathname(url);
  if (VIDEO_RE.test(path)) return 'video';
  if (SVGA_RE.test(path)) return 'svga';
  if (LOTTIE_RE.test(path)) return 'lottie';
  if (ANIMATED_IMAGE_RE.test(path)) return 'animated_image';
  if (STATIC_IMAGE_RE.test(path)) return 'image';
  return null;
}

export function isVideoUrl(url: string | null | undefined): boolean {
  return classifyMediaUrl(url) === 'video';
}

export function isStaticImageUrl(url: string | null | undefined): boolean {
  return classifyMediaUrl(url) === 'image';
}

export function isLottieUrl(url: string | null | undefined): boolean {
  return classifyMediaUrl(url) === 'lottie';
}

function isGifUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  return GIF_RE.test(mediaPathname(url));
}

const PLAYABLE = new Set<CatalogMediaType>([
  'animated_image',
  'svga',
  'lottie',
  'video',
]);

/**
 * Resolve catalog preview + animation URLs for gifts, stickers, and frames.
 * - PNG/JPG/SVG are previews only and never become a fake animation
 * - GIF/WebP on the animation field stay playable; GIF-only icons do too
 * - SVGA, Lottie JSON, MP4, and WebM stay on animation_url
 * - A playable file stored only in image_url is promoted to animation_url
 */
export function resolveCatalogMedia(
  imageUrl: string | null | undefined,
  animationUrl: string | null | undefined,
): CatalogMedia {
  const image = sanitizeMediaUrl(imageUrl);
  const animation = sanitizeMediaUrl(animationUrl);
  const imageKind = classifyMediaUrl(image);
  const animKind = classifyMediaUrl(animation);

  let resolvedImage: string | null = null;
  let resolvedAnimation: string | null = null;
  let mediaType: CatalogMediaType = 'image';

  if (image && (imageKind === 'image' || imageKind === 'animated_image')) {
    resolvedImage = image;
  }

  if (animation && animKind && PLAYABLE.has(animKind)) {
    resolvedAnimation = animation;
    mediaType = animKind;
  } else if (animation && animKind === 'image' && !resolvedImage) {
    resolvedImage = animation;
  }

  if (
    !resolvedAnimation &&
    image &&
    imageKind &&
    PLAYABLE.has(imageKind) &&
    imageKind !== 'animated_image'
  ) {
    resolvedAnimation = image;
    mediaType = imageKind;
    resolvedImage = null;
  }

  if (!resolvedAnimation && image && isGifUrl(image)) {
    resolvedAnimation = image;
    resolvedImage = image;
    mediaType = 'animated_image';
  }

  if (
    resolvedAnimation &&
    classifyMediaUrl(resolvedAnimation) === 'animated_image' &&
    !resolvedImage
  ) {
    resolvedImage = resolvedAnimation;
  }

  const loop = resolvedAnimation != null && mediaType !== 'image';
  return {
    image_url: resolvedImage,
    animation_url: resolvedAnimation,
    media_type: loop ? mediaType : 'image',
    loop,
  };
}

export function catalogClientFields(
  imageUrl: string | null | undefined,
  animationUrl: string | null | undefined,
) {
  const media = resolveCatalogMedia(imageUrl, animationUrl);
  return {
    image_url: media.image_url,
    animation_url: media.animation_url,
    media_type: media.media_type,
    loop: media.loop,
  };
}

export function normalizeFrameComposite(
  mode: string | null | undefined,
): FrameComposite {
  return mode === 'screen' ? 'screen' : 'alpha';
}

/**
 * Frame payload. Static images keep animation_url equal to the preview so
 * older clients still render them. A real animation is not copied into the preview.
 */
export function presentFrameMedia(
  imageUrl: string | null | undefined,
  animationUrl: string | null | undefined,
  compositeMode: string | null | undefined,
): FrameMedia {
  const media = resolveCatalogMedia(imageUrl, animationUrl);
  const legacy = legacyAssetUrl(imageUrl);
  const playable = media.loop && media.animation_url != null;
  const poster = media.image_url ?? (playable ? null : legacy);
  const animation = playable ? media.animation_url : (poster ?? legacy);

  return {
    image_url: poster,
    animation_url: animation,
    animation_url_lite: playable ? poster : animation,
    preview_url: poster,
    media_type: playable ? media.media_type : 'image',
    loop: playable,
    composite: normalizeFrameComposite(compositeMode),
  };
}

'use client';

function mediaPath(url: string) {
  try {
    if (/^https?:\/\//i.test(url)) return new URL(url).pathname;
  } catch {
    /* relative */
  }
  return url.split(/[?#]/)[0];
}

export function isLoopingVideo(url: string | null | undefined) {
  if (!url) return false;
  return /\.(mp4|webm)$/i.test(mediaPath(url));
}

export function compositeForAnimation(url: string): 'alpha' | 'screen' {
  return /\.mp4(\?|#|$)/i.test(mediaPath(url)) ? 'screen' : 'alpha';
}

type MediaThumbProps = {
  imageUrl?: string | null;
  animationUrl?: string | null;
  composite?: string | null;
  alt: string;
  fallback: string;
  rounded?: boolean;
};

export default function MediaThumb({
  imageUrl,
  animationUrl,
  composite,
  alt,
  fallback,
  rounded = false,
}: MediaThumbProps) {
  const videoSrc = isLoopingVideo(animationUrl)
    ? animationUrl
    : isLoopingVideo(imageUrl)
      ? imageUrl
      : null;
  const still = imageUrl && !isLoopingVideo(imageUrl) ? imageUrl : null;
  const screen = composite === 'screen';

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: screen ? '#020617' : 'transparent',
        borderRadius: rounded ? '50%' : undefined,
        overflow: 'hidden',
      }}
    >
      {videoSrc ? (
        <video
          src={videoSrc}
          muted
          loop
          autoPlay
          playsInline
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'contain',
            mixBlendMode: screen ? 'screen' : 'normal',
          }}
        />
      ) : still ? (
        <img
          src={still}
          alt={alt}
          style={{ width: '100%', height: '100%', objectFit: 'contain' }}
        />
      ) : (
        <span style={{ fontSize: '2.5rem' }}>{fallback}</span>
      )}
    </div>
  );
}

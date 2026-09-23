import {
  presentFrameMedia,
  resolveCatalogMedia,
  sanitizeMediaUrl,
} from './catalog-media';

describe('resolveCatalogMedia', () => {
  it('keeps an MP4 as a looping video and a separate poster', () => {
    const media = resolveCatalogMedia(
      'https://chataura.in/uploads/poster.png',
      'https://chataura.in/uploads/gift.mp4',
    );
    expect(media).toEqual({
      image_url: 'https://chataura.in/uploads/poster.png',
      animation_url: 'https://chataura.in/uploads/gift.mp4',
      media_type: 'video',
      loop: true,
    });
  });

  it('classifies WebM as video and ignores query strings', () => {
    const media = resolveCatalogMedia(
      null,
      'https://cdn.example.com/frame.webm?token=1',
    );
    expect(media.media_type).toBe('video');
    expect(media.animation_url).toBe(
      'https://cdn.example.com/frame.webm?token=1',
    );
    expect(media.image_url).toBeNull();
    expect(media.loop).toBe(true);
  });

  it('keeps GIF and WebP animations instead of dropping them', () => {
    const gif = resolveCatalogMedia(
      'https://chataura.in/uploads/icon.png',
      'https://chataura.in/uploads/sticker.gif',
    );
    expect(gif.media_type).toBe('animated_image');
    expect(gif.animation_url).toContain('.gif');
    expect(gif.image_url).toContain('.png');
    expect(gif.loop).toBe(true);

    const webp = resolveCatalogMedia(
      null,
      'https://chataura.in/uploads/sticker.webp',
    );
    expect(webp.media_type).toBe('animated_image');
    expect(webp.animation_url).toContain('.webp');
    expect(webp.image_url).toContain('.webp');
  });

  it('plays a GIF that was stored only as the catalog image', () => {
    const media = resolveCatalogMedia(
      'https://media.giphy.com/media/abc/200w.gif',
      null,
    );
    expect(media.media_type).toBe('animated_image');
    expect(media.animation_url).toBe(media.image_url);
    expect(media.loop).toBe(true);
  });

  it('treats PNG as a preview and never as an animation', () => {
    const media = resolveCatalogMedia(
      null,
      'https://chataura.in/uploads/icon.png',
    );
    expect(media).toEqual({
      image_url: 'https://chataura.in/uploads/icon.png',
      animation_url: null,
      media_type: 'image',
      loop: false,
    });
  });

  it('keeps SVGA and Lottie on the animation URL', () => {
    const svga = resolveCatalogMedia(
      'https://chataura.in/uploads/icon.png',
      'https://chataura.in/uploads/gift.svga',
    );
    expect(svga.media_type).toBe('svga');
    expect(svga.animation_url).toContain('.svga');
    expect(svga.image_url).toContain('.png');

    const lottie = resolveCatalogMedia(
      null,
      'https://chataura.in/uploads/gift.json',
    );
    expect(lottie.media_type).toBe('lottie');
    expect(lottie.animation_url).toContain('.json');
    expect(lottie.image_url).toBeNull();
  });

  it('promotes a video that was stored only in image_url', () => {
    const media = resolveCatalogMedia(
      'https://chataura.in/uploads/ring.mp4',
      null,
    );
    expect(media.media_type).toBe('video');
    expect(media.animation_url).toContain('.mp4');
    expect(media.image_url).toBeNull();
    expect(media.loop).toBe(true);
  });

  it('drops Windows paths and file URLs', () => {
    expect(sanitizeMediaUrl('C:\\Users\\a\\gift.png')).toBeNull();
    expect(sanitizeMediaUrl('file:///tmp/gift.mp4')).toBeNull();
    const media = resolveCatalogMedia('C:\\fakepath\\a.png', 'file:///a.mp4');
    expect(media.image_url).toBeNull();
    expect(media.animation_url).toBeNull();
    expect(media.media_type).toBe('image');
    expect(media.loop).toBe(false);
  });

  it('rewrites the legacy host and keeps local upload paths', () => {
    expect(
      sanitizeMediaUrl('http://chataura.indsoft24.com/uploads/a.png'),
    ).toBe('https://chataura.in/uploads/a.png');
    expect(sanitizeMediaUrl('/uploads/frames/ring.mp4')).toBe(
      '/uploads/frames/ring.mp4',
    );
  });
});

describe('presentFrameMedia', () => {
  it('falls back animation_url to the still image for static frames', () => {
    const frame = presentFrameMedia(
      'https://chataura.in/uploads/frame.png',
      null,
      'alpha',
    );
    expect(frame.image_url).toContain('.png');
    expect(frame.animation_url).toBe(frame.image_url);
    expect(frame.preview_url).toBe(frame.image_url);
    expect(frame.media_type).toBe('image');
    expect(frame.composite).toBe('alpha');
    expect(frame.loop).toBe(false);
  });

  it('keeps a bundled asset key when there is no HTTP file', () => {
    const frame = presentFrameMedia('golden_twin_dragons_cutout', null, null);
    expect(frame.image_url).toBe('golden_twin_dragons_cutout');
    expect(frame.animation_url).toBe('golden_twin_dragons_cutout');
    expect(frame.media_type).toBe('image');
  });

  it('exposes a video frame separately from its poster', () => {
    const frame = presentFrameMedia(
      'https://chataura.in/uploads/poster.png',
      'https://chataura.in/uploads/ring.mp4',
      'screen',
    );
    expect(frame.preview_url).toContain('.png');
    expect(frame.animation_url).toContain('.mp4');
    expect(frame.animation_url_lite).toContain('.png');
    expect(frame.media_type).toBe('video');
    expect(frame.composite).toBe('screen');
    expect(frame.loop).toBe(true);
  });
});

import { svipArtOf } from './svip-art';

describe('svipArtOf', () => {
  it('keeps known keys with https URLs only', () => {
    expect(
      svipArtOf({
        medal: 'https://storage.googleapis.com/chataura/svip/v1/svip1_medal.webp',
        frame: 'http://insecure.example/f.webp',
        bubble: 42,
        room_card: 'javascript:alert(1)',
        unknown: 'https://x.example/y.webp',
      }),
    ).toEqual({ medal: 'https://storage.googleapis.com/chataura/svip/v1/svip1_medal.webp' });
  });
  it('null when nothing usable', () => {
    expect(svipArtOf(null)).toBeNull();
    expect(svipArtOf([])).toBeNull();
    expect(svipArtOf('x')).toBeNull();
    expect(svipArtOf({ medal: '' })).toBeNull();
  });
});

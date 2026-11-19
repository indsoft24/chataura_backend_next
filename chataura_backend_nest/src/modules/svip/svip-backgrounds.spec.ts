import { BACKGROUND_URL_RE, MAX_PROFILE_BACKGROUNDS, pickOwnBackgrounds } from './svip-backgrounds';

const mine = ['https://x/u/a.webp', 'https://x/u/b.jpg', 'https://x/u/c.png'];

describe('profile background slider rules', () => {
  it('lets a member reorder and remove their own pictures', () => {
    expect(pickOwnBackgrounds([mine[2], mine[0]], mine)).toEqual({ list: [mine[2], mine[0]] });
    expect(pickOwnBackgrounds([], mine)).toEqual({ list: [] });
  });
  it('drops repeats', () => {
    expect(pickOwnBackgrounds([mine[0], mine[0]], mine)).toEqual({ list: [mine[0]] });
  });
  it('refuses a link that is not in the member\'s own list', () => {
    expect(pickOwnBackgrounds([mine[0], 'https://x/u/someone-else.jpg'], mine)).toEqual({ error: 'INVALID_MEDIA' });
  });
  it('refuses more than the limit and non-link values', () => {
    const six = Array.from({ length: MAX_PROFILE_BACKGROUNDS + 1 }, (_, i) => `https://x/u/${i}.jpg`);
    expect(pickOwnBackgrounds(six, six)).toEqual({ error: 'BAD_REQUEST' });
    expect(pickOwnBackgrounds([1, 2], mine)).toEqual({ error: 'BAD_REQUEST' });
    expect(pickOwnBackgrounds('x', mine)).toEqual({ error: 'BAD_REQUEST' });
  });
  it('accepts only picture files', () => {
    expect(BACKGROUND_URL_RE.test('https://x/uploads/a.webp')).toBe(true);
    expect(BACKGROUND_URL_RE.test('https://x/uploads/a.mp4')).toBe(false);
    expect(BACKGROUND_URL_RE.test('https://x/uploads/a.gif')).toBe(false);
    expect(BACKGROUND_URL_RE.test('https://x/uploads/a.jpg bad')).toBe(false);
  });
});

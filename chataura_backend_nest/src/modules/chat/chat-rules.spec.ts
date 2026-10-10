import {
  canManageGroup,
  canRemoveMember,
  cleanGroupName,
  cleanText,
  detectImage,
  isAllowedMediaUrl,
} from './chat-rules';

describe('chat rules', () => {
  const prefixes = ['https://api.chataura.in/uploads', 'https://storage.googleapis.com/chataura-bkt'];

  it('accepts only media hosted by us', () => {
    expect(isAllowedMediaUrl('https://api.chataura.in/uploads/chat/a.jpg', prefixes)).toBe(true);
    expect(isAllowedMediaUrl('https://storage.googleapis.com/chataura-bkt/x/y.png', prefixes)).toBe(true);
    expect(isAllowedMediaUrl('https://evil.example/uploads/chat/a.jpg', prefixes)).toBe(false);
    expect(isAllowedMediaUrl('https://api.chataura.in.evil.example/uploads/a.jpg', prefixes)).toBe(false);
    expect(isAllowedMediaUrl('https://storage.googleapis.com/other-bucket/a.png', prefixes)).toBe(false);
    expect(isAllowedMediaUrl('javascript:alert(1)', prefixes)).toBe(false);
    expect(isAllowedMediaUrl('not a url', prefixes)).toBe(false);
  });

  it('detects real images from bytes and rejects SVG / HTML', () => {
    expect(detectImage(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))?.ext).toBe('jpg');
    expect(detectImage(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))?.ext).toBe('png');
    expect(detectImage(Buffer.from('GIF89a......'))?.ext).toBe('gif');
    expect(detectImage(Buffer.from('RIFF\0\0\0\0WEBPVP8 '))?.ext).toBe('webp');
    expect(detectImage(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg">'))).toBeNull();
    expect(detectImage(Buffer.from('<html><script>'))).toBeNull();
  });

  it('group roles: who manages and who can be removed', () => {
    expect(canManageGroup('owner')).toBe(true);
    expect(canManageGroup('admin')).toBe(true);
    expect(canManageGroup('member')).toBe(false);
    expect(canManageGroup('bogus')).toBe(false);
    expect(canRemoveMember('owner', 'admin')).toBe(true);
    expect(canRemoveMember('admin', 'member')).toBe(true);
    expect(canRemoveMember('admin', 'admin')).toBe(false);
    expect(canRemoveMember('member', 'member')).toBe(false);
    expect(canRemoveMember('owner', 'owner')).toBe(false);
  });

  it('cleans text and names', () => {
    expect(cleanText('  hi \u0000 ')).toBe('hi');
    expect(cleanText('   ')).toBeNull();
    expect(cleanText(42)).toBeNull();
    expect(cleanGroupName('x'.repeat(80))?.length).toBe(50);
  });
});

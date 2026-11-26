import { contentMatchesExt, sniffKind } from './sniff';

const pad = (b: Buffer) => Buffer.concat([b, Buffer.alloc(16)]);
const mp4 = pad(Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from('ftypisom')]));
const jpg = pad(Buffer.from([0xff, 0xd8, 0xff, 0xe0]));

describe('upload sniffing', () => {
  it('knows real files', () => {
    expect(sniffKind(mp4)).toBe('mp4');
    expect(sniffKind(jpg)).toBe('jpg');
    expect(sniffKind(pad(Buffer.from([0x1a, 0x45, 0xdf, 0xa3])))).toBe('webm');
  });
  it('rejects scripts and html pretending to be media', () => {
    expect(sniffKind(pad(Buffer.from('<html><script>alert(1)</script>')))).toBeNull();
    expect(sniffKind(pad(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"')))).toBeNull();
    expect(sniffKind(pad(Buffer.from('#EXTM3U\nfile:///etc/passwd')))).toBeNull();
    expect(sniffKind(Buffer.from('short'))).toBeNull();
  });
  it('extension must agree with the content', () => {
    expect(contentMatchesExt('mp4', mp4)).toBe('mp4');
    expect(contentMatchesExt('jpg', jpg)).toBe('jpg');
    expect(contentMatchesExt('mp4', jpg)).toBeNull();
    expect(contentMatchesExt('jpg', mp4)).toBeNull();
    expect(contentMatchesExt('svg', jpg)).toBeNull();
    expect(contentMatchesExt('html', mp4)).toBeNull();
  });
});

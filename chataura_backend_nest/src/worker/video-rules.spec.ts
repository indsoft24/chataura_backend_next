import { isMp4Magic, SAFE_INPUT, isCompressible, needsCompress, scaleFilter, worthKeeping } from './video-rules';

describe('video rules', () => {
  it('only plain mp4/mov/m4v names are queued', () => {
    expect(isCompressible('1794_reel_video.mp4')).toBe(true);
    expect(isCompressible('a.MOV')).toBe(true);
    expect(isCompressible('../etc/passwd.mp4')).toBe(false);
    expect(isCompressible('.hidden.mp4')).toBe(false);
    expect(isCompressible('clip.webm')).toBe(false);
    expect(isCompressible('a b.mp4')).toBe(false);
  });
  it('skips small low-bitrate clips, compresses big or heavy ones', () => {
    expect(needsCompress({ width: 368, height: 640, bitRate: 900_000 })).toBe(false);
    expect(needsCompress({ width: 368, height: 640, bitRate: 5_900_000 })).toBe(true);
    expect(needsCompress({ width: 1080, height: 1920, bitRate: 800_000 })).toBe(true);
    expect(needsCompress({ width: 640, height: 480, bitRate: 0 })).toBe(true);
  });
  it('keeps the result only if at least 20% smaller', () => {
    expect(worthKeeping(100, 79)).toBe(true);
    expect(worthKeeping(100, 80)).toBe(false);
    expect(worthKeeping(100, 0)).toBe(false);
  });
  it('scale filter caps the short side at 480', () => {
    expect(scaleFilter()).toContain('480');
  });

  it('only a real mp4 header passes; an HLS playlist renamed .mp4 does not', () => {
    const mp4 = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from('ftypisom'), Buffer.alloc(16)]);
    expect(isMp4Magic(mp4)).toBe(true);
    expect(isMp4Magic(Buffer.from('#EXTM3U\n#EXT-X-VERSION:3\nfile:///etc/passwd'))).toBe(false);
    expect(isMp4Magic(Buffer.alloc(4))).toBe(false);
  });
  it('input is locked to local files', () => {
    expect(SAFE_INPUT).toEqual(['-protocol_whitelist', 'file', '-f', 'mov']);
  });
});

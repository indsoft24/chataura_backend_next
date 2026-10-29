import { giftQuantity } from '../room/gift-quantity';
import { imageKind } from './image-kind';

describe('imageKind', () => {
  it('detects real images by signature', () => {
    expect(imageKind(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBe('jpg');
    expect(
      imageKind(
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]),
      ),
    ).toBe('png');
    expect(imageKind(Buffer.from('GIF89a....'))).toBe('gif');
    expect(imageKind(Buffer.from('RIFF\0\0\0\0WEBPVP8 '))).toBe('webp');
  });

  it('rejects anything else, whatever its name or type', () => {
    expect(imageKind(Buffer.from('<?php system($_GET[1]); ?>'))).toBeNull();
    expect(imageKind(Buffer.from('<svg onload=alert(1)></svg>'))).toBeNull();
    expect(imageKind(Buffer.from('<html><script>'))).toBeNull();
    expect(imageKind(Buffer.alloc(0))).toBeNull();
  });
});

describe('giftQuantity', () => {
  it('keeps 1–100 whole gifts and never returns NaN', () => {
    expect(giftQuantity(undefined)).toBe(1);
    expect(giftQuantity(5)).toBe(5);
    expect(giftQuantity('7')).toBe(7);
    expect(giftQuantity(1.9)).toBe(1);
    expect(giftQuantity(0)).toBe(1);
    expect(giftQuantity(-5)).toBe(1);
    expect(giftQuantity(1e12)).toBe(100);
    expect(giftQuantity('x')).toBe(1);
    expect(giftQuantity({})).toBe(1);
  });
});

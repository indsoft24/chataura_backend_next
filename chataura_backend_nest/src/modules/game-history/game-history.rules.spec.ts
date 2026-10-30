import { parseCursor, parseGame, parseLimit, parseResult, resultOf } from './game-history.rules';

describe('game history rules', () => {
  it('results by net money', () => {
    expect(resultOf(100n, 200n)).toBe('win');
    expect(resultOf(100n, 0n)).toBe('loss');
    expect(resultOf(100n, 50n)).toBe('loss');
    expect(resultOf(100n, 100n)).toBe('even');
  });
  it('only known games / results pass', () => {
    expect(parseGame('slot')).toBe('slot');
    expect(parseGame('dice')).toBeUndefined();
    expect(parseGame(['slot'])).toBeUndefined();
    expect(parseResult('win')).toBe('win');
    expect(parseResult("win' OR 1=1")).toBeUndefined();
  });
  it('limit is clamped, bad values fall back', () => {
    expect(parseLimit('5')).toBe(5);
    expect(parseLimit('9999')).toBe(50);
    expect(parseLimit('-3')).toBe(20);
    expect(parseLimit('abc')).toBe(20);
    expect(parseLimit('1.5')).toBe(20);
  });
  it('cursor must be plain digits', () => {
    expect(parseCursor('123')).toBe(123n);
    expect(parseCursor('0x10')).toBeUndefined();
    expect(parseCursor('-1')).toBeUndefined();
    expect(parseCursor('1'.repeat(40))).toBeUndefined();
    expect(parseCursor(undefined)).toBeUndefined();
  });
});

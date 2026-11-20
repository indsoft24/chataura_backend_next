import { TtlMemo } from './ttl-memo';

describe('TtlMemo', () => {
  it('loads once per ttl, shares in-flight, and drops failures', async () => {
    const memo = new TtlMemo();
    let n = 0;
    const load = async () => ++n;
    expect(await Promise.all([memo.get('a', 1000, load), memo.get('a', 1000, load)])).toEqual([1, 1]);
    expect(await memo.get('a', 0, load)).toBe(2);
    await expect(memo.get('b', 1000, () => Promise.reject(new Error('x')))).rejects.toThrow('x');
    expect(await memo.get('b', 1000, load)).toBe(3);
  });
});

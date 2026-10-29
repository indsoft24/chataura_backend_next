import {
  LEDGER_REWARD_TYPES,
  decodeCursor,
  encodeCursor,
  includesRocket,
  ledgerSubtitle,
  ledgerTypesFor,
  parseTzOffset,
  periodStarts,
  rocketSubtitle,
  sameTimeRule,
} from './reward-history.rules';

describe('reward history rules', () => {
  it('never reads spending, purchases, gifts or the rocket ledger rows', () => {
    const all = ledgerTypesFor(null);
    for (const t of [
      'RECHARGE',
      'GIFT_SENT',
      'GIFT_RECEIVED',
      'ADMIN_CREDIT',
      'AGENCY_WEEKLY_PAYOUT',
      'STAR_CHAT_EARNED',
      'XP',
      'SPIN',
      'ROCKET_REWARD',
    ]) {
      expect(all).not.toContain(t);
    }
    expect(all).toContain('PARTY_GEMS');
    expect(all).toContain('GAME_LUCKY77_WIN');
  });

  it('category filters pick only that category; rocket reads no ledger types', () => {
    expect(ledgerTypesFor('games').sort()).toEqual([
      'GAME_GREEDY_WIN',
      'GAME_LUCKY77_WIN',
      'GAME_SLOT_WIN',
    ]);
    expect(ledgerTypesFor('rocket')).toEqual([]);
    expect(includesRocket('rocket')).toBe(true);
    expect(includesRocket(null)).toBe(true);
    expect(includesRocket('rooms')).toBe(false);
    for (const t of ledgerTypesFor('rooms')) {
      expect(LEDGER_REWARD_TYPES[t].category).toBe('rooms');
    }
  });

  it('cursor round-trips, keeps microseconds, and rejects tampering', () => {
    const c = {
      at: '2026-10-11 22:25:34.301123+00',
      src: 1,
      id: '9007199254740993',
    };
    expect(decodeCursor(encodeCursor(c))).toEqual(c);
    expect(decodeCursor(undefined)).toBeNull();
    expect(decodeCursor('not-base64-json')).toBeNull();
    const bad = (v: unknown) =>
      Buffer.from(JSON.stringify(v)).toString('base64url');
    expect(decodeCursor(bad(['x', 0, '1']))).toBeNull();
    expect(decodeCursor(bad([c.at, 2, '1']))).toBeNull();
    expect(decodeCursor(bad([c.at, 0, "1'; DROP TABLE users"]))).toBeNull();
  });

  it('same-timestamp ordering: rocket rows come before ledger rows, then by id', () => {
    const at = '2026-10-11 10:00:00+00';
    expect(sameTimeRule(0, { at, src: 1, id: '5' })).toBe('all');
    expect(sameTimeRule(1, { at, src: 0, id: '5' })).toBe('none');
    expect(sameTimeRule(0, { at, src: 0, id: '5' })).toBe('lower_id');
  });

  it('subtitles come only from what the record holds', () => {
    expect(
      ledgerSubtitle(
        'ROOM_REWARD',
        null,
        { level: 3, role: 'partner', rank: 2 },
        { roomName: 'CS' },
      ),
    ).toBe('CS · Level 3 · Top supporter #2');
    expect(
      ledgerSubtitle('ROOM_REWARD', null, { level: 1, role: 'owner' }, {}),
    ).toBe('Level 1 · Room owner');
    expect(
      ledgerSubtitle('PARTY_TIER', null, { room_id: 'x' }, { minutes: 30 }),
    ).toBe('Stayed 30 min');
    expect(ledgerSubtitle('BONUS_STREAK', 'Streak day 4', null, {})).toBe(
      'Streak day 4',
    );
    expect(ledgerSubtitle('LUCKY_GIFT_REBATE', null, { pct: 12 }, {})).toBe(
      '12% back',
    );
    expect(ledgerSubtitle('GAME_GREEDY_WIN', 'Greedy win 🍎', null, {})).toBe(
      'Winner: 🍎',
    );
    expect(
      ledgerSubtitle('REFERRAL_REFEREE', 'Referral join bonus', null, {}),
    ).toBeNull();
    expect(ledgerSubtitle('PARTY_TIER', null, null, {})).toBeNull();
    expect(rocketSubtitle('CS', 1)).toBe('CS · Rank #1');
    expect(rocketSubtitle(null, null)).toBeNull();
  });

  it('today and month start at local midnight for the client time zone', () => {
    // 2026-10-01 02:00 IST = 2026-09-30 20:30 UTC.
    const now = new Date('2026-09-30T20:30:00Z');
    const ist = periodStarts(now, 330);
    expect(ist.today.toISOString()).toBe('2026-09-30T18:30:00.000Z');
    expect(ist.month.toISOString()).toBe('2026-09-30T18:30:00.000Z');
    const utc = periodStarts(now, 0);
    expect(utc.today.toISOString()).toBe('2026-09-30T00:00:00.000Z');
    expect(utc.month.toISOString()).toBe('2026-09-01T00:00:00.000Z');
  });

  it('time zone offset is clamped and defaults to IST', () => {
    expect(parseTzOffset(undefined)).toBe(330);
    expect(parseTzOffset('abc')).toBe(330);
    expect(parseTzOffset('-300')).toBe(-300);
    expect(parseTzOffset('99999')).toBe(840);
  });
});

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { readRoomRewardSettings } from './room-reward.config';
import {
  DEFAULT_ROOM_REWARD_LEVELS,
  RewardLevel,
  dueLevels,
  levelTotal,
  nextLevel,
  validateLevelTable,
} from './room-reward.levels';

/** "Total Coins" column of the published Room Reward Policy (millions). */
const PUBLISHED_TOTALS_M = [
  1.3, 2.8, 6.0, 9.0, 13.2, 17.2, 21.0, 27.4, 52.0, 102.4, 148.0, 192.0, 238.0, 295.0, 353.0,
  690.0, 1020.0, 1350.0, 1650.0,
];

const lv = (level: number, coins: number, active = true): RewardLevel => ({
  level,
  minVisitors: 5,
  minRoomCoins: BigInt(coins),
  ownerReward: 10n,
  partnerReward: 2n,
  partnerCount: 1,
  isActive: active,
});

describe('room reward levels', () => {
  it('default table matches the published totals (owner + partner × partners)', () => {
    expect(DEFAULT_ROOM_REWARD_LEVELS).toHaveLength(19);
    DEFAULT_ROOM_REWARD_LEVELS.forEach((l, i) => {
      expect(levelTotal(l)).toBe(BigInt(Math.round(PUBLISHED_TOTALS_M[i] * 1_000_000)));
    });
    expect(validateLevelTable(DEFAULT_ROOM_REWARD_LEVELS)).toEqual([]);
  });

  it('migration seed rows are exactly the default table', () => {
    const sql = readFileSync(
      resolve(__dirname, '../../../../prisma/migrations/20261011120000_room_reward_levels/migration.sql'),
      'utf8',
    );
    const rows = [...sql.matchAll(/\(\s*(\d+),\s*(\d+),\s*(\d+),\s*(\d+),\s*(\d+),\s*(\d+),\s*true,\s*NOW\(\)\)/g)];
    expect(rows).toHaveLength(19);
    rows.forEach((m, i) => {
      const d = DEFAULT_ROOM_REWARD_LEVELS[i];
      expect([Number(m[1]), Number(m[2])]).toEqual([d.level, d.minVisitors]);
      expect([BigInt(m[3]), BigInt(m[4]), BigInt(m[5])]).toEqual([d.minRoomCoins, d.ownerReward, d.partnerReward]);
      expect(Number(m[6])).toBe(d.partnerCount);
    });
  });

  it('rejects tables an admin must not save', () => {
    const issues = validateLevelTable([lv(1, 100), lv(2, 100), lv(2, 300), { ...lv(4, 0), partnerCount: -1 }]);
    const fields = issues.map((i) => `${i.level}:${i.field}`);
    expect(fields).toEqual(
      expect.arrayContaining(['2:min_room_coins', '2:level', '4:min_room_coins', '4:partner_count']),
    );
  });

  it('ignores disabled levels when checking ascending targets', () => {
    expect(validateLevelTable([lv(1, 100), lv(2, 50, false), lv(3, 200)])).toEqual([]);
  });

  it('due levels: in order, unpaid, active, coin target reached', () => {
    const table = [lv(1, 100), lv(2, 200), lv(3, 300, false), lv(4, 400), lv(5, 500)];
    expect(dueLevels(table, new Set(), 450n).map((l) => l.level)).toEqual([1, 2, 4]);
    expect(dueLevels(table, new Set([1]), 450n).map((l) => l.level)).toEqual([2, 4]);
    expect(dueLevels(table, new Set([1, 2, 4]), 450n)).toEqual([]);
  });

  it('a level added later is due immediately for rooms already past it', () => {
    const table = [lv(1, 100), lv(2, 200)];
    const paid = new Set([1, 2]);
    expect(dueLevels(table, paid, 900n)).toEqual([]);
    table.push(lv(3, 800));
    expect(dueLevels(table, paid, 900n).map((l) => l.level)).toEqual([3]);
  });

  it('next level for the meter, null when everything is paid', () => {
    const table = [lv(1, 100), lv(2, 200)];
    expect(nextLevel(table, new Set([1]))?.level).toBe(2);
    expect(nextLevel(table, new Set([1, 2]))).toBeNull();
  });
});

describe('room reward settings', () => {
  it('ships off with sane defaults and clamps bad admin input', () => {
    expect(readRoomRewardSettings({})).toEqual({ enabled: false, presenceMinutes: 10, presenceGapMinutes: 2 });
    expect(
      readRoomRewardSettings({
        room_reward_enabled: 'true',
        room_reward_presence_minutes: '-5',
        room_reward_presence_gap_minutes: 999,
      }),
    ).toEqual({ enabled: true, presenceMinutes: 0, presenceGapMinutes: 30 });
    expect(readRoomRewardSettings({ room_reward_presence_minutes: 'abc' }).presenceMinutes).toBe(10);
  });
});

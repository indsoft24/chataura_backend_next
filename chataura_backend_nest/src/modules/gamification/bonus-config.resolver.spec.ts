import {
  resolveAdmob,
  resolveGameEnabled,
  resolveReferralMilestone,
  resolveReferralRewards,
  resolveStreak,
} from './bonus-config.resolver';

describe('bonus-config.resolver', () => {
  const baseStreak = { enabled: true, rewards: [5, 10, 15, 20, 25, 30, 50] };

  it('admin streak day coins override legacy rewards', () => {
    const r = resolveStreak(baseStreak, {
      streak_enabled: true,
      streak_day_1_coins: 20000,
      streak_day_2_coins: 20000,
      streak_day_3_coins: 30000,
      streak_day_4_coins: 40000,
      streak_day_5_coins: 50000,
      streak_day_6_coins: 60000,
      streak_day_7_coins: 100000,
    });
    expect(r.rewards).toEqual([20000, 20000, 30000, 40000, 50000, 60000, 100000]);
    expect(r.enabled).toBe(true);
  });

  it('falls back per day and honours streak_enabled=false', () => {
    const r = resolveStreak(baseStreak, {
      streak_enabled: false,
      streak_day_7_coins: '777',
    });
    expect(r.rewards).toEqual([5, 10, 15, 20, 25, 30, 777]);
    expect(r.enabled).toBe(false);
  });

  it('ignores invalid admin numbers', () => {
    const r = resolveStreak(baseStreak, { streak_day_1_coins: 'abc', streak_day_2_coins: -5 });
    expect(r.rewards[0]).toBe(5);
    expect(r.rewards[1]).toBe(10);
  });

  it('referral milestone and per-invite rewards come from admin settings', () => {
    const m = resolveReferralMilestone(
      { enabled: true, required_count: 5, coins: 100 },
      { referral_milestone_required_count: 3, referral_milestone_coins: 5000 },
    );
    expect(m).toEqual({ enabled: true, required_count: 3, coins: 5000 });
    expect(
      resolveReferralRewards({ referral_reward_referrer: 100000, referral_reward_referee: 300000 }),
    ).toEqual({ referrer_coins: 100000, referee_coins: 300000 });
  });

  it('admob and game toggles come from admin settings', () => {
    const a = resolveAdmob(
      { enabled: true, coins: 20, daily_limit: 5, cooldown_seconds: 60 },
      { admob_enabled: false, admob_ad_coins: 99, admob_daily_ad_limit: 2 },
    );
    expect(a).toEqual({ enabled: false, coins: 99, daily_limit: 2, cooldown_seconds: 60 });
    expect(resolveGameEnabled({ enabled: true, coins: 5 }, { game_2_enabled: false }, 'game_2').enabled).toBe(false);
  });
});

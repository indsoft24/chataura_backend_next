import {
  canWearEntryBar,
  wornEntryBarFields,
  entryBarOffer,
  entryBarSettings,
  ENTRY_BAR_DEFAULTS,
  EntryBarRow,
} from './entry-bar.rules';

const bar = (p: Partial<EntryBarRow> = {}): EntryBarRow => ({
  id: 5n,
  name: 'Winged Wolf',
  levelRequired: 1,
  svipLevel: 1,
  imageUrl: 'https://chataura.in/svip/svip1_entrance.png',
  animationUrl: 'https://storage.googleapis.com/chataura/fx/wolf.mp4',
  compositeMode: 'screen',
  isActive: true,
  ...p,
});

describe('entry bar rules', () => {
  it('SVIP bars need SVIP N or higher; level is ignored', () => {
    expect(canWearEntryBar(bar(), { level: 99, svipLevel: 0 })).toBe(false);
    expect(canWearEntryBar(bar(), { level: 1, svipLevel: 1 })).toBe(true);
    expect(canWearEntryBar(bar(), { level: 1, svipLevel: 3 })).toBe(true);
    expect(canWearEntryBar(bar({ svipLevel: 2 }), { level: 1, svipLevel: 1 })).toBe(false);
  });

  it('other bars need the user level; disabled bars nobody', () => {
    const lv = bar({ svipLevel: 0, levelRequired: 20 });
    expect(canWearEntryBar(lv, { level: 19, svipLevel: 9 })).toBe(false);
    expect(canWearEntryBar(lv, { level: 20, svipLevel: 0 })).toBe(true);
    expect(canWearEntryBar(bar({ isActive: false }), { level: 1, svipLevel: 1 })).toBe(false);
  });

  it('room payload: the worn video bar, or id 0 once SVIP ended', () => {
    const worn = wornEntryBarFields({ level: 1, selectedEntryBar: bar() }, 1);
    expect(worn).toEqual({
      entry_bar_id: 5,
      entry_bar: {
        id: 5,
        name: 'Winged Wolf',
        image_url: 'https://chataura.in/svip/svip1_entrance.png',
        animation_url: 'https://storage.googleapis.com/chataura/fx/wolf.mp4',
        media_type: 'video',
        loop: true,
        composite: 'screen',
        overlay: true,
      },
    });
    expect(wornEntryBarFields({ level: 1, selectedEntryBar: bar() }, 0)).toEqual({
      entry_bar_id: 0,
      entry_bar: null,
    });
    expect(wornEntryBarFields({ level: 1, selectedEntryBar: null }, 1)).toEqual({
      entry_bar_id: 0,
      entry_bar: null,
    });
  });

  it('full screen only when the video can be see-through', () => {
    const media = (p: Partial<EntryBarRow>) =>
      (wornEntryBarFields({ level: 1, selectedEntryBar: bar({ svipLevel: 0, ...p }) }, 0) as any)
        .entry_bar;
    // A plain phone video (MP4, no blend) would cover the room: pill only, as before.
    expect(media({ compositeMode: 'alpha' }).overlay).toBe(false);
    expect(media({ animationUrl: 'https://x/a.webm', compositeMode: 'alpha' }).overlay).toBe(true);
    expect(media({ animationUrl: 'https://x/a.json' }).overlay).toBe(false);
  });

  it('says nothing when the bar was not loaded', () => {
    expect(wornEntryBarFields({ level: 1 }, 1)).toEqual({});
  });
});

describe('bought level entry bars', () => {
  const day = 86_400_000;
  const now = new Date('2026-11-01T00:00:00Z');
  const lvBar = bar({ svipLevel: 0, levelRequired: 30, coinCost: 30_000_000n });
  const s = ENTRY_BAR_DEFAULTS;

  it('wearable while the purchase has not ended, even below the level', () => {
    const live = new Date(now.getTime() + day);
    const dead = new Date(now.getTime() - 1);
    expect(canWearEntryBar(lvBar, { level: 5, svipLevel: 0, paidUntil: live }, now)).toBe(true);
    expect(canWearEntryBar(lvBar, { level: 5, svipLevel: 0, paidUntil: dead }, now)).toBe(false);
    expect(canWearEntryBar(lvBar, { level: 5, svipLevel: 0 }, now)).toBe(false);
  });

  it('a bought SVIP bar does not exist: SVIP bars ignore purchases', () => {
    const svip = bar({ svipLevel: 2, coinCost: 5n });
    const live = new Date(now.getTime() + day);
    expect(canWearEntryBar(svip, { level: 99, svipLevel: 1, paidUntil: live }, now)).toBe(false);
    expect(entryBarOffer(svip, 1, null, s, now)).toEqual({ action: null });
  });

  it('no offer when the level already unlocks it, it is free, or it is off', () => {
    expect(entryBarOffer(lvBar, 30, null, s, now)).toEqual({ action: null });
    expect(entryBarOffer({ ...lvBar, coinCost: 0n }, 1, null, s, now)).toEqual({ action: null });
    expect(entryBarOffer({ ...lvBar, isActive: false }, 1, null, s, now)).toEqual({ action: null });
  });

  it('buy = full price for a fresh 30 days', () => {
    expect(entryBarOffer(lvBar, 1, null, s, now)).toEqual({
      action: 'buy',
      price: 30_000_000n,
      newExpiry: new Date(now.getTime() + 30 * day),
    });
  });

  it('renew = 20 % and adds 30 days to the current end, also 3 days after it ended', () => {
    const active = new Date(now.getTime() + 2 * day);
    expect(entryBarOffer(lvBar, 1, active, s, now)).toEqual({
      action: 'renew',
      price: 6_000_000n,
      newExpiry: new Date(active.getTime() + 30 * day),
    });
    const justEnded = new Date(now.getTime() - 3 * day);
    expect(entryBarOffer(lvBar, 1, justEnded, s, now).action).toBe('renew');
  });

  it('past the grace the user buys again at the full price', () => {
    const longAgo = new Date(now.getTime() - 3 * day - 1);
    expect(entryBarOffer(lvBar, 1, longAgo, s, now)).toEqual({
      action: 'buy',
      price: 30_000_000n,
      newExpiry: new Date(now.getTime() + 30 * day),
    });
  });

  it('settings: defaults, admin values, nonsense falls back', () => {
    expect(entryBarSettings(null)).toEqual(ENTRY_BAR_DEFAULTS);
    expect(entryBarSettings({ entry_bar_period_days: 7, entry_bar_renew_pct: 50 })).toEqual({
      periodDays: 7,
      renewPct: 50,
      graceDays: 3,
    });
    expect(entryBarSettings({ entry_bar_period_days: -1, entry_bar_renew_pct: 'x' })).toEqual(ENTRY_BAR_DEFAULTS);
  });

  it('room payload hides an expired bought bar', () => {
    const lv = { level: 5, selectedEntryBar: lvBar };
    expect(wornEntryBarFields({ ...lv, selectedEntryBarPaidUntil: new Date(Date.now() + day) }, 0)).toMatchObject({ entry_bar_id: 5 });
    expect(wornEntryBarFields({ ...lv, selectedEntryBarPaidUntil: new Date(Date.now() - day) }, 0)).toEqual({ entry_bar_id: 0, entry_bar: null });
  });
});

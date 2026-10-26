import { canWearEntryBar, wornEntryBarFields, EntryBarRow } from './entry-bar.rules';

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

  it('says nothing when the bar was not loaded', () => {
    expect(wornEntryBarFields({ level: 1 }, 1)).toEqual({});
  });
});

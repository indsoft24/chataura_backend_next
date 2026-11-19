import { svipClientFields } from './svip-chrome';

const row = (periodEndsAt: Date) => ({ level: 2, status: 'active', bubbleOn: true, roomCardOn: true, micWaveOn: true, periodEndsAt });

describe('svipClientFields profile_video', () => {
  it('is on for an active member and off in grace', () => {
    expect(svipClientFields(row(new Date(Date.now() + 864e5))).svip?.profile_video).toBe(true);
    expect(svipClientFields(row(new Date(Date.now() - 864e5))).svip?.profile_video).toBe(false);
  });
});

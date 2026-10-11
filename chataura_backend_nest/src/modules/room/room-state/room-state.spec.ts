jest.mock('@nestjs/schedule', () => ({ Interval: () => () => undefined }));
jest.mock('../../../common/prisma/prisma.service', () => ({ PrismaService: class {} }));
jest.mock('../../../common/redis/redis.service', () => ({ RedisService: class {} }));
jest.mock('../../../common/fcm/realtime.service', () => ({ RealtimeService: class {} }));

import { RoomStateService } from './room-state.service';
import { LiveRoomState, LiveSeat, changedSeats, legacySeatEvent, stateHash } from './room-state.rules';

const seat = (i: number, user: number | null, muted = false): LiveSeat => ({
  seat_index: i,
  user_id: user,
  display_id: user ? `D${user}` : null,
  agora_uid: user,
  display_name: user ? `U${user}` : null,
  avatar_url: null,
  is_muted: muted,
  muted_by_user_id: null,
  is_locked: false,
});

const state = (seats: LiveSeat[], online = 3): LiveRoomState => ({
  room_id: 'r1',
  display_id: '1234567',
  ended: false,
  host_id: 1,
  owner_id: 1,
  co_host_id: null,
  acting_host_id: null,
  host_present: true,
  admin_ids: [],
  max_seats: 3,
  seat_mode: 'request',
  theme_id: null,
  online_count: online,
  seats,
});

describe('room state rules', () => {
  it('hash ignores nothing but content — same state, same hash', () => {
    expect(stateHash(state([seat(0, 1)]))).toBe(stateHash(state([seat(0, 1)])));
    expect(stateHash(state([seat(0, 1)]))).not.toBe(stateHash(state([seat(0, 1)], 4)));
  });

  it('reports only seats whose occupant / mute / lock changed', () => {
    const prev = [seat(0, 1), seat(1, 2), seat(2, null)];
    const next = [seat(0, 1), seat(1, null), seat(2, 3, true)];
    expect(changedSeats(prev, next).map((s) => s.seat_index)).toEqual([1, 2]);
    expect(changedSeats(null, next)).toEqual([]);
  });

  it('a removed seat (capacity reduced) is reported empty', () => {
    const out = changedSeats([seat(0, 1), seat(1, 2)], [seat(0, 1)]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ seat_index: 1, user_id: null });
  });

  it('legacy event matches the format released apps parse', () => {
    const json = JSON.parse(legacySeatEvent(seat(4, 9, true), 77));
    expect(json.event).toBe('seat_updated');
    expect(json.data).toMatchObject({ seat_index: 4, user_id: 9, agora_uid: 9, is_muted: true, rtc_role: 'publisher', seats_version: 77 });
    expect(JSON.parse(legacySeatEvent(seat(4, null), 78)).data).toMatchObject({ user_id: 0, rtc_role: 'audience' });
  });
});

describe('RoomStateService.publishNow', () => {
  function setup(opts: { locked?: boolean } = {}) {
    const kv = new Map<string, string>();
    let version = 100;
    const docs: any[] = [];
    const events: string[][] = [];
    let current: LiveRoomState | null = state([seat(0, 1), seat(1, 2), seat(2, null)]);
    const redisClient: any = {
      set: async (k: string, v: string, ...args: any[]) => {
        if (args.includes('NX') && (opts.locked || kv.has(k))) return null;
        kv.set(k, v);
        return 'OK';
      },
      get: async (k: string) => kv.get(k) ?? null,
      del: async (...keys: string[]) => keys.forEach((k) => kv.delete(k)),
      multi: () => {
        const ops: Array<[string, string]> = [];
        const m: any = { set: (k: string, v: string) => { ops.push([k, v]); return m; }, exec: async () => ops.forEach(([k, v]) => kv.set(k, v)) };
        return m;
      },
    };
    const prisma: any = { $queryRaw: async () => [{ state_version: BigInt(++version) }] };
    const redis: any = { getClient: () => redisClient };
    const realtime: any = {
      setRoomLiveState: async (_r: string, d: any) => { docs.push(d); return true; },
      publishRoomEvents: async (_r: string, t: string[]) => { events.push(t); return true; },
    };
    const svc = new RoomStateService(prisma, redis, realtime);
    svc.setBuilder(async () => current);
    return { svc, docs, events, set: (s: LiveRoomState | null) => { current = s; }, kv };
  }

  it('publishes a versioned document, then skips identical content', async () => {
    const w = setup();
    expect(await w.svc.publishNow('r1')).toBe(true);
    expect(w.docs[0]).toMatchObject({ schema: 1, version: 101, online_count: 3 });
    expect(await w.svc.publishNow('r1')).toBe(false);
    expect(w.docs).toHaveLength(1);
  });

  it('later states get higher versions and old apps get per-seat updates', async () => {
    const w = setup();
    await w.svc.publishNow('r1');
    w.set(state([seat(0, 1), seat(1, null), seat(2, 5)]));
    await w.svc.publishNow('r1');
    expect(w.docs[1].version).toBeGreaterThan(w.docs[0].version);
    expect(w.events).toHaveLength(1);
    expect(w.events[0].map((t) => JSON.parse(t).data.seat_index)).toEqual([1, 2]);
  });

  it('a room that no longer exists publishes ended', async () => {
    const w = setup();
    w.set(null);
    await w.svc.publishNow('r1');
    expect(w.docs[0]).toMatchObject({ ended: true, seats: [] });
  });

  it('does not publish while another container holds the room lock', async () => {
    const w = setup({ locked: true });
    expect(await w.svc.publishNow('r1')).toBe(false);
    expect(w.docs).toHaveLength(0);
    w.svc.onModuleDestroy();
  });
});

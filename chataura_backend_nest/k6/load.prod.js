/**
 * Production profile — documented only. Do NOT treat laptop results as a pass.
 *
 * Intended when Nest is on sized infra (not this Mac):
 *   - 1,000 concurrent WebSocket clients on /ws/rooms + /ws/games
 *   - 250 HTTP rps mixed (health, login, greedy/state, greedy/bet, room heartbeat)
 *
 * Pass criteria (production cluster, not local):
 *   - p95 HTTP < 200ms for health/state/heartbeat
 *   - HTTP 5xx < 0.01%
 *   - no OOM / restart of Nest, Postgres, or Redis
 *   - WS disconnect rate < 1% after the ramp
 *
 * Uncomment the options block below on a dedicated load box:
 *
 * export const options = {
 *   scenarios: {
 *     http_mix: {
 *       executor: 'constant-arrival-rate',
 *       rate: 250,
 *       timeUnit: '1s',
 *       duration: '5m',
 *       preAllocatedVUs: 200,
 *       maxVUs: 400,
 *     },
 *     ws_rooms: {
 *       executor: 'constant-vus',
 *       vus: 1000,
 *       duration: '5m',
 *       exec: 'wsHold',
 *     },
 *   },
 *   thresholds: {
 *     http_req_failed: ['rate<0.0001'],
 *     http_req_duration: ['p(95)<200'],
 *   },
 * };
 */
import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE = __ENV.BASE_URL || 'http://localhost:3000/api/v1';

export const options = {
  vus: 1,
  duration: '5s',
  thresholds: {
    http_req_failed: ['rate<1'],
  },
};

export default function () {
  const health = http.get(`${BASE}/health`);
  check(health, { 'prod profile health reachable': (r) => r.status < 500 });
  sleep(1);
}

export function wsHold() {
  // Placeholder: open Socket.IO /ws/rooms and hold the connection.
  // Implement on the load box with k6/websockets + Nest WS auth when cutover is scheduled.
  sleep(1);
}

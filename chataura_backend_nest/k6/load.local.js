/**
 * Local honesty profile — tens of VUs on a laptop.
 * Pass gate: 0 HTTP 5xx. Laptop p95 < 50ms / 1,500 CCU is NOT a pass gate.
 *
 * Usage: BASE_URL=http://localhost:3000/api/v1 npm run test:k6
 */
import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE = __ENV.BASE_URL || 'http://localhost:3000/api/v1';

export const options = {
  scenarios: {
    local: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '10s', target: 20 },
        { duration: '20s', target: 50 },
        { duration: '10s', target: 0 },
      ],
    },
  },
  thresholds: {
    checks: ['rate>0.99'],
    http_req_failed: ['rate<0.05'],
  },
};

function json(res) {
  try {
    return res.json();
  } catch {
    return {};
  }
}

export function setup() {
  const email = `k6.${Date.now()}@gmail.com`;
  const password = 'secret12';
  const register = http.post(
    `${BASE}/auth/register`,
    JSON.stringify({ email, password, display_name: 'k6' }),
    { headers: { 'Content-Type': 'application/json' } },
  );
  const token = json(register).data?.access_token;
  if (!token) {
    throw new Error(`k6 setup register failed: ${register.body}`);
  }
  const otpRes = http.post(`${BASE}/auth/send-email-otp`, '{}', {
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
  });
  const otp = json(otpRes).data?.dev_otp;
  if (otp) {
    http.post(
      `${BASE}/auth/verify-email-otp`,
      JSON.stringify({ otp }),
      {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      },
    );
  }
  const room = http.post(
    `${BASE}/rooms`,
    JSON.stringify({ title: `k6 ${Date.now()}` }),
    {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
    },
  );
  const roomId = json(room).data?.id;
  if (roomId) {
    http.post(`${BASE}/rooms/${roomId}/join`, '{}', {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
    });
  }
  return { email, password, token, roomId };
}

export default function (data) {
  const health = http.get(`${BASE}/health`);
  check(health, {
    'health 200': (r) => r.status === 200,
    'health not 5xx': (r) => r.status < 500,
  });

  const login = http.post(
    `${BASE}/auth/login`,
    JSON.stringify({ email: data.email, password: data.password }),
    { headers: { 'Content-Type': 'application/json' } },
  );
  check(login, {
    'login not 5xx': (r) => r.status < 500,
    'login success': (r) => json(r).success === true,
  });

  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${data.token}`,
  };

  const state = http.get(`${BASE}/game/greedy/state`, { headers });
  check(state, { 'greedy state not 5xx': (r) => r.status < 500 });

  const bet = http.post(
    `${BASE}/game/greedy/bet`,
    JSON.stringify({ item: 'carrot', amount: 10000 }),
    {
      headers,
      responseCallback: http.expectedStatuses(200, 201, 400, 403),
    },
  );
  check(bet, { 'greedy bet not 5xx': (r) => r.status < 500 });

  if (data.roomId) {
    const hb = http.post(`${BASE}/rooms/${data.roomId}/heartbeat`, '{}', {
      headers,
    });
    check(hb, { 'heartbeat not 5xx': (r) => r.status < 500 });
  }

  sleep(0.3);
}

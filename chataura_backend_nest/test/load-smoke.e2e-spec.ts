import { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createTestApp, registerVerified, authHeader } from './e2e.helpers';

function percentile(arr: number[], p: number): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

interface BenchmarkResult {
  endpoint: string;
  totalRequests: number;
  concurrency: number;
  durationMs: number;
  rps: number;
  p50: number;
  p95: number;
  p99: number;
  max: number;
  errors: number;
}

describe('Load & Smoke Benchmark (e2e)', () => {
  let app: NestFastifyApplication;
  let token: string;

  beforeAll(async () => {
    app = await createTestApp();
    const user = await registerVerified(app, { name: 'LoadTester' });
    token = user.token;
  }, 30000);

  afterAll(async () => {
    await app.close();
  });

  async function runBenchmark(
    name: string,
    fn: () => Promise<number>,
    count = 100,
    concurrency = 10,
  ): Promise<BenchmarkResult> {
    const latencies: number[] = [];
    let errors = 0;
    const start = Date.now();

    const chunks: Array<() => Promise<void>> = [];
    let remaining = count;

    while (remaining > 0) {
      const batchSize = Math.min(concurrency, remaining);
      remaining -= batchSize;

      const batch = async () => {
        const promises = Array.from({ length: batchSize }, async () => {
          const t0 = Date.now();
          try {
            const status = await fn();
            if (status >= 400 && status !== 404) errors++;
          } catch {
            errors++;
          } finally {
            latencies.push(Date.now() - t0);
          }
        });
        await Promise.all(promises);
      };
      chunks.push(batch);
    }

    for (const batch of chunks) {
      await batch();
    }

    const durationMs = Date.now() - start;
    const rps = Math.round((count / (durationMs / 1000)) * 10) / 10;

    return {
      endpoint: name,
      totalRequests: count,
      concurrency,
      durationMs,
      rps,
      p50: percentile(latencies, 50),
      p95: percentile(latencies, 95),
      p99: percentile(latencies, 99),
      max: Math.max(...latencies),
      errors,
    };
  }

  it('runs non-destructive load & smoke test on high-frequency endpoints', async () => {
    const auth = authHeader(token);
    const initialHeap = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
    const results: BenchmarkResult[] = [];

    // 1. Health
    results.push(
      await runBenchmark('GET /api/v1/health', async () => {
        const res = await app.inject({ method: 'GET', url: '/api/v1/health' });
        return res.statusCode;
      }),
    );

    // 2. Auth Session Validation
    results.push(
      await runBenchmark('GET /api/v1/users/me', async () => {
        const res = await app.inject({
          method: 'GET',
          url: '/api/v1/users/me',
          headers: auth,
        });
        return res.statusCode;
      }),
    );

    // 3. Game State
    results.push(
      await runBenchmark('GET /api/v1/games/greedy/state', async () => {
        const res = await app.inject({
          method: 'GET',
          url: '/api/v1/games/greedy/state',
          headers: auth,
        });
        return res.statusCode;
      }),
    );

    // 4. Leaderboard (aggregation over PostgreSQL)
    results.push(
      await runBenchmark('GET /api/v1/games/greedy/leaderboard', async () => {
        const res = await app.inject({
          method: 'GET',
          url: '/api/v1/games/greedy/leaderboard',
          headers: auth,
        });
        return res.statusCode;
      }),
    );

    // 5. Room State
    results.push(
      await runBenchmark('GET /api/v1/rooms', async () => {
        const res = await app.inject({
          method: 'GET',
          url: '/api/v1/rooms',
          headers: auth,
        });
        return res.statusCode;
      }),
    );

    // 6. Chat Conversations List
    results.push(
      await runBenchmark('GET /api/v1/conversations', async () => {
        const res = await app.inject({
          method: 'GET',
          url: '/api/v1/conversations',
          headers: auth,
        });
        return res.statusCode;
      }),
    );

    const finalHeap = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);

    // Output formatted table to console
    console.log('\n================== BENCHMARK RESULTS ==================');
    console.log(
      'Endpoint'.padEnd(32) +
        'Reqs'.padEnd(8) +
        'RPS'.padEnd(10) +
        'p50(ms)'.padEnd(10) +
        'p95(ms)'.padEnd(10) +
        'p99(ms)'.padEnd(10) +
        'Max(ms)'.padEnd(10) +
        'Errors',
    );
    console.log('-'.repeat(98));
    for (const r of results) {
      console.log(
        r.endpoint.padEnd(32) +
          String(r.totalRequests).padEnd(8) +
          String(r.rps).padEnd(10) +
          String(r.p50).padEnd(10) +
          String(r.p95).padEnd(10) +
          String(r.p99).padEnd(10) +
          String(r.max).padEnd(10) +
          String(r.errors),
      );
      // Assertions
      expect(r.errors).toBe(0);
      expect(r.p50).toBeLessThan(100);
    }
    console.log('='.repeat(98));
    console.log(
      `Heap memory: ${initialHeap} MB -> ${finalHeap} MB (Diff: ${finalHeap - initialHeap} MB)\n`,
    );
  }, 60000);
});

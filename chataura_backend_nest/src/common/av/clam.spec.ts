import { createServer, Server } from 'net';
import { scanBuffer } from './clam';

function fakeClamd(reply: string): Promise<{ server: Server; port: number; got: () => Buffer }> {
  return new Promise((ok) => {
    const chunks: Buffer[] = [];
    const server = createServer((s) => {
      s.on('data', (d) => {
        chunks.push(d);
        const all = Buffer.concat(chunks);
        if (all.subarray(-4).equals(Buffer.alloc(4))) s.end(reply + '\0');
      });
    }).listen(0, '127.0.0.1', () => ok({ server, port: (server.address() as any).port, got: () => Buffer.concat(chunks) }));
  });
}

describe('clamd client', () => {
  afterEach(() => { delete process.env.CLAMAV_HOST; delete process.env.CLAMAV_PORT; });
  it('speaks INSTREAM and reads OK / FOUND', async () => {
    for (const [reply, want] of [['stream: OK', 'clean'], ['stream: Eicar-Test-Signature FOUND', 'infected']] as const) {
      const f = await fakeClamd(reply);
      process.env.CLAMAV_HOST = '127.0.0.1';
      process.env.CLAMAV_PORT = String(f.port);
      expect(await scanBuffer(Buffer.from('hello'))).toBe(want);
      expect(f.got().subarray(0, 10).toString('latin1')).toBe('zINSTREAM\0');
      f.server.close();
    }
  });
  it('fails open when clamd is unreachable or not configured', async () => {
    expect(await scanBuffer(Buffer.from('x'))).toBe('unavailable');
    process.env.CLAMAV_HOST = '127.0.0.1';
    process.env.CLAMAV_PORT = '1';
    expect(await scanBuffer(Buffer.from('x'))).toBe('unavailable');
  });
});

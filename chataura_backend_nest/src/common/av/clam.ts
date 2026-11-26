import { Socket } from 'net';
import { createReadStream } from 'fs';
import { Readable } from 'stream';

export type ScanResult = 'clean' | 'infected' | 'unavailable';

/**
 * Sends a stream to clamd (INSTREAM) and returns the verdict. Disabled when CLAMAV_HOST is unset (dev, tests).
 * Fails OPEN ('unavailable') when clamd is down or slow, so an antivirus outage never blocks every upload;
 * the content sniffing and the CSP sandbox on served files still apply.
 */
export function scanStream(stream: Readable, timeoutMs = 120_000): Promise<ScanResult> {
  const host = process.env.CLAMAV_HOST;
  if (!host) return Promise.resolve('unavailable');
  const port = Number(process.env.CLAMAV_PORT || 3310);
  return new Promise((resolve) => {
    const sock = new Socket();
    let reply = '';
    let done = false;
    const finish = (r: ScanResult) => {
      if (done) return;
      done = true;
      sock.destroy();
      stream.destroy();
      resolve(r);
    };
    sock.setTimeout(timeoutMs, () => finish('unavailable'));
    sock.on('error', () => finish('unavailable'));
    sock.on('data', (d) => {
      reply += d.toString('latin1');
      if (reply.includes('\0') || reply.includes('\n')) {
        finish(/FOUND/.test(reply) ? 'infected' : /OK/.test(reply) ? 'clean' : 'unavailable');
      }
    });
    sock.connect(port, host, async () => {
      try {
        sock.write('zINSTREAM\0');
        for await (const chunk of stream) {
          const b = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
          for (let i = 0; i < b.length; i += 1 << 20) {
            const part = b.subarray(i, i + (1 << 20));
            const len = Buffer.alloc(4);
            len.writeUInt32BE(part.length);
            sock.write(Buffer.concat([len, part]));
          }
        }
        sock.write(Buffer.alloc(4)); // zero length ends the stream
      } catch {
        finish('unavailable');
      }
    });
  });
}

export const scanBuffer = (buf: Buffer) => scanStream(Readable.from([buf]), 60_000);
export const scanFile = (path: string) => scanStream(createReadStream(path));

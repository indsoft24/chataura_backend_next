/** Pure rules for the video compressor (unit-tested); the worker only runs ffmpeg around them. */

export const QUEUE_KEY = 'video:compress';
export const FAILED_KEY = 'video:compress:failed';
export const TRIES_KEY = 'video:compress:tries';
export const MAX_TRIES = 3;
export const SHORT_SIDE = 480;
/** Already small enough: nothing to gain, and re-encoding only costs quality. */
export const SKIP_BITRATE = 1_200_000;

export type Probe = { width: number; height: number; bitRate: number };

/** Video extensions the worker handles; the file keeps its name, so we only re-encode real mp4/mov/m4v. */
export function isCompressible(file: string): boolean {
  return /^[A-Za-z0-9._-]+\.(mp4|mov|m4v)$/i.test(file) && !file.startsWith('.');
}

export function needsCompress(p: Probe): boolean {
  const short = Math.min(p.width, p.height);
  return short > SHORT_SIDE || p.bitRate === 0 || p.bitRate > SKIP_BITRATE;
}

/** Short side capped at 480 px, never upscaled, even numbers (H.264 needs them). */
export function scaleFilter(): string {
  return `scale='if(gt(iw,ih),-2,min(${SHORT_SIDE},iw))':'if(gt(iw,ih),min(${SHORT_SIDE},ih),-2)'`;
}

/** Keep the new file only when it is clearly smaller; otherwise the original stays untouched. */
export function worthKeeping(oldBytes: number, newBytes: number): boolean {
  return newBytes > 0 && newBytes < oldBytes * 0.8;
}

/**
 * Only real MP4/MOV files (an `ftyp` box at byte 4) reach ffmpeg. ffmpeg decides by content, not by name, so a text
 * file named .mp4 holding an HLS playlist could make it read local files or call other servers.
 */
export function isMp4Magic(head: Buffer): boolean {
  return head.length >= 12 && head.subarray(4, 8).toString('latin1') === 'ftyp';
}

/** Input options that lock ffmpeg/ffprobe to a plain local file read with the mp4 demuxer. */
export const SAFE_INPUT = ['-protocol_whitelist', 'file', '-f', 'mov'];

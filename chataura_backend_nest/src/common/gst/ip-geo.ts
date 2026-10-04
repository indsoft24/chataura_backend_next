import { IndianState, resolveIndianState } from './indian-states';

type GeoLookup = { country: string; region: string; city: string } | null;
type GeoIpLite = { lookup(ip: string): GeoLookup };

let geoip: GeoIpLite | null | undefined;

/** Loads the offline MaxMind GeoLite data (~110 MB RSS) on first use only. */
function load(): GeoIpLite | null {
  if (geoip === undefined) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      geoip = require('geoip-lite') as GeoIpLite;
    } catch {
      geoip = null;
    }
  }
  return geoip;
}

/**
 * Best-effort Indian state for a client IP. Broadband / Wi-Fi ranges usually
 * resolve; mobile-data (CGNAT) ranges often carry the country only, in which
 * case this returns null rather than guessing.
 */
export function indianStateFromIp(ip: string | null | undefined): IndianState | null {
  if (!ip) return null;
  try {
    const hit = load()?.lookup(ip.replace(/^::ffff:/, ''));
    if (!hit || hit.country !== 'IN' || !hit.region) return null;
    return resolveIndianState(hit.region);
  } catch {
    return null;
  }
}

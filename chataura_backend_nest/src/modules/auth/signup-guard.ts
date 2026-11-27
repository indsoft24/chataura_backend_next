/** Rules against scripted / throwaway signups (pure, unit-tested; the auth service applies them). */
// eslint-disable-next-line @typescript-eslint/no-require-imports
const LIST: string[] = require('disposable-email-domains');
/** Seen in the wild against us but missing from the public list. */
const EXTRA = ['dvdee.com'];
const BLOCKED = new Set<string>([...LIST, ...EXTRA]);

/** True for throwaway-mail domains, including any sub-domain of one. */
export function isDisposableEmail(email: string): boolean {
  const parts = (email.toLowerCase().split('@').pop() ?? '').split('.');
  for (let i = 0; i < parts.length - 1; i++) if (BLOCKED.has(parts.slice(i).join('.'))) return true;
  return false;
}

/** New accounts one IP may open in a day. Phones on one mobile network share IPs, so this is generous. */
export const SIGNUPS_PER_IP_PER_DAY = 10;

/**
 * Indian states / union territories with their GST state codes (first two
 * digits of a GSTIN). Used as "Place of Supply" in GSTR-1 ("27-Maharashtra").
 */
export type IndianState = { code: string; name: string; aliases: string[] };

export const INDIAN_STATES: IndianState[] = [
  { code: '01', name: 'Jammu and Kashmir', aliases: ['JK', 'J&K', 'Jammu & Kashmir'] },
  { code: '02', name: 'Himachal Pradesh', aliases: ['HP'] },
  { code: '03', name: 'Punjab', aliases: ['PB'] },
  { code: '04', name: 'Chandigarh', aliases: ['CH'] },
  { code: '05', name: 'Uttarakhand', aliases: ['UK', 'UT', 'Uttaranchal'] },
  { code: '06', name: 'Haryana', aliases: ['HR'] },
  { code: '07', name: 'Delhi', aliases: ['DL', 'New Delhi', 'NCT of Delhi', 'National Capital Territory of Delhi'] },
  { code: '08', name: 'Rajasthan', aliases: ['RJ'] },
  { code: '09', name: 'Uttar Pradesh', aliases: ['UP'] },
  { code: '10', name: 'Bihar', aliases: ['BR', 'BH'] },
  { code: '11', name: 'Sikkim', aliases: ['SK'] },
  { code: '12', name: 'Arunachal Pradesh', aliases: ['AR'] },
  { code: '13', name: 'Nagaland', aliases: ['NL'] },
  { code: '14', name: 'Manipur', aliases: ['MN'] },
  { code: '15', name: 'Mizoram', aliases: ['MZ'] },
  { code: '16', name: 'Tripura', aliases: ['TR'] },
  { code: '17', name: 'Meghalaya', aliases: ['ML'] },
  { code: '18', name: 'Assam', aliases: ['AS'] },
  { code: '19', name: 'West Bengal', aliases: ['WB'] },
  { code: '20', name: 'Jharkhand', aliases: ['JH'] },
  { code: '21', name: 'Odisha', aliases: ['OR', 'OD', 'Orissa'] },
  { code: '22', name: 'Chhattisgarh', aliases: ['CT', 'CG', 'Chattisgarh'] },
  { code: '23', name: 'Madhya Pradesh', aliases: ['MP'] },
  { code: '24', name: 'Gujarat', aliases: ['GJ'] },
  {
    code: '26',
    name: 'Dadra and Nagar Haveli and Daman and Diu',
    aliases: ['DH', 'DN', 'DD', 'Daman and Diu', 'Dadra and Nagar Haveli', 'Daman & Diu', 'Dadra & Nagar Haveli'],
  },
  { code: '27', name: 'Maharashtra', aliases: ['MH'] },
  { code: '29', name: 'Karnataka', aliases: ['KA'] },
  { code: '30', name: 'Goa', aliases: ['GA'] },
  { code: '31', name: 'Lakshadweep', aliases: ['LD'] },
  { code: '32', name: 'Kerala', aliases: ['KL'] },
  { code: '33', name: 'Tamil Nadu', aliases: ['TN'] },
  { code: '34', name: 'Puducherry', aliases: ['PY', 'Pondicherry'] },
  { code: '35', name: 'Andaman and Nicobar Islands', aliases: ['AN', 'Andaman & Nicobar', 'Andaman and Nicobar'] },
  { code: '36', name: 'Telangana', aliases: ['TG', 'TS'] },
  { code: '37', name: 'Andhra Pradesh', aliases: ['AP'] },
  { code: '38', name: 'Ladakh', aliases: ['LA'] },
  { code: '97', name: 'Other Territory', aliases: ['OT'] },
];

const key = (s: string) => s.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]/g, '');

const LOOKUP = new Map<string, IndianState>();
for (const s of INDIAN_STATES) {
  LOOKUP.set(key(s.name), s);
  LOOKUP.set(s.code, s);
  LOOKUP.set(String(Number(s.code)), s);
  for (const a of s.aliases) LOOKUP.set(key(a), s);
}

/** Resolves a free-form state value ("MH", "maharashtra", "27", "IN-MH") to a canonical state. */
export function resolveIndianState(input: string | null | undefined): IndianState | null {
  if (!input) return null;
  const raw = String(input).trim().replace(/^IN[-_ ]/i, '');
  if (!raw) return null;
  return LOOKUP.get(key(raw)) ?? LOOKUP.get(raw) ?? null;
}

/** GSTR-1 place-of-supply label, e.g. "27-Maharashtra". */
export function placeOfSupplyLabel(s: IndianState): string {
  return `${s.code}-${s.name}`;
}

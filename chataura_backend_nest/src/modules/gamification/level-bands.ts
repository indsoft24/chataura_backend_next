import { PrismaService } from '../../common/prisma/prisma.service';

/** Laravel `levels` bands. Level 0 is 0–99 XP. */
export const LARAVEL_LEVEL_BANDS = [
  { level: 0, minXp: 0, maxXp: 99, label: 'Level 0' },
  { level: 1, minXp: 100, maxXp: 299, label: 'Level 1' },
  { level: 2, minXp: 300, maxXp: 599, label: 'Level 2' },
  { level: 3, minXp: 600, maxXp: 999, label: 'Level 3' },
  { level: 4, minXp: 1000, maxXp: 1999, label: 'Level 4' },
  { level: 5, minXp: 2000, maxXp: 3499, label: 'Level 5' },
  { level: 6, minXp: 3500, maxXp: 5499, label: 'Level 6' },
  { level: 7, minXp: 5500, maxXp: 8499, label: 'Level 7' },
  { level: 8, minXp: 8500, maxXp: 12999, label: 'Level 8' },
  { level: 9, minXp: 13000, maxXp: 19999, label: 'Level 9' },
  { level: 10, minXp: 20000, maxXp: 999999999, label: 'Level 10' },
] as const;

type LevelRow = {
  level: number;
  minXp: bigint | number;
  maxXp: bigint | number;
  label?: string | null;
};

/** The old Nest seed: level 1 is 0–99 and level 2 is 100–399. */
export function isSquaredSeed(rows: LevelRow[]) {
  const byLevel = new Map(rows.map((r) => [r.level, r]));
  const first = byLevel.get(1);
  const second = byLevel.get(2);
  if (!first || !second) return false;
  return (
    Number(first.minXp) === 0 &&
    Number(first.maxXp) === 99 &&
    Number(second.minXp) === 100 &&
    Number(second.maxXp) === 399
  );
}

export function bandForXp(xp: number, rows: LevelRow[]) {
  const sorted = [...rows].sort(
    (a, b) => Number(b.minXp) - Number(a.minXp) || b.level - a.level,
  );
  const match =
    sorted.find((r) => Number(r.minXp) <= xp && Number(r.maxXp) >= xp) ??
    sorted.find((r) => Number(r.minXp) <= xp) ??
    [...rows].sort((a, b) => a.level - b.level)[0];
  const minXp = match ? Number(match.minXp) : 0;
  const maxXp = match ? Number(match.maxXp) : 99;
  const level = match ? match.level : 0;
  const label = match?.label || `Level ${level}`;
  const span = Math.max(1, maxXp - minXp);
  const xpProgressPct = Math.min(
    100,
    Math.round(((100 * (xp - minXp)) / span) * 100) / 100,
  );
  return { level, minXp, maxXp, label, xpProgressPct };
}

export async function ensureLaravelLevelBands(prisma: PrismaService) {
  const rows = await prisma.level.findMany();
  if (rows.length > 0 && !isSquaredSeed(rows)) return rows;
  if (rows.length > 0) await prisma.level.deleteMany();
  await prisma.level.createMany({
    data: LARAVEL_LEVEL_BANDS.map((b) => ({
      level: b.level,
      minXp: b.minXp,
      maxXp: b.maxXp,
      label: b.label,
    })),
  });
  return prisma.level.findMany();
}

-- Stable unique key per gift so clients never confuse gifts that share a name
-- across categories (e.g. "Wedding" standard vs "Wedding" CP).
-- Additive + idempotent: safe to run on a live database, old code ignores the column.

ALTER TABLE "gifts" ADD COLUMN IF NOT EXISTS "gift_key" VARCHAR(200);

-- Backfill: "<category>.<slug(name)>"; later duplicates in the same category get "_<id>".
-- Must stay in sync with buildGiftKey() in src/common/utils/gift-key.ts.
WITH base AS (
  SELECT
    id,
    lower(trim("category")) || '.' ||
      COALESCE(
        NULLIF(trim(both '_' from regexp_replace(lower("name"), '[^a-z0-9]+', '_', 'g')), ''),
        'gift'
      ) AS k
  FROM "gifts"
  WHERE "gift_key" IS NULL
),
ranked AS (
  SELECT id, k, row_number() OVER (PARTITION BY k ORDER BY id) AS rn
  FROM base
)
UPDATE "gifts" g
SET "gift_key" = CASE WHEN r.rn = 1 THEN r.k ELSE r.k || '_' || g.id END
FROM ranked r
WHERE g.id = r.id;

CREATE UNIQUE INDEX IF NOT EXISTS "gifts_gift_key_key" ON "gifts"("gift_key");

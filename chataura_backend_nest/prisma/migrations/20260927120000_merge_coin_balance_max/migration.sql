BEGIN;

SET LOCAL lock_timeout = '5s';

-- wallet_balance becomes the only coin column; each user keeps the higher of
-- the two legacy values, and every increase is recorded as BALANCE_MERGE.
CREATE TABLE IF NOT EXISTS "coin_balance_merge_audit" (
  "user_id" BIGINT NOT NULL,
  "old_wallet_balance" BIGINT NOT NULL,
  "old_coin_balance" BIGINT NOT NULL,
  "merged_balance" BIGINT NOT NULL,
  "merged_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "coin_balance_merge_audit_pkey" PRIMARY KEY ("user_id")
);

-- Row locks so no concurrent coin write lands between snapshot and update.
SELECT count(*) FROM (
  SELECT "id" FROM "users" WHERE "wallet_balance" <> "coin_balance" FOR UPDATE
) locked_users;

INSERT INTO "coin_balance_merge_audit" ("user_id", "old_wallet_balance", "old_coin_balance", "merged_balance")
SELECT "id", "wallet_balance", "coin_balance", GREATEST("wallet_balance", "coin_balance")
FROM "users"
WHERE "wallet_balance" <> "coin_balance"
ON CONFLICT ("user_id") DO NOTHING;

INSERT INTO "coin_transactions"
  ("user_id", "type", "title", "coin_amount", "balance_after", "reference_id", "status", "meta", "created_at")
SELECT
  a."user_id",
  'BALANCE_MERGE',
  'Balance correction (legacy column merge)',
  a."merged_balance" - a."old_wallet_balance",
  a."merged_balance",
  'balance_merge_' || a."user_id",
  'success',
  jsonb_build_object(
    'source', 'balance_merge',
    'currency', 'coins',
    'old_wallet_balance', a."old_wallet_balance",
    'old_coin_balance', a."old_coin_balance"
  ),
  CURRENT_TIMESTAMP
FROM "coin_balance_merge_audit" a
WHERE a."merged_balance" > a."old_wallet_balance"
ON CONFLICT DO NOTHING;

UPDATE "users" u
SET "wallet_balance" = a."merged_balance",
    "coin_balance" = a."merged_balance"
FROM "coin_balance_merge_audit" a
WHERE a."user_id" = u."id"
  AND (u."wallet_balance" <> a."merged_balance" OR u."coin_balance" <> a."merged_balance");

COMMIT;

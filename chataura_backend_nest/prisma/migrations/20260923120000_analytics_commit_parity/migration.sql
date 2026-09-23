-- Rename duplicate ledger keys so the unique index can be added without dropping history.
WITH ranked AS (
  SELECT id,
         row_number() OVER (PARTITION BY user_id, reference_id ORDER BY id) AS rn
  FROM coin_transactions
  WHERE reference_id IS NOT NULL
)
UPDATE coin_transactions AS c
SET reference_id = c.reference_id || '_dup_' || c.id::text
FROM ranked AS r
WHERE c.id = r.id
  AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS coin_transactions_user_reference_unique
  ON coin_transactions (user_id, reference_id);

ALTER TABLE user_unlocked_frames
  ADD COLUMN IF NOT EXISTS duration_days INTEGER,
  ADD COLUMN IF NOT EXISTS unlock_type VARCHAR(32);

ALTER TABLE bonus_claims
  ADD COLUMN IF NOT EXISTS reference_key VARCHAR(128);

CREATE UNIQUE INDEX IF NOT EXISTS bonus_claims_user_reference_unique
  ON bonus_claims (user_id, reference_key);

CREATE TABLE IF NOT EXISTS party_room_bonus_tiers (
  id BIGSERIAL PRIMARY KEY,
  duration_minutes INTEGER NOT NULL,
  reward_type VARCHAR(16) NOT NULL DEFAULT 'coins',
  coins INTEGER NOT NULL DEFAULT 0,
  gems INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS party_room_bonus_tiers_is_active_sort_order_idx
  ON party_room_bonus_tiers (is_active, sort_order);

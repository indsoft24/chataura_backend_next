-- Reward history (GET /users/me/rewards): a user's reward rows by type, and their rocket rewards.
CREATE INDEX IF NOT EXISTS "coin_transactions_user_id_type_created_at_idx"
  ON "coin_transactions"("user_id", "type", "created_at");
CREATE INDEX IF NOT EXISTS "rocket_rewards_user_id_idx" ON "rocket_rewards"("user_id");

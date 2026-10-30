-- One row per user per settled round / spin of the four coin games.
-- game: greedy | lucky77 | slot | lucky_spin. net = payout - total_bet; result: win | loss | even.
CREATE TABLE "game_history" (
    "id" BIGSERIAL NOT NULL,
    "user_id" BIGINT NOT NULL,
    "game" VARCHAR(16) NOT NULL,
    "round_ref" VARCHAR(64) NOT NULL,
    "total_bet" BIGINT NOT NULL,
    "payout" BIGINT NOT NULL,
    "net" BIGINT NOT NULL,
    "result" VARCHAR(8) NOT NULL,
    "detail" JSONB,
    "settled_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "game_history_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "game_history_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "game_history_user_game_ref_key" ON "game_history"("user_id", "game", "round_ref");
CREATE INDEX "game_history_user_id_settled_at_idx" ON "game_history"("user_id", "settled_at" DESC);
CREATE INDEX "game_history_game_settled_at_idx" ON "game_history"("game", "settled_at" DESC);

-- Back-fill: Greedy and Lucky 77 from settled rounds.
INSERT INTO "game_history" ("user_id","game","round_ref","total_bet","payout","net","result","detail","settled_at")
SELECT b.user_id, 'greedy', b.round_id::text, SUM(b.chip_amount), SUM(b.actual_payout),
       SUM(b.actual_payout) - SUM(b.chip_amount),
       CASE WHEN SUM(b.actual_payout) > SUM(b.chip_amount) THEN 'win' WHEN SUM(b.actual_payout) < SUM(b.chip_amount) THEN 'loss' ELSE 'even' END,
       jsonb_build_object('winning_item', r.winning_item, 'multiplier', r.winning_multiplier,
         'picks', jsonb_agg(jsonb_build_object('item', b.item, 'bet', b.chip_amount))),
       COALESCE(r.settled_at, r.created_at)
FROM greedy_bets b JOIN greedy_rounds r ON r.id = b.round_id
WHERE r.phase = 'completed'
GROUP BY b.user_id, b.round_id, r.winning_item, r.winning_multiplier, r.settled_at, r.created_at
ON CONFLICT DO NOTHING;

INSERT INTO "game_history" ("user_id","game","round_ref","total_bet","payout","net","result","detail","settled_at")
SELECT b.user_id, 'lucky77', b.round_id::text, SUM(b.chip_amount), SUM(b.actual_payout),
       SUM(b.actual_payout) - SUM(b.chip_amount),
       CASE WHEN SUM(b.actual_payout) > SUM(b.chip_amount) THEN 'win' WHEN SUM(b.actual_payout) < SUM(b.chip_amount) THEN 'loss' ELSE 'even' END,
       jsonb_build_object('winning_item', r.winning_item, 'multiplier', r.winning_multiplier,
         'picks', jsonb_agg(jsonb_build_object('item', b.option, 'bet', b.chip_amount))),
       COALESCE(r.settled_at, r.created_at)
FROM lucky77_bets b JOIN lucky77_rounds r ON r.id = b.round_id
WHERE r.phase = 'completed'
GROUP BY b.user_id, b.round_id, r.winning_item, r.winning_multiplier, r.settled_at, r.created_at
ON CONFLICT DO NOTHING;

-- Lucky Slots from slot_spins.
INSERT INTO "game_history" ("user_id","game","round_ref","total_bet","payout","net","result","detail","settled_at")
SELECT s.user_id, 'slot', s.id::text, s.bet, s.payout, s.payout - s.bet,
       CASE WHEN s.payout > s.bet THEN 'win' WHEN s.payout < s.bet THEN 'loss' ELSE 'even' END,
       jsonb_build_object('grid', s.grid), s.created_at
FROM slot_spins s
ON CONFLICT DO NOTHING;

-- Lucky Spin has no table of its own: rebuild from the coin ledger (cost row + the win row that follows it).
INSERT INTO "game_history" ("user_id","game","round_ref","total_bet","payout","net","result","detail","settled_at")
SELECT c.user_id, 'lucky_spin', c.reference_id, -c.coin_amount, COALESCE(w.coin_amount, 0),
       COALESCE(w.coin_amount, 0) + c.coin_amount,
       CASE WHEN COALESCE(w.coin_amount, 0) > -c.coin_amount THEN 'win' WHEN COALESCE(w.coin_amount, 0) < -c.coin_amount THEN 'loss' ELSE 'even' END,
       jsonb_build_object('backfilled', true, 'prize', w.title), c.created_at
FROM coin_transactions c
LEFT JOIN LATERAL (
  SELECT coin_amount, title FROM coin_transactions x
  WHERE x.user_id = c.user_id AND x.type = 'SPIN_WIN' AND x.created_at >= c.created_at AND x.created_at < c.created_at + interval '5 seconds'
  ORDER BY x.created_at LIMIT 1
) w ON true
WHERE c.type = 'SPIN' AND c.reference_id IS NOT NULL AND c.coin_amount < 0
ON CONFLICT DO NOTHING;

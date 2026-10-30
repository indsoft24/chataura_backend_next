-- Read-only: every query should return no rows.

-- 1. Settled Greedy / Lucky 77 rounds and Slot spins with bets but no history row.
SELECT 'greedy' AS game, b.user_id, b.round_id::text AS ref FROM greedy_bets b
  JOIN greedy_rounds r ON r.id = b.round_id AND r.phase = 'completed'
  LEFT JOIN game_history h ON h.user_id = b.user_id AND h.game = 'greedy' AND h.round_ref = b.round_id::text
  WHERE h.id IS NULL GROUP BY b.user_id, b.round_id
UNION ALL
SELECT 'lucky77', b.user_id, b.round_id::text FROM lucky77_bets b
  JOIN lucky77_rounds r ON r.id = b.round_id AND r.phase = 'completed'
  LEFT JOIN game_history h ON h.user_id = b.user_id AND h.game = 'lucky77' AND h.round_ref = b.round_id::text
  WHERE h.id IS NULL GROUP BY b.user_id, b.round_id
UNION ALL
SELECT 'slot', s.user_id, s.id::text FROM slot_spins s
  LEFT JOIN game_history h ON h.user_id = s.user_id AND h.game = 'slot' AND h.round_ref = s.id::text
  WHERE h.id IS NULL;

-- 2. History rows whose money disagrees with the bet tables (slot, greedy, lucky77).
SELECT h.id, h.game, h.round_ref FROM game_history h JOIN slot_spins s ON h.game = 'slot' AND h.round_ref = s.id::text
  WHERE h.total_bet <> s.bet OR h.payout <> s.payout
UNION ALL
SELECT h.id, h.game, h.round_ref FROM game_history h
  JOIN (SELECT user_id, round_id, SUM(chip_amount) bet, SUM(actual_payout) pay FROM greedy_bets GROUP BY 1, 2) g
    ON h.game = 'greedy' AND h.user_id = g.user_id AND h.round_ref = g.round_id::text
  WHERE h.total_bet <> g.bet OR h.payout <> g.pay
UNION ALL
SELECT h.id, h.game, h.round_ref FROM game_history h
  JOIN (SELECT user_id, round_id, SUM(chip_amount) bet, SUM(actual_payout) pay FROM lucky77_bets GROUP BY 1, 2) l
    ON h.game = 'lucky77' AND h.user_id = l.user_id AND h.round_ref = l.round_id::text
  WHERE h.total_bet <> l.bet OR h.payout <> l.pay;

-- 3. Wins the ledger paid that history does not show (per user, game), for rows recorded after the table existed.
SELECT c.user_id, c.type, SUM(c.coin_amount) AS ledger_paid, COALESCE(MAX(x.paid), 0) AS history_paid
FROM coin_transactions c
LEFT JOIN (SELECT user_id, game, SUM(payout) paid FROM game_history GROUP BY 1, 2) x
  ON x.user_id = c.user_id AND x.game = CASE c.type WHEN 'GAME_SLOT_WIN' THEN 'slot' WHEN 'GAME_GREEDY_WIN' THEN 'greedy' WHEN 'GAME_LUCKY77_WIN' THEN 'lucky77' END
WHERE c.type IN ('GAME_SLOT_WIN', 'GAME_GREEDY_WIN', 'GAME_LUCKY77_WIN')
GROUP BY c.user_id, c.type
HAVING SUM(c.coin_amount) <> COALESCE(MAX(x.paid), 0);

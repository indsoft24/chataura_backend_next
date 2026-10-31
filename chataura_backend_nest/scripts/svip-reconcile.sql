-- Read-only reconciliation of SVIP, Gold Mine and room dice data. Safe on production (SELECT only).
--   psql "$DATABASE_URL" -f scripts/svip-reconcile.sql
-- Every query should return no rows (or 0). Anything else is worth a look.

\echo '1) Ledger chain breaks at SVIP / Gold Mine rows (previous balance + amount <> balance after)'
WITH chain AS (
  SELECT id, user_id, type, coin_amount, balance_after,
         lag(balance_after) OVER (PARTITION BY user_id ORDER BY id) AS prev_balance
  FROM coin_transactions
  -- XP / gem rows carry their own balance in balance_after; only coin rows form the wallet chain.
  WHERE balance_after IS NOT NULL AND COALESCE(meta->>'currency', 'coins') = 'coins'
)
SELECT id, user_id, type, prev_balance, coin_amount, balance_after
FROM chain
WHERE (type LIKE 'SVIP\_%' OR type LIKE 'GOLD\_MINE\_%')
  AND prev_balance IS NOT NULL
  AND prev_balance + coin_amount <> balance_after
ORDER BY id DESC
LIMIT 100;

\echo '2) SVIP / Gold Mine users whose wallet differs from their latest ledger balance'
WITH touched AS (
  SELECT DISTINCT user_id FROM coin_transactions WHERE type LIKE 'SVIP\_%' OR type LIKE 'GOLD\_MINE\_%'
), latest AS (
  SELECT DISTINCT ON (ct.user_id) ct.user_id, ct.balance_after
  FROM coin_transactions ct JOIN touched t ON t.user_id = ct.user_id
  WHERE ct.balance_after IS NOT NULL AND COALESCE(ct.meta->>'currency', 'coins') = 'coins'
  ORDER BY ct.user_id, ct.id DESC
)
SELECT u.id AS user_id, u.wallet_balance, l.balance_after AS ledger_balance
FROM latest l JOIN users u ON u.id = l.user_id
WHERE u.wallet_balance <> l.balance_after
ORDER BY u.id
LIMIT 100;

\echo '3) Memberships still active/grace after their grace window (renewal cron behind by > 2 h)'
SELECT s.user_id, s.level, s.status, s.period_ends_at
FROM user_svips s
WHERE s.status IN ('active', 'grace')
  AND s.period_ends_at
      + make_interval(days => COALESCE(NULLIF((SELECT extra_settings->>'svip_grace_days' FROM admin_settings WHERE id = 1), '')::int, 3))
      + interval '2 hours' < now()
ORDER BY s.period_ends_at
LIMIT 100;

\echo '4) Recharge-type memberships with no recharge, old coin purchase/upgrade or admin grant behind them (promo / seller / admin gifts have none by design)'
SELECT s.user_id, s.level, s.status
FROM user_svips s
WHERE s.source = 'recharge' AND NOT EXISTS (
  SELECT 1 FROM coin_transactions ct
  WHERE ct.user_id = s.user_id AND ct.type IN ('SVIP_PURCHASE', 'SVIP_UPGRADE', 'SVIP_ADMIN')
)
AND NOT EXISTS (SELECT 1 FROM svip_recharge_spends r WHERE r.user_id = s.user_id)
LIMIT 100;

\echo '4b) A recharge used for SVIP for more rupees than it was worth, or one that was not a paid Razorpay recharge'
SELECT r.purchase_id, sum(r.amount_inr) AS used_inr, p.amount_minor / 100.0 AS paid, p.status, p.payment_source
FROM svip_recharge_spends r
JOIN coin_purchase_transactions p ON p.id = r.purchase_id
GROUP BY r.purchase_id, p.amount_minor, p.status, p.payment_source
HAVING p.status <> 'success' OR p.payment_source <> 'RAZORPAY'
    OR sum(r.amount_inr) > COALESCE((SELECT c.base_price_inr FROM coin_packages c WHERE c.id = (SELECT package_id FROM coin_purchase_transactions WHERE id = r.purchase_id)), p.amount_minor / 100.0) + 0.01
LIMIT 100;

\echo '5) More than one monthly reward for the same IST month'
SELECT user_id, meta->>'month' AS month, count(*) AS claims
FROM coin_transactions
WHERE type = 'SVIP_MONTHLY_REWARD'
GROUP BY user_id, meta->>'month'
HAVING count(*) > 1;

\echo '6) More than one maintenance charge for the same period'
SELECT user_id, meta->>'period_ended_at' AS period_ended_at, count(*) AS charges
FROM coin_transactions
WHERE type = 'SVIP_MAINTENANCE'
GROUP BY user_id, meta->>'period_ended_at'
HAVING count(*) > 1;

\echo '7) SVIP frames still owned after the membership ended'
SELECT uf.user_id, uf.frame_id, uf.expires_at, s.status
FROM user_unlocked_frames uf
LEFT JOIN user_svips s ON s.user_id = uf.user_id
WHERE uf.unlock_type = 'svip'
  AND (uf.expires_at IS NULL OR uf.expires_at > now())
  AND (s.user_id IS NULL OR s.status = 'expired')
LIMIT 100;

\echo '8) Gold Mines with no activation payment'
SELECT m.user_id, m.plan_id, m.expires_at
FROM user_gold_mines m
WHERE NOT EXISTS (
  SELECT 1 FROM coin_transactions ct
  WHERE ct.user_id = m.user_id AND ct.type = 'GOLD_MINE_ACTIVATE' AND (ct.meta->>'plan_id')::int = m.plan_id
)
LIMIT 100;

\echo '9) Coin prizes drawn but never paid'
SELECT d.id AS draw_id, d.user_id, d.prize->>'coins' AS coins
FROM gold_mine_draws d
WHERE d.prize->>'kind' = 'coins'
  AND NOT EXISTS (
    SELECT 1 FROM coin_transactions ct
    WHERE ct.user_id = d.user_id AND ct.reference_id = 'gold_mine_draw_' || d.id
  )
LIMIT 100;

\echo '10) Days with more draws than any allowance allows (all mines + highest SVIP bonus)'
SELECT d.user_id, d.day, count(*) AS draws
FROM gold_mine_draws d
GROUP BY d.user_id, d.day
HAVING count(*) > (SELECT COALESCE(sum(daily_draws), 0) FROM gold_mine_plans)
                + (SELECT COALESCE(max(gold_mine_bonus_draws), 0) FROM svip_level_configs)
LIMIT 100;

\echo '11) Dice rolls with an impossible value or more re-rolls than the level allows'
SELECT r.id, r.user_id, r.value, r.svip_level, r.refresh_count
FROM dice_rolls r
LEFT JOIN svip_level_configs c ON c.level = r.svip_level
WHERE r.value NOT BETWEEN 1 AND 6
   OR r.refresh_count > COALESCE(c.dice_refreshes, 0)
LIMIT 100;

\echo '12) Seller-given SVIP with no ledger debit, or a debit that is not price + recharge coins'
SELECT g.id, g.giver_id, g.price_coins, g.recharge_coins, ct.coin_amount AS debited
FROM svip_gifts g
LEFT JOIN coin_transactions ct
  ON ct.user_id = g.giver_id AND ct.reference_id = 'svip_gift_' || g.giver_id || '_' || g.request_id
WHERE g.giver_role = 'seller'
  AND (ct.id IS NULL OR abs(ct.coin_amount) <> g.price_coins + g.recharge_coins)
LIMIT 100;

\echo '13) Recharge coins promised to a user but never credited (seller or admin gift)'
SELECT g.id, g.giver_id, g.giver_role, g.user_id, g.recharge_coins
FROM svip_gifts g
WHERE g.recharge_coins > 0
  AND NOT EXISTS (
    SELECT 1 FROM coin_transactions ct
    WHERE ct.user_id = g.user_id AND ct.coin_amount = g.recharge_coins
      AND ct.reference_id IN ('svip_gift_rc_' || g.giver_id || '_' || g.request_id,
                              'svip_admin_rc_' || g.request_id)
  )
LIMIT 100;

\echo '14) Bought entry bars whose coins_paid differs from what the ledger took'
SELECT b.user_id, b.entry_bar_id, b.coins_paid, COALESCE(l.paid, 0) AS ledger_paid
FROM user_entry_bars b
LEFT JOIN LATERAL (
  SELECT SUM(-ct.coin_amount) AS paid FROM coin_transactions ct
  WHERE ct.user_id = b.user_id AND ct.reference_id LIKE 'entry\_bar:' || b.entry_bar_id || ':%'
) l ON true
WHERE b.coins_paid <> COALESCE(l.paid, 0)
LIMIT 100;

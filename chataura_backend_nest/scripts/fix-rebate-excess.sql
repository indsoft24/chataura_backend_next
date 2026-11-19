-- One-off correction for the lucky-gift-rebate setting mistake (rebate was 1-100% from 2026-11-12 10:48 UTC).
-- For the 11 main accounts: coins = before + 25% of the rise, gems = before + 20%, XP = before + 30% (level from XP).
-- Never raises anything. Idempotent (reference ids are unique per user).
--
-- Dry run (default, rolls back):   psql ... -f fix-rebate-excess.sql
-- Apply for real:                  psql ... -v apply=1 -f fix-rebate-excess.sql
\set ON_ERROR_STOP on
\if :{?apply}
\else
\set apply 0
\endif
\set cutoff '''2026-11-12 10:48+00'''

BEGIN;

CREATE TEMP TABLE fix_plan ON COMMIT DROP AS
WITH ids(id) AS (VALUES (1959),(1180),(1377),(1785),(1643),(1895),(1931),(1955),(1739),(1841),(2120)),
c0 AS (
  SELECT DISTINCT ON (user_id) user_id, balance_after b FROM coin_transactions
  WHERE created_at < :cutoff AND balance_after IS NOT NULL AND type <> 'XP' AND user_id IN (SELECT id FROM ids)
  ORDER BY user_id, id DESC),
gr AS (SELECT user_id, sum((meta->>'gems_delta')::bigint) g FROM coin_transactions
       WHERE type = 'GIFT_RECEIVED' AND created_at >= :cutoff GROUP BY 1),
gc AS (SELECT user_id, sum(gems_debited) g FROM gem_conversions WHERE created_at >= :cutoff GROUP BY 1),
xp AS (SELECT user_id, sum((meta->>'xp_delta')::bigint) x FROM coin_transactions
       WHERE type = 'XP' AND created_at >= :cutoff GROUP BY 1),
b AS (
  SELECT u.id, u.level, u.wallet_balance coin_now, u.gems gem_now, u.xp xp_now,
         COALESCE(c0.b, 0) coin0,
         GREATEST(u.gems - COALESCE(gr.g, 0) + COALESCE(gc.g, 0), 0) gem0,
         GREATEST(u.xp - COALESCE(xp.x, 0), 0) xp0
  FROM users u JOIN ids USING (id)
  LEFT JOIN c0 ON c0.user_id = u.id LEFT JOIN gr ON gr.user_id = u.id
  LEFT JOIN gc ON gc.user_id = u.id LEFT JOIN xp ON xp.user_id = u.id),
t AS (
  SELECT b.*,
    LEAST(coin_now, (coin0 + GREATEST(coin_now - coin0, 0) * 0.25)::bigint) coin_new,
    LEAST(gem_now,  (gem0  + GREATEST(gem_now  - gem0,  0) * 0.20)::bigint) gem_new,
    LEAST(xp_now,   (xp0   + GREATEST(xp_now   - xp0,   0) * 0.30)::bigint) xp_new
  FROM b)
SELECT t.*, COALESCE((SELECT max(level) FROM levels l WHERE l.min_xp <= t.xp_new AND l.max_xp >= t.xp_new), t.level) level_new
FROM t;

-- lock the rows, then apply
SELECT id FROM users WHERE id IN (SELECT id FROM fix_plan) ORDER BY id FOR UPDATE;

CREATE TEMP TABLE applied (user_id bigint, kind text) ON COMMIT DROP;
-- coins
WITH i AS (
INSERT INTO coin_transactions (user_id, type, title, coin_amount, balance_after, reference_id, meta)
SELECT p.id, 'ADMIN_ADJUST', 'Correction: lucky gift rebate setting error', p.coin_new - u.wallet_balance, p.coin_new,
       'fix_rebate_20261116_coin_' || p.id, jsonb_build_object('currency', 'coins', 'source', 'rebate_fix')
FROM fix_plan p JOIN users u ON u.id = p.id
WHERE p.coin_new < u.wallet_balance
ON CONFLICT (user_id, reference_id) DO NOTHING RETURNING user_id) INSERT INTO applied SELECT user_id, 'coin' FROM i;
-- gems (no coin movement; gem change recorded in meta)
WITH i AS (
INSERT INTO coin_transactions (user_id, type, title, coin_amount, reference_id, meta)
SELECT p.id, 'ADMIN_ADJUST', 'Correction: gems after lucky gift rebate setting error', 0,
       'fix_rebate_20261116_gem_' || p.id,
       jsonb_build_object('currency', 'gems', 'source', 'rebate_fix', 'gems_delta', p.gem_new - u.gems, 'gems_after', p.gem_new)
FROM fix_plan p JOIN users u ON u.id = p.id
WHERE p.gem_new < u.gems
ON CONFLICT (user_id, reference_id) DO NOTHING RETURNING user_id) INSERT INTO applied SELECT user_id, 'gem' FROM i;
-- xp / level
WITH i AS (
INSERT INTO coin_transactions (user_id, type, title, coin_amount, reference_id, meta)
SELECT p.id, 'ADMIN_ADJUST', 'Correction: XP after lucky gift rebate setting error', 0,
       'fix_rebate_20261116_xp_' || p.id,
       jsonb_build_object('currency', 'xp', 'source', 'rebate_fix', 'xp_delta', p.xp_new - u.xp, 'xp_after', p.xp_new, 'level_before', u.level, 'level_after', p.level_new)
FROM fix_plan p JOIN users u ON u.id = p.id
WHERE p.xp_new < u.xp
ON CONFLICT (user_id, reference_id) DO NOTHING RETURNING user_id) INSERT INTO applied SELECT user_id, 'xp' FROM i;

-- only touch a field when its ledger row was written in THIS run (so a re-run changes nothing)
UPDATE users u SET
  wallet_balance = CASE WHEN EXISTS (SELECT 1 FROM applied a WHERE a.user_id = u.id AND a.kind = 'coin') THEN p.coin_new ELSE u.wallet_balance END,
  gems = CASE WHEN EXISTS (SELECT 1 FROM applied a WHERE a.user_id = u.id AND a.kind = 'gem') THEN p.gem_new ELSE u.gems END,
  xp = CASE WHEN EXISTS (SELECT 1 FROM applied a WHERE a.user_id = u.id AND a.kind = 'xp') THEN p.xp_new ELSE u.xp END,
  exp = CASE WHEN EXISTS (SELECT 1 FROM applied a WHERE a.user_id = u.id AND a.kind = 'xp') THEN p.xp_new ELSE u.exp END,
  level = CASE WHEN EXISTS (SELECT 1 FROM applied a WHERE a.user_id = u.id AND a.kind = 'xp') THEN p.level_new ELSE u.level END
FROM fix_plan p WHERE u.id = p.id;

\echo '--- result (M = million) ---'
SELECT p.id, p.level lvl_before, u.level lvl_after,
  round(p.coin_now/1e6,1) coin_before_M, round(u.wallet_balance/1e6,1) coin_after_M,
  round(p.gem_now/1e6,1) gem_before_M, round(u.gems/1e6,1) gem_after_M,
  round(p.xp_now/1e6,1) xp_before_M, round(u.xp/1e6,1) xp_after_M
FROM fix_plan p JOIN users u ON u.id = p.id ORDER BY p.coin_now + p.gem_now DESC;
SELECT count(*) users_changed, round(sum(p.coin_now - u.wallet_balance)/1e6) coin_removed_M, round(sum(p.gem_now - u.gems)/1e6) gem_removed_M
FROM fix_plan p JOIN users u ON u.id = p.id;

\if :apply
COMMIT;
\echo 'APPLIED'
\else
ROLLBACK;
\echo 'DRY RUN: rolled back, nothing changed'
\endif

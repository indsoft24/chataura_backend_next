-- Read-only audit of user identity data. Safe to run on production (SELECT only).
--   psql "$DATABASE_URL" -f scripts/audit-user-identity.sql
-- Run once before and once after deploying migration 20261010130000_user_display_id_required.

\echo '1) Numbers that are one user''s internal id AND another user''s public display_id'
\echo '   (before the strict lookup, GET /users/<n> could open either person)'
SELECT a.id AS internal_id_owner, b.id AS display_id_owner, b.display_id
FROM users a
JOIN users b ON b.display_id = a.id::text AND b.id <> a.id
ORDER BY a.id;

\echo '2) Users without a display_id (must be 0 after the migration)'
SELECT count(*) AS missing_display_id FROM users WHERE display_id IS NULL OR btrim(display_id) = '';

\echo '3) Malformed display_ids (expected exactly 7 digits)'
SELECT id, display_id FROM users WHERE display_id !~ '^[0-9]{7}$' ORDER BY id LIMIT 100;

\echo '4) Room members whose stored agora_uid is not their account id (old rows)'
SELECT room_id, user_id, agora_uid, is_active
FROM room_members
WHERE agora_uid IS NOT NULL AND agora_uid::bigint <> (user_id % 2147483647)
ORDER BY is_active DESC, room_id
LIMIT 200;

\echo '5) Account ids beyond the Agora uid range (would wrap and collide)'
SELECT count(*) AS ids_over_int32 FROM users WHERE id >= 2147483647;

\echo '6) Seats held by users who are not active members of that room'
SELECT s.room_id, s.seat_index, s.user_id
FROM seats s
LEFT JOIN room_members m ON m.room_id = s.room_id AND m.user_id = s.user_id AND m.is_active
WHERE s.user_id IS NOT NULL AND m.user_id IS NULL
LIMIT 200;

\echo '7) Users shown online but not seen recently (should be 0 once the sweep runs)'
SELECT count(*) AS stale_online
FROM users
WHERE is_online AND (last_seen_at IS NULL OR last_seen_at < now() - interval '150 seconds');

\echo '8) Same user active in more than one room at once'
SELECT user_id, count(*) AS active_rooms
FROM room_members WHERE is_active
GROUP BY user_id HAVING count(*) > 1
ORDER BY active_rooms DESC LIMIT 100;

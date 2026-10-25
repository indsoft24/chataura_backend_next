-- Turns a fresh copy of the production database into the test database. Run ONLY against the
-- staging database (chataura_stg_postgres / chataura_staging). Keeps catalog data (gifts, frames,
-- levels, settings) and the test accounts; removes everyone else.
--
-- Staging shares Firebase with production (one Firebase project), and Firebase paths are keyed
-- by room UUID and conversation id. So every copied room and conversation is deleted, and new
-- conversation ids start far above production's: nothing written on staging can reach a real
-- user's room or chat. Real users' push tokens go with their accounts.
\set ON_ERROR_STOP on
BEGIN;

CREATE TEMP TABLE keep_users AS
  SELECT id FROM users
  WHERE email ILIKE 'bibhude%' OR lower(email) = 'indsoft24@gmail.com';

DELETE FROM conversations;
DELETE FROM rooms;
DELETE FROM users WHERE id NOT IN (SELECT id FROM keep_users);

SELECT setval(pg_get_serial_sequence('conversations', 'id'), 1000000000, false);

COMMIT;

SELECT id, display_id, email, role FROM users ORDER BY id;

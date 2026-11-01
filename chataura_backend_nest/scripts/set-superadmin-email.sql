-- Moves the single superadmin account to chataura05@gmail.com (password and everything else stay).
-- Run once, on purpose:  docker exec -i chataura_postgres psql -U chataura_user -d chataura_db -v ON_ERROR_STOP=1 < set-superadmin-email.sql
-- Stops (no change) if the new address already belongs to another account or there is not exactly one superadmin.
BEGIN;
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM users WHERE role = 'admin' AND lower(staff_badge_type) = 'superadmin';
  IF n <> 1 THEN RAISE EXCEPTION 'expected exactly 1 superadmin, found %', n; END IF;
  IF EXISTS (SELECT 1 FROM users WHERE lower(email) = 'chataura05@gmail.com' AND NOT (role = 'admin' AND lower(staff_badge_type) = 'superadmin')) THEN
    RAISE EXCEPTION 'chataura05@gmail.com already belongs to another account';
  END IF;
END $$;
UPDATE users SET email = 'chataura05@gmail.com', email_verified_at = COALESCE(email_verified_at, now())
WHERE role = 'admin' AND lower(staff_badge_type) = 'superadmin';
-- Old sessions and remembered browsers of that account must start over.
DELETE FROM panel_trusted_devices WHERE user_id IN (SELECT id FROM users WHERE role = 'admin' AND lower(staff_badge_type) = 'superadmin');
SELECT id, email, role, staff_badge_type FROM users WHERE role = 'admin' AND lower(staff_badge_type) = 'superadmin';
COMMIT;

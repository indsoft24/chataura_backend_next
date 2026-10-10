-- Every user gets a public 7-digit display_id; the column becomes required.
-- New ids never equal anyone's display_id OR internal account id, so one number can't mean two people.
DO $$
DECLARE
    r RECORD;
    new_id VARCHAR(32);
BEGIN
    FOR r IN SELECT id FROM users WHERE display_id IS NULL OR btrim(display_id) = '' ORDER BY id ASC LOOP
        LOOP
            new_id := (1000000 + floor(random() * 9000000))::bigint::VARCHAR;
            IF NOT EXISTS (SELECT 1 FROM users WHERE display_id = new_id)
               AND NOT EXISTS (SELECT 1 FROM users WHERE id = new_id::bigint) THEN
                UPDATE users SET display_id = new_id WHERE id = r.id;
                EXIT;
            END IF;
        END LOOP;
    END LOOP;
END $$;

ALTER TABLE "users" ALTER COLUMN "display_id" SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "users_display_id_key" ON "users"("display_id");

-- Add display_id column to users table for unique public User ID (7-digit default)
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "display_id" VARCHAR(32);

-- Populate unique 7-digit display_id for any existing users without collisions
DO $$
DECLARE
    r RECORD;
    new_id VARCHAR(32);
    collision BOOLEAN;
BEGIN
    FOR r IN SELECT id FROM users WHERE display_id IS NULL ORDER BY id ASC LOOP
        LOOP
            new_id := (1000000 + floor(random() * 9000000))::VARCHAR;
            SELECT EXISTS(SELECT 1 FROM users WHERE display_id = new_id) INTO collision;
            IF NOT collision THEN
                UPDATE users SET display_id = new_id WHERE id = r.id;
                EXIT;
            END IF;
        END LOOP;
    END LOOP;
END $$;

-- Create unique index on users(display_id)
CREATE UNIQUE INDEX IF NOT EXISTS "users_display_id_key" ON "users"("display_id");

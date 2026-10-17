-- Profile country stores full names (e.g. "Bangladesh"), which overflowed VARCHAR(8).
ALTER TABLE "users" ALTER COLUMN "country" TYPE VARCHAR(64);

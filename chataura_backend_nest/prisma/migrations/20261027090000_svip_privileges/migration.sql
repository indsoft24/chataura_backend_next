-- SVIP privileges: SVIP-only gifts and emoji, custom profile background, profile visitor records.

ALTER TABLE "gifts" ADD COLUMN "required_svip_level" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "stickers" ADD COLUMN "required_svip_level" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "user_svips" ADD COLUMN "profile_bg_url" TEXT;

-- One row per (profile, viewer); a revisit within 24 h only refreshes the time.
CREATE TABLE "user_visits" (
    "target_id" BIGINT NOT NULL,
    "viewer_id" BIGINT NOT NULL,
    "visit_count" INTEGER NOT NULL DEFAULT 1,
    "last_visited_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_visits_pkey" PRIMARY KEY ("target_id", "viewer_id")
);
CREATE INDEX "user_visits_target_id_last_visited_at_idx" ON "user_visits"("target_id", "last_visited_at");
ALTER TABLE "user_visits" ADD CONSTRAINT "user_visits_target_id_fkey"
    FOREIGN KEY ("target_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_visits" ADD CONSTRAINT "user_visits_viewer_id_fkey"
    FOREIGN KEY ("viewer_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

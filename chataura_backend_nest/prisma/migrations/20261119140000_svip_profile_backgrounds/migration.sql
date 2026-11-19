-- SVIP profile background slider: up to 5 pictures per member (first one also stays in profile_bg_url for older apps).
ALTER TABLE "user_svips" ADD COLUMN "profile_bg_urls" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
UPDATE "user_svips" SET "profile_bg_urls" = ARRAY["profile_bg_url"] WHERE "profile_bg_url" IS NOT NULL AND "profile_bg_url" <> '';

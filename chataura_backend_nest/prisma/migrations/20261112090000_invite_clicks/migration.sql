-- Direct-APK invite downloads (code is claimed by the new install through the clipboard, or by IP as a fallback).
CREATE TABLE "invite_clicks" (
    "id" BIGSERIAL NOT NULL,
    "code" VARCHAR(32) NOT NULL,
    "ip" VARCHAR(64) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "matched_at" TIMESTAMPTZ(6),

    CONSTRAINT "invite_clicks_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "invite_clicks_ip_created_at_idx" ON "invite_clicks"("ip", "created_at");

-- FX asset catalog (CP / rocket / rank) with stable asset_key → public GCS URL.
CREATE TABLE "app_fx_assets" (
    "id" BIGSERIAL NOT NULL,
    "asset_key" VARCHAR(128) NOT NULL,
    "category" VARCHAR(32) NOT NULL,
    "media_type" VARCHAR(16) NOT NULL,
    "object_path" VARCHAR(512) NOT NULL,
    "url" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "bytes" INTEGER,
    "checksum" VARCHAR(64),
    "android_usage" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "app_fx_assets_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "app_fx_assets_asset_key_key" ON "app_fx_assets"("asset_key");
CREATE INDEX "app_fx_assets_is_active_category_idx" ON "app_fx_assets"("is_active", "category");

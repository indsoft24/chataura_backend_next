-- CreateEnum
CREATE TYPE "MediaKind" AS ENUM ('post', 'reel');

-- CreateEnum
CREATE TYPE "AgencyAffiliationStatus" AS ENUM ('pending', 'accepted', 'rejected', 'left');

-- CreateEnum
CREATE TYPE "AgencyWeeklyStatus" AS ENUM ('pending', 'approved', 'rejected', 'paid');

-- CreateTable
CREATE TABLE "media_items" (
    "id" BIGSERIAL NOT NULL,
    "user_id" BIGINT NOT NULL,
    "kind" "MediaKind" NOT NULL,
    "media_type" VARCHAR(16) NOT NULL,
    "file_url" TEXT NOT NULL,
    "thumbnail_url" TEXT,
    "caption" TEXT,
    "music_url" TEXT,
    "effect_name" VARCHAR(128),
    "duration" INTEGER,
    "aspect_ratio" VARCHAR(16),
    "is_camera_recorded" BOOLEAN NOT NULL DEFAULT false,
    "likes_count" INTEGER NOT NULL DEFAULT 0,
    "comments_count" INTEGER NOT NULL DEFAULT 0,
    "shares_count" INTEGER NOT NULL DEFAULT 0,
    "views_count" INTEGER NOT NULL DEFAULT 0,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(6) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "media_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "media_comments" (
    "id" BIGSERIAL NOT NULL,
    "media_id" BIGINT NOT NULL,
    "user_id" BIGINT NOT NULL,
    "comment" TEXT NOT NULL,
    "created_at" TIMESTAMP(6) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "media_comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "media_likes" (
    "id" BIGSERIAL NOT NULL,
    "media_id" BIGINT NOT NULL,
    "user_id" BIGINT NOT NULL,
    "created_at" TIMESTAMP(6) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "media_likes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "media_saves" (
    "id" BIGSERIAL NOT NULL,
    "media_id" BIGINT NOT NULL,
    "user_id" BIGINT NOT NULL,
    "created_at" TIMESTAMP(6) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "media_saves_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "music_tracks" (
    "id" BIGSERIAL NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "artist" VARCHAR(255),
    "file_url" TEXT NOT NULL,
    "is_trending" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(6) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "music_tracks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "banners" (
    "id" BIGSERIAL NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "subtitle" VARCHAR(255),
    "category" VARCHAR(32) NOT NULL DEFAULT 'event',
    "badge_text" VARCHAR(64),
    "image_url" TEXT,
    "bg_color_start" VARCHAR(16),
    "bg_color_end" VARCHAR(16),
    "button_text" VARCHAR(64),
    "action_type" VARCHAR(32),
    "action_target" TEXT,
    "details_content" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(6) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "banners_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "faq_items" (
    "id" BIGSERIAL NOT NULL,
    "question" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(6) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "faq_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feedback" (
    "id" BIGSERIAL NOT NULL,
    "user_id" BIGINT,
    "message" TEXT NOT NULL,
    "created_at" TIMESTAMP(6) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "feedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agency_affiliations" (
    "id" BIGSERIAL NOT NULL,
    "agency_user_id" BIGINT NOT NULL,
    "room_owner_id" BIGINT NOT NULL,
    "room_id" UUID,
    "status" "AgencyAffiliationStatus" NOT NULL DEFAULT 'pending',
    "joined_at" TIMESTAMP(6) WITH TIME ZONE,
    "left_at" TIMESTAMP(6) WITH TIME ZONE,
    "cooldown_until" TIMESTAMP(6) WITH TIME ZONE,
    "created_at" TIMESTAMP(6) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agency_affiliations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agency_weekly_distributions" (
    "id" BIGSERIAL NOT NULL,
    "period_id" BIGINT NOT NULL,
    "week_start" DATE NOT NULL,
    "week_end" DATE NOT NULL,
    "agency_user_id" BIGINT NOT NULL,
    "room_owner_id" BIGINT NOT NULL,
    "suggested_gems" INTEGER NOT NULL DEFAULT 0,
    "approved_gems" INTEGER,
    "status" "AgencyWeeklyStatus" NOT NULL DEFAULT 'pending',
    "notes" TEXT,
    "paid_at" TIMESTAMP(6) WITH TIME ZONE,
    "created_at" TIMESTAMP(6) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agency_weekly_distributions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "media_items_kind_created_at_idx" ON "media_items"("kind", "created_at");
CREATE INDEX "media_items_user_id_kind_idx" ON "media_items"("user_id", "kind");
CREATE INDEX "media_comments_media_id_created_at_idx" ON "media_comments"("media_id", "created_at");
CREATE UNIQUE INDEX "media_likes_media_id_user_id_key" ON "media_likes"("media_id", "user_id");
CREATE UNIQUE INDEX "media_saves_media_id_user_id_key" ON "media_saves"("media_id", "user_id");
CREATE INDEX "banners_is_active_sort_order_idx" ON "banners"("is_active", "sort_order");
CREATE INDEX "agency_affiliations_agency_user_id_status_idx" ON "agency_affiliations"("agency_user_id", "status");
CREATE INDEX "agency_affiliations_room_owner_id_status_idx" ON "agency_affiliations"("room_owner_id", "status");
CREATE UNIQUE INDEX "agency_weekly_distributions_period_id_agency_user_id_room_owner_id_key" ON "agency_weekly_distributions"("period_id", "agency_user_id", "room_owner_id");
CREATE INDEX "agency_weekly_distributions_agency_user_id_period_id_idx" ON "agency_weekly_distributions"("agency_user_id", "period_id");

-- AddForeignKey
ALTER TABLE "media_items" ADD CONSTRAINT "media_items_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "media_comments" ADD CONSTRAINT "media_comments_media_id_fkey" FOREIGN KEY ("media_id") REFERENCES "media_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "media_comments" ADD CONSTRAINT "media_comments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "media_likes" ADD CONSTRAINT "media_likes_media_id_fkey" FOREIGN KEY ("media_id") REFERENCES "media_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "media_likes" ADD CONSTRAINT "media_likes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "media_saves" ADD CONSTRAINT "media_saves_media_id_fkey" FOREIGN KEY ("media_id") REFERENCES "media_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "media_saves" ADD CONSTRAINT "media_saves_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "agency_affiliations" ADD CONSTRAINT "agency_affiliations_agency_user_id_fkey" FOREIGN KEY ("agency_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "agency_affiliations" ADD CONSTRAINT "agency_affiliations_room_owner_id_fkey" FOREIGN KEY ("room_owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "agency_affiliations" ADD CONSTRAINT "agency_affiliations_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "agency_weekly_distributions" ADD CONSTRAINT "agency_weekly_distributions_room_owner_id_fkey" FOREIGN KEY ("room_owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

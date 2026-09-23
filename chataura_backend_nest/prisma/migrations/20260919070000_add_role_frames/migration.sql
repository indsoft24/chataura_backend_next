-- AlterTable
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "selected_role_frame_id" BIGINT;

-- CreateTable
CREATE TABLE IF NOT EXISTS "role_frames" (
    "id" BIGSERIAL NOT NULL,
    "role_key" VARCHAR(32) NOT NULL,
    "slug" VARCHAR(120),
    "motion_type" VARCHAR(32),
    "label" VARCHAR(100) NOT NULL,
    "animation_url" TEXT,
    "animation_url_lite" TEXT,
    "preview_url" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "extra_role_keys" JSONB,
    "approval_status" VARCHAR(32) NOT NULL DEFAULT 'approved',
    "created_by_staff_id" BIGINT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "role_frames_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "role_frames_slug_key" ON "role_frames"("slug");
CREATE INDEX IF NOT EXISTS "role_frames_role_key_idx" ON "role_frames"("role_key");
CREATE INDEX IF NOT EXISTS "role_frames_motion_type_idx" ON "role_frames"("motion_type");
CREATE INDEX IF NOT EXISTS "role_frames_approval_status_idx" ON "role_frames"("approval_status");

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "users" ADD CONSTRAINT "users_selected_role_frame_id_fkey"
    FOREIGN KEY ("selected_role_frame_id") REFERENCES "role_frames"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

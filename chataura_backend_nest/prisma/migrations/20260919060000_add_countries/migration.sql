-- CreateTable
CREATE TABLE IF NOT EXISTS "countries" (
    "id" VARCHAR(10) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "flag_emoji" VARCHAR(10),
    "flag_url" TEXT,
    "approval_status" VARCHAR(32) NOT NULL DEFAULT 'approved',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "countries_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "banned_devices" (
    "device_id" VARCHAR(128) NOT NULL,
    "reason" TEXT,
    "banned_by" BIGINT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "banned_devices_pkey" PRIMARY KEY ("device_id")
);

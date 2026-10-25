-- SVIP core: level catalogue, memberships, monthly gift points.

CREATE TABLE "svip_level_configs" (
    "level" INTEGER NOT NULL,
    "name" VARCHAR(64) NOT NULL,
    "purchase_price" BIGINT NOT NULL,
    "monthly_reward" BIGINT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "svip_level_configs_pkey" PRIMARY KEY ("level")
);

CREATE TABLE "user_svips" (
    "user_id" BIGINT NOT NULL,
    "level" INTEGER NOT NULL,
    "status" VARCHAR(16) NOT NULL DEFAULT 'active',
    "period_starts_at" TIMESTAMPTZ(6) NOT NULL,
    "period_ends_at" TIMESTAMPTZ(6) NOT NULL,
    "last_charge_attempt_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "user_svips_pkey" PRIMARY KEY ("user_id")
);

CREATE INDEX "user_svips_status_period_ends_at_idx" ON "user_svips"("status", "period_ends_at");

ALTER TABLE "user_svips" ADD CONSTRAINT "user_svips_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "svip_monthly_points" (
    "user_id" BIGINT NOT NULL,
    "month" VARCHAR(7) NOT NULL,
    "points" BIGINT NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "svip_monthly_points_pkey" PRIMARY KEY ("user_id", "month")
);

ALTER TABLE "svip_monthly_points" ADD CONSTRAINT "svip_monthly_points_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Default ladder from the reference app. Only SVIP 1 has assets, so only it is on sale.
INSERT INTO "svip_level_configs" ("level", "name", "purchase_price", "monthly_reward", "is_active", "updated_at") VALUES
    (1, 'SVIP 1', 6000000, 300000, true, CURRENT_TIMESTAMP),
    (2, 'SVIP 2', 18000000, 1080000, false, CURRENT_TIMESTAMP),
    (3, 'SVIP 3', 45000000, 4200000, false, CURRENT_TIMESTAMP),
    (4, 'SVIP 4', 90000000, 12000000, false, CURRENT_TIMESTAMP),
    (5, 'SVIP 5', 180000000, 27000000, false, CURRENT_TIMESTAMP),
    (6, 'SVIP 6', 350000000, 60000000, false, CURRENT_TIMESTAMP),
    (7, 'SVIP 7', 600000000, 102000000, false, CURRENT_TIMESTAMP),
    (8, 'SVIP 8', 900000000, 162000000, false, CURRENT_TIMESTAMP),
    (9, 'SVIP 9', 1500000000, 270000000, false, CURRENT_TIMESTAMP)
ON CONFLICT ("level") DO NOTHING;

-- CreateEnum
CREATE TYPE "PurchaseStatus" AS ENUM ('pending', 'success', 'failed');

-- CreateEnum
CREATE TYPE "PaymentSource" AS ENUM ('RAZORPAY', 'EARNINGS_WALLET', 'MOCK');

-- CreateEnum
CREATE TYPE "WithdrawalStatus" AS ENUM ('pending', 'approved', 'rejected', 'completed', 'cancelled');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "selected_entry_bar_id" BIGINT,
ADD COLUMN     "total_earned_coins" BIGINT NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "coin_packages" (
    "id" BIGSERIAL NOT NULL,
    "audience" VARCHAR(32) NOT NULL DEFAULT 'user',
    "coins" INTEGER NOT NULL,
    "currency" VARCHAR(8) NOT NULL DEFAULT 'INR',
    "price" DECIMAL(12,2) NOT NULL,
    "original_price" DECIMAL(12,2),
    "base_price_inr" DECIMAL(12,2),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "coin_packages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coin_purchase_transactions" (
    "id" BIGSERIAL NOT NULL,
    "user_id" BIGINT NOT NULL,
    "package_id" BIGINT,
    "razorpay_order_id" VARCHAR(64),
    "razorpay_payment_id" VARCHAR(64),
    "razorpay_signature" VARCHAR(255),
    "amount_minor" INTEGER NOT NULL,
    "currency" VARCHAR(8) NOT NULL,
    "coins_credited" INTEGER NOT NULL,
    "status" "PurchaseStatus" NOT NULL DEFAULT 'pending',
    "payment_source" "PaymentSource" NOT NULL DEFAULT 'RAZORPAY',
    "country" VARCHAR(8),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "coin_purchase_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coin_transactions" (
    "id" BIGSERIAL NOT NULL,
    "user_id" BIGINT NOT NULL,
    "type" VARCHAR(64) NOT NULL,
    "title" VARCHAR(255),
    "coin_amount" BIGINT NOT NULL,
    "net_amount" BIGINT,
    "commission_amount" BIGINT,
    "balance_after" BIGINT,
    "reference_id" VARCHAR(128),
    "status" VARCHAR(32) NOT NULL DEFAULT 'success',
    "meta" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "coin_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gem_conversions" (
    "id" BIGSERIAL NOT NULL,
    "user_id" BIGINT NOT NULL,
    "gems_debited" BIGINT NOT NULL,
    "currency" VARCHAR(16) NOT NULL,
    "coins_credited" BIGINT NOT NULL DEFAULT 0,
    "gems_balance_after" BIGINT NOT NULL,
    "wallet_balance_after" BIGINT,
    "gems_per_coin" DECIMAL(12,4) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gem_conversions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "withdrawal_requests" (
    "id" BIGSERIAL NOT NULL,
    "user_id" BIGINT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" VARCHAR(8) NOT NULL,
    "withdrawal_source" VARCHAR(32) NOT NULL,
    "status" "WithdrawalStatus" NOT NULL DEFAULT 'pending',
    "note" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "withdrawal_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_settings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "gems_per_coin" DECIMAL(12,4) NOT NULL DEFAULT 10,
    "min_gems_convert_to_coins" INTEGER NOT NULL DEFAULT 10,
    "coin_to_xp_ratio" DECIMAL(12,4) NOT NULL DEFAULT 0.1,
    "gift_commission_pct" DECIMAL(8,2) NOT NULL DEFAULT 20,
    "earnings_purchase_enabled" BOOLEAN NOT NULL DEFAULT true,
    "cashout_enabled" BOOLEAN NOT NULL DEFAULT false,
    "audio_call_price_per_min" INTEGER NOT NULL DEFAULT 20,
    "video_call_price_per_min" INTEGER NOT NULL DEFAULT 40,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "admin_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "levels" (
    "id" SERIAL NOT NULL,
    "level" INTEGER NOT NULL,
    "min_xp" INTEGER NOT NULL,
    "max_xp" INTEGER NOT NULL,
    "label" VARCHAR(64),
    "badge_url" TEXT,
    "icon_url" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "levels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "frames" (
    "id" BIGSERIAL NOT NULL,
    "name" VARCHAR(128) NOT NULL,
    "slug" VARCHAR(128),
    "category" VARCHAR(64),
    "level_required" INTEGER NOT NULL DEFAULT 1,
    "coin_cost" INTEGER,
    "is_premium" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "image_url" TEXT,
    "animation_key" VARCHAR(128),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "frames_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_unlocked_frames" (
    "id" BIGSERIAL NOT NULL,
    "user_id" BIGINT NOT NULL,
    "frame_id" BIGINT NOT NULL,
    "coins_paid" INTEGER NOT NULL DEFAULT 0,
    "unlocked_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(6),

    CONSTRAINT "user_unlocked_frames_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "entry_bars" (
    "id" BIGSERIAL NOT NULL,
    "name" VARCHAR(128) NOT NULL,
    "level_required" INTEGER NOT NULL DEFAULT 1,
    "image_url" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "entry_bars_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gifts" (
    "id" BIGSERIAL NOT NULL,
    "name" VARCHAR(128) NOT NULL,
    "coin_cost" INTEGER NOT NULL,
    "image_url" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gifts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "coin_packages_is_active_audience_idx" ON "coin_packages"("is_active", "audience");

-- CreateIndex
CREATE UNIQUE INDEX "coin_purchase_transactions_razorpay_order_id_key" ON "coin_purchase_transactions"("razorpay_order_id");

-- CreateIndex
CREATE UNIQUE INDEX "coin_purchase_transactions_razorpay_payment_id_key" ON "coin_purchase_transactions"("razorpay_payment_id");

-- CreateIndex
CREATE INDEX "coin_purchase_transactions_user_id_created_at_idx" ON "coin_purchase_transactions"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "coin_purchase_transactions_status_idx" ON "coin_purchase_transactions"("status");

-- CreateIndex
CREATE INDEX "coin_transactions_user_id_created_at_idx" ON "coin_transactions"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "coin_transactions_reference_id_idx" ON "coin_transactions"("reference_id");

-- CreateIndex
CREATE INDEX "gem_conversions_user_id_created_at_idx" ON "gem_conversions"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "withdrawal_requests_user_id_created_at_idx" ON "withdrawal_requests"("user_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "levels_level_key" ON "levels"("level");

-- CreateIndex
CREATE UNIQUE INDEX "frames_slug_key" ON "frames"("slug");

-- CreateIndex
CREATE INDEX "frames_is_active_level_required_idx" ON "frames"("is_active", "level_required");

-- CreateIndex
CREATE UNIQUE INDEX "user_unlocked_frames_user_id_frame_id_key" ON "user_unlocked_frames"("user_id", "frame_id");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_selected_frame_id_fkey" FOREIGN KEY ("selected_frame_id") REFERENCES "frames"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_selected_entry_bar_id_fkey" FOREIGN KEY ("selected_entry_bar_id") REFERENCES "entry_bars"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coin_purchase_transactions" ADD CONSTRAINT "coin_purchase_transactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coin_purchase_transactions" ADD CONSTRAINT "coin_purchase_transactions_package_id_fkey" FOREIGN KEY ("package_id") REFERENCES "coin_packages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coin_transactions" ADD CONSTRAINT "coin_transactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gem_conversions" ADD CONSTRAINT "gem_conversions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "withdrawal_requests" ADD CONSTRAINT "withdrawal_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_unlocked_frames" ADD CONSTRAINT "user_unlocked_frames_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_unlocked_frames" ADD CONSTRAINT "user_unlocked_frames_frame_id_fkey" FOREIGN KEY ("frame_id") REFERENCES "frames"("id") ON DELETE CASCADE ON UPDATE CASCADE;

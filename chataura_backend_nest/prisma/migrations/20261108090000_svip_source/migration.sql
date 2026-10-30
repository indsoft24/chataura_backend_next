-- How a membership started (recharge | admin | seller | promo). Existing rows keep today's behaviour ('recharge').
ALTER TABLE "user_svips" ADD COLUMN "source" VARCHAR(12) NOT NULL DEFAULT 'recharge';

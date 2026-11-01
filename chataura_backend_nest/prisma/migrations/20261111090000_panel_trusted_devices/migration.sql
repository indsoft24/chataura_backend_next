-- Admin panel email-code sign-in: browsers trusted for 30 days after a successful code.
CREATE TABLE "panel_trusted_devices" (
    "id" BIGSERIAL NOT NULL,
    "user_id" BIGINT NOT NULL,
    "token_hash" VARCHAR(64) NOT NULL,
    "user_agent" VARCHAR(255),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "last_used_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "panel_trusted_devices_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "panel_trusted_devices_token_hash_key" ON "panel_trusted_devices"("token_hash");
CREATE INDEX "panel_trusted_devices_user_id_idx" ON "panel_trusted_devices"("user_id");

ALTER TABLE "panel_trusted_devices" ADD CONSTRAINT "panel_trusted_devices_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

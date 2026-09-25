-- Host-appointed room staff admins (separate from co-host / rocket admins).
CREATE TABLE "room_staff_admins" (
    "id" BIGSERIAL NOT NULL,
    "room_id" UUID NOT NULL,
    "user_id" BIGINT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "room_staff_admins_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "room_staff_admins_room_id_user_id_key" ON "room_staff_admins"("room_id", "user_id");
CREATE INDEX "room_staff_admins_room_id_idx" ON "room_staff_admins"("room_id");

ALTER TABLE "room_staff_admins" ADD CONSTRAINT "room_staff_admins_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "room_staff_admins" ADD CONSTRAINT "room_staff_admins_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

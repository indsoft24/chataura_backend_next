CREATE TABLE "room_rocket_admins" (
    "id" BIGSERIAL NOT NULL,
    "room_id" UUID NOT NULL,
    "user_id" BIGINT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "room_rocket_admins_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "room_rocket_admins_room_id_user_id_key" ON "room_rocket_admins"("room_id", "user_id");

ALTER TABLE "room_rocket_admins" ADD CONSTRAINT "room_rocket_admins_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "room_rocket_admins" ADD CONSTRAINT "room_rocket_admins_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "rocket_launches" (
    "id" UUID NOT NULL,
    "room_id" UUID NOT NULL,
    "launcher_id" BIGINT NOT NULL,
    "price" INTEGER NOT NULL,
    "coin_pool" INTEGER NOT NULL,
    "joined_count" INTEGER NOT NULL,
    "winner_count" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "rocket_launches_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "rocket_launches_room_id_created_at_idx" ON "rocket_launches"("room_id", "created_at");

ALTER TABLE "rocket_launches" ADD CONSTRAINT "rocket_launches_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "rocket_launches" ADD CONSTRAINT "rocket_launches_launcher_id_fkey" FOREIGN KEY ("launcher_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "rocket_rewards" (
    "id" BIGSERIAL NOT NULL,
    "launch_id" UUID NOT NULL,
    "user_id" BIGINT NOT NULL,
    "coins" INTEGER NOT NULL,
    "xp" INTEGER NOT NULL,
    "frame_id" BIGINT,
    "frame_name" VARCHAR(128),
    "frame_days" INTEGER,
    CONSTRAINT "rocket_rewards_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "rocket_rewards_launch_id_idx" ON "rocket_rewards"("launch_id");

ALTER TABLE "rocket_rewards" ADD CONSTRAINT "rocket_rewards_launch_id_fkey" FOREIGN KEY ("launch_id") REFERENCES "rocket_launches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "rocket_rewards" ADD CONSTRAINT "rocket_rewards_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

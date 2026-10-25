-- Medals: catalogue + ownership (up to 3 worn on the profile). Seeds the SVIP 1 medal.

CREATE TABLE "medals" (
    "id" BIGSERIAL NOT NULL,
    "slug" VARCHAR(64) NOT NULL,
    "name" VARCHAR(64) NOT NULL,
    "description" TEXT,
    "image_url" TEXT NOT NULL,
    "svip_level" INTEGER NOT NULL DEFAULT 0,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "medals_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "medals_slug_key" ON "medals"("slug");

CREATE TABLE "user_medals" (
    "id" BIGSERIAL NOT NULL,
    "user_id" BIGINT NOT NULL,
    "medal_id" BIGINT NOT NULL,
    "expires_at" TIMESTAMPTZ(6),
    "worn_slot" INTEGER,
    "source" VARCHAR(16) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_medals_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "user_medals_user_id_medal_id_key" ON "user_medals"("user_id", "medal_id");
CREATE INDEX "user_medals_user_id_worn_slot_idx" ON "user_medals"("user_id", "worn_slot");
ALTER TABLE "user_medals" ADD CONSTRAINT "user_medals_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_medals" ADD CONSTRAINT "user_medals_medal_id_fkey"
    FOREIGN KEY ("medal_id") REFERENCES "medals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "medals" ("slug", "name", "description", "image_url", "svip_level", "sort_order")
VALUES ('svip1_medal', 'SVIP 1', 'Worn by SVIP 1 members.', 'https://chataura.in/svip/svip1_medal.png?v=1', 1, 10)
ON CONFLICT ("slug") DO NOTHING;

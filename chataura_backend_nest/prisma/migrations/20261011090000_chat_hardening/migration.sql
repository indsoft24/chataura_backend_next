-- Chat hardening: per-member "delete chat", group roles, idempotent sends.

ALTER TABLE "conversation_participants" ADD COLUMN IF NOT EXISTS "cleared_at" TIMESTAMPTZ(6);
ALTER TABLE "conversation_participants" ADD COLUMN IF NOT EXISTS "role" VARCHAR(16) NOT NULL DEFAULT 'member';

-- Existing groups: the earliest member (the implicit owner until now) becomes the explicit owner.
UPDATE "conversation_participants" cp
SET "role" = 'owner'
FROM (
    SELECT DISTINCT ON (p."conversation_id") p."id"
    FROM "conversation_participants" p
    JOIN "conversations" c ON c."id" = p."conversation_id"
    WHERE c."type" = 'group'
    ORDER BY p."conversation_id", p."id" ASC
) first_member
WHERE cp."id" = first_member."id";

-- Duplicate retried sends: keep the first message per (sender, client_uuid); later copies lose the
-- uuid (messages are kept, only de-linked) so the unique index can be created.
UPDATE "messages" m
SET "client_uuid" = NULL
FROM (
    SELECT "id", ROW_NUMBER() OVER (PARTITION BY "sender_id", "client_uuid" ORDER BY "id") AS rn
    FROM "messages"
    WHERE "client_uuid" IS NOT NULL
) d
WHERE m."id" = d."id" AND d.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS "messages_sender_id_client_uuid_key" ON "messages"("sender_id", "client_uuid");

-- CP / BCP: one partner per user, formed by cumulative gifting, paid break.

ALTER TABLE "relationship_types"
  ADD COLUMN "formation_threshold_coins" BIGINT NOT NULL DEFAULT 0;

ALTER TABLE "user_relationships"
  ADD COLUMN "progress_coins" BIGINT NOT NULL DEFAULT 0;

CREATE TABLE "relationship_cleanup_audit" (
  "id" BIGSERIAL NOT NULL,
  "relationship_id" UUID NOT NULL,
  "type_code" VARCHAR(32) NOT NULL,
  "user_low_id" BIGINT NOT NULL,
  "user_high_id" BIGINT NOT NULL,
  "old_status" VARCHAR(16) NOT NULL,
  "old_total_score" BIGINT NOT NULL,
  "old_level" INTEGER,
  "reason" VARCHAR(64) NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "relationship_cleanup_audit_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "relationship_cleanup_audit_relationship_id_idx"
  ON "relationship_cleanup_audit"("relationship_id");

UPDATE "relationship_types"
SET "max_partners" = 1,
    "formation_threshold_coins" = 2000000,
    "formation_cost_coins" = 0,
    "unbind_cost_coins" = 3000000,
    "requires_accept" = false,
    "formation_rule" = 'gift_threshold',
    "visual" = jsonb_set(
      COALESCE("visual", '{}'::jsonb),
      '{rules}',
      to_jsonb(
        'How to become ' || "name" || E'?\n'
        || '1. Send ' || "name" || E' gifts to each other. Gifts in both directions add up.\n'
        || '2. When the total reaches 2,000,000 coins you become ' || "name" || E' automatically.\n'
        || '3. Each user can have only one ' || "name" || E' at a time.\n\n'
        || 'How to improve ' || "name" || E' level?\n'
        || '1. Keep sending ' || "name" || E' gifts: 1 coin = 1 intimacy point.\n'
        || CASE WHEN "code" = 'bcp'
             THEN E'2. On mic together in the same room, every 5 minutes = 120 Exp (maximum 12000 Exp per day).\n'
             ELSE '' END
        || E'\nHow to remove ' || "name" || E'?\n'
        || '1. On the ' || "name" || E' page, tap Remove and confirm.\n'
        || E'2. Removing costs 3,000,000 coins.\n'
        || '3. After removing, level and progress are reset; you need to gift 2,000,000 again to re-form.'
      )
    ),
    "updated_at" = CURRENT_TIMESTAMP
WHERE "code" IN ('cp', 'bcp');

-- Keep each user's highest-scoring pair per type; end the rest.
DO $$
DECLARE
  r RECORD;
BEGIN
  DROP TABLE IF EXISTS _rel_kept_users;
  CREATE TEMP TABLE _rel_kept_users (
    type_id UUID NOT NULL,
    user_id BIGINT NOT NULL,
    PRIMARY KEY (type_id, user_id)
  );

  FOR r IN
    SELECT ur.id, ur.relationship_type_id, ur.user_low_id, ur.user_high_id,
           ur.status, ur.total_score, ur.level, t.code
    FROM "user_relationships" ur
    JOIN "relationship_types" t ON t.id = ur.relationship_type_id
    WHERE t.code IN ('cp', 'bcp')
      AND ur.status IN ('active', 'pending')
    ORDER BY (ur.status = 'active') DESC, ur.total_score DESC, ur.created_at ASC, ur.id ASC
    FOR UPDATE OF ur
  LOOP
    IF EXISTS (
      SELECT 1 FROM _rel_kept_users k
      WHERE k.type_id = r.relationship_type_id
        AND k.user_id IN (r.user_low_id, r.user_high_id)
    ) THEN
      INSERT INTO "relationship_cleanup_audit"
        ("relationship_id", "type_code", "user_low_id", "user_high_id",
         "old_status", "old_total_score", "old_level", "reason")
      VALUES
        (r.id, r.code, r.user_low_id, r.user_high_id,
         r.status, r.total_score, r.level, 'one_partner_limit');

      UPDATE "user_relationships"
      SET "status" = 'ended', "total_score" = 0, "level" = NULL,
          "progress_coins" = 0, "updated_at" = CURRENT_TIMESTAMP
      WHERE "id" = r.id;
    ELSE
      INSERT INTO _rel_kept_users VALUES
        (r.relationship_type_id, r.user_low_id),
        (r.relationship_type_id, r.user_high_id);
    END IF;
  END LOOP;

  DROP TABLE _rel_kept_users;
END $$;

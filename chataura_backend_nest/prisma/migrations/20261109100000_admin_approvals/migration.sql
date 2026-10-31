-- Staff panel changes wait here for superadmin approval.
CREATE TABLE "admin_approvals" (
  "id" BIGSERIAL PRIMARY KEY,
  "requester_id" BIGINT NOT NULL,
  "method" VARCHAR(8) NOT NULL,
  "url" TEXT NOT NULL,
  "body" JSONB,
  "status" VARCHAR(16) NOT NULL DEFAULT 'pending',
  "result" TEXT,
  "decided_by_id" BIGINT,
  "decided_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "admin_approvals_status_id_idx" ON "admin_approvals"("status", "id");

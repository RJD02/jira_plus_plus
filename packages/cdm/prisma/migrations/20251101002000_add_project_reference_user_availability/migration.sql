ALTER TABLE "UserAvailability"
  ADD COLUMN "projectId" TEXT;

CREATE INDEX "UserAvailability_tenantId_projectId_idx"
  ON "UserAvailability"("tenantId", "projectId");

ALTER TABLE "UserAvailability"
  ADD CONSTRAINT "UserAvailability_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "JiraProject"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

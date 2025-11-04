CREATE TABLE "UserAvailability" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL DEFAULT 'dev',
  "jiraAccountId" TEXT NOT NULL,
  "startDate" TIMESTAMP(3) NOT NULL,
  "endDate" TIMESTAMP(3) NOT NULL,
  "type" TEXT NOT NULL DEFAULT 'leave',
  "source" TEXT NOT NULL DEFAULT 'manual',
  "reason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UserAvailability_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "UserAvailability_tenantId_jiraAccountId_startDate_endDate_idx"
  ON "UserAvailability"("tenantId", "jiraAccountId", "startDate", "endDate");

ALTER TABLE "UserAvailability"
  ADD CONSTRAINT "UserAvailability_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

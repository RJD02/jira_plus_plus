CREATE TABLE "ProjectSummarySchedule" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL DEFAULT 'dev',
  "projectId" TEXT NOT NULL,
  "frequencyMinutes" INTEGER NOT NULL DEFAULT 180,
  "enabled" BOOLEAN NOT NULL DEFAULT TRUE,
  "nextRunAt" TIMESTAMP(3),
  "lastRunAt" TIMESTAMP(3),
  "lockedUntil" TIMESTAMP(3),
  "lastError" TEXT,
  "lastErrorAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProjectSummarySchedule_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProjectSummarySchedule_projectId_key"
  ON "ProjectSummarySchedule"("projectId");

CREATE UNIQUE INDEX "ProjectSummarySchedule_tenantId_projectId_key"
  ON "ProjectSummarySchedule"("tenantId", "projectId");

CREATE INDEX "ProjectSummarySchedule_tenantId_idx"
  ON "ProjectSummarySchedule"("tenantId");

ALTER TABLE "ProjectSummarySchedule"
  ADD CONSTRAINT "ProjectSummarySchedule_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProjectSummarySchedule"
  ADD CONSTRAINT "ProjectSummarySchedule_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "JiraProject"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

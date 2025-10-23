-- AlterTable
ALTER TABLE "Issue"
  ADD COLUMN "assigneeChangedAt" TIMESTAMP(3),
  ADD COLUMN "browseUrl" TEXT,
  ADD COLUMN "dueDate" TIMESTAMP(3),
  ADD COLUMN "parentIssueId" TEXT,
  ADD COLUMN "reporterId" TEXT,
  ADD COLUMN "resolvedAt" TIMESTAMP(3),
  ADD COLUMN "startedAt" TIMESTAMP(3),
  ADD COLUMN "statusCategory" TEXT;

-- CreateTable
CREATE TABLE "IssueLink" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'dev',
    "sourceIssueId" TEXT NOT NULL,
    "targetIssueId" TEXT NOT NULL,
    "linkType" TEXT NOT NULL,
    "direction" TEXT,
    "url" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "IssueLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Issue_tenantId_parentIssueId_idx" ON "Issue"("tenantId", "parentIssueId");
CREATE INDEX "Issue_tenantId_reporterId_idx" ON "Issue"("tenantId", "reporterId");
CREATE INDEX "Issue_tenantId_dueDate_idx" ON "Issue"("tenantId", "dueDate");
CREATE INDEX "IssueLink_tenantId_sourceIssueId_idx" ON "IssueLink"("tenantId", "sourceIssueId");
CREATE INDEX "IssueLink_tenantId_targetIssueId_idx" ON "IssueLink"("tenantId", "targetIssueId");

-- AddForeignKey
ALTER TABLE "Issue" ADD CONSTRAINT "Issue_parentIssueId_fkey" FOREIGN KEY ("parentIssueId") REFERENCES "Issue"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Issue" ADD CONSTRAINT "Issue_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "JiraUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "IssueLink" ADD CONSTRAINT "IssueLink_sourceIssueId_fkey" FOREIGN KEY ("sourceIssueId") REFERENCES "Issue"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "IssueLink" ADD CONSTRAINT "IssueLink_targetIssueId_fkey" FOREIGN KEY ("targetIssueId") REFERENCES "Issue"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "IssueLink" ADD CONSTRAINT "IssueLink_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

/*
  Warnings:

  - You are about to drop the `DocChunk` table. If the table is not empty, all the data it contains will be lost.
  - Made the column `needsNarrativeRefresh` on table `ProjectSummarySnapshot` required. This step will fail if there are existing NULL values in that column.
  - Made the column `narrativeRefreshAttempts` on table `ProjectSummarySnapshot` required. This step will fail if there are existing NULL values in that column.
  - Made the column `needsNarrativeRefresh` on table `UserSummarySnapshot` required. This step will fail if there are existing NULL values in that column.
  - Made the column `narrativeRefreshAttempts` on table `UserSummarySnapshot` required. This step will fail if there are existing NULL values in that column.

*/
-- DropForeignKey
ALTER TABLE "DocChunk" DROP CONSTRAINT "DocChunk_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "IssueInsight" DROP CONSTRAINT "IssueInsight_issueId_fkey";

-- DropForeignKey
ALTER TABLE "IssueInsight" DROP CONSTRAINT "IssueInsight_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "IssueInsightSnapshot" DROP CONSTRAINT "IssueInsightSnapshot_issueId_fkey";

-- DropForeignKey
ALTER TABLE "IssueInsightSnapshot" DROP CONSTRAINT "IssueInsightSnapshot_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "IssueLink" DROP CONSTRAINT "IssueLink_sourceIssueId_fkey";

-- DropForeignKey
ALTER TABLE "IssueLink" DROP CONSTRAINT "IssueLink_targetIssueId_fkey";

-- DropForeignKey
ALTER TABLE "IssueLink" DROP CONSTRAINT "IssueLink_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "JiraAssignableUser" DROP CONSTRAINT "JiraAssignableUser_siteId_fkey";

-- DropForeignKey
ALTER TABLE "LlmSkillTrace" DROP CONSTRAINT "LlmSkillTrace_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "ProjectSummarySchedule" DROP CONSTRAINT "ProjectSummarySchedule_projectId_fkey";

-- DropForeignKey
ALTER TABLE "ProjectSummarySchedule" DROP CONSTRAINT "ProjectSummarySchedule_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "ProjectSummarySnapshot" DROP CONSTRAINT "ProjectSummarySnapshot_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "TaskSummarySnapshot" DROP CONSTRAINT "TaskSummarySnapshot_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "UserAvailability" DROP CONSTRAINT "UserAvailability_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "UserSummarySnapshot" DROP CONSTRAINT "UserSummarySnapshot_tenantId_fkey";

-- DropIndex
DROP INDEX "Comment_jiraId_key";

-- DropIndex
DROP INDEX "Issue_jiraId_key";

-- DropIndex
DROP INDEX "JiraAssignableUser_siteId_projectKey_accountId_key";

-- DropIndex
DROP INDEX "JiraProject_siteId_jiraId_key";

-- DropIndex
DROP INDEX "JiraProject_siteId_key_key";

-- DropIndex
DROP INDEX "JiraSite_alias_key";

-- DropIndex
DROP INDEX "JiraSite_baseUrl_key";

-- DropIndex
DROP INDEX "JiraUser_accountId_key";

-- DropIndex
DROP INDEX "PerformanceReviewNote_projectId_trackedUserId_managerId_sta_key";

-- DropIndex
DROP INDEX "ProjectTrackedUser_projectId_jiraAccountId_key";

-- DropIndex
DROP INDEX "Sprint_jiraId_key";

-- DropIndex
DROP INDEX "SyncJob_scheduleId_key";

-- DropIndex
DROP INDEX "SyncJob_workflowId_key";

-- DropIndex
DROP INDEX "SyncState_projectId_entity_key";

-- DropIndex
DROP INDEX "User_email_key";

-- DropIndex
DROP INDEX "UserProjectLink_userId_projectId_key";

-- DropIndex
DROP INDEX "Worklog_jiraId_key";

-- AlterTable
ALTER TABLE "IssueLink" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "ProjectSummarySchedule" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "ProjectSummarySnapshot" ALTER COLUMN "narrativeGeneratedAt" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "needsNarrativeRefresh" SET NOT NULL,
ALTER COLUMN "narrativeRefreshRequestedAt" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "narrativeRefreshLockedUntil" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "narrativeRefreshAttempts" SET NOT NULL;

-- AlterTable
ALTER TABLE "Tenant" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "UserAvailability" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "UserSummarySnapshot" ALTER COLUMN "narrativeGeneratedAt" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "needsNarrativeRefresh" SET NOT NULL,
ALTER COLUMN "narrativeRefreshRequestedAt" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "narrativeRefreshLockedUntil" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "narrativeRefreshAttempts" SET NOT NULL;

-- DropTable
DROP TABLE "DocChunk";

-- CreateTable
CREATE TABLE "ReportDefinition" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'dev',
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "type" TEXT NOT NULL DEFAULT 'QUERY',
    "personaTags" TEXT[],
    "currentVersionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReportDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReportVersion" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'dev',
    "definitionId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "queryTemplate" TEXT,
    "defaultFilters" JSONB,
    "notes" TEXT,
    "createdBy" TEXT,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReportVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReportRun" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'dev',
    "definitionId" TEXT NOT NULL,
    "reportVersionId" TEXT NOT NULL,
    "executedBy" TEXT,
    "executedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "durationMs" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'COMPLETED',
    "cacheHit" BOOLEAN NOT NULL DEFAULT false,
    "filterHash" TEXT,
    "filtersUsed" JSONB,
    "payload" JSONB,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReportRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReportDefinition_tenantId_idx" ON "ReportDefinition"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "ReportDefinition_tenantId_slug_key" ON "ReportDefinition"("tenantId", "slug");

-- CreateIndex
CREATE INDEX "ReportVersion_tenantId_definitionId_idx" ON "ReportVersion"("tenantId", "definitionId");

-- CreateIndex
CREATE INDEX "ReportVersion_tenantId_status_idx" ON "ReportVersion"("tenantId", "status");

-- CreateIndex
CREATE INDEX "ReportRun_tenantId_definitionId_idx" ON "ReportRun"("tenantId", "definitionId");

-- CreateIndex
CREATE INDEX "ReportRun_tenantId_reportVersionId_executedAt_idx" ON "ReportRun"("tenantId", "reportVersionId", "executedAt");

-- AddForeignKey
ALTER TABLE "ProjectSummarySchedule" ADD CONSTRAINT "ProjectSummarySchedule_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectSummarySchedule" ADD CONSTRAINT "ProjectSummarySchedule_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "JiraProject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JiraAssignableUser" ADD CONSTRAINT "JiraAssignableUser_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "JiraSite"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserAvailability" ADD CONSTRAINT "UserAvailability_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IssueLink" ADD CONSTRAINT "IssueLink_sourceIssueId_fkey" FOREIGN KEY ("sourceIssueId") REFERENCES "Issue"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IssueLink" ADD CONSTRAINT "IssueLink_targetIssueId_fkey" FOREIGN KEY ("targetIssueId") REFERENCES "Issue"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IssueLink" ADD CONSTRAINT "IssueLink_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IssueInsight" ADD CONSTRAINT "IssueInsight_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "Issue"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IssueInsight" ADD CONSTRAINT "IssueInsight_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IssueInsightSnapshot" ADD CONSTRAINT "IssueInsightSnapshot_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "Issue"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IssueInsightSnapshot" ADD CONSTRAINT "IssueInsightSnapshot_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LlmSkillTrace" ADD CONSTRAINT "LlmSkillTrace_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskSummarySnapshot" ADD CONSTRAINT "TaskSummarySnapshot_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserSummarySnapshot" ADD CONSTRAINT "UserSummarySnapshot_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectSummarySnapshot" ADD CONSTRAINT "ProjectSummarySnapshot_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportDefinition" ADD CONSTRAINT "ReportDefinition_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportVersion" ADD CONSTRAINT "ReportVersion_definitionId_fkey" FOREIGN KEY ("definitionId") REFERENCES "ReportDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportVersion" ADD CONSTRAINT "ReportVersion_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportRun" ADD CONSTRAINT "ReportRun_definitionId_fkey" FOREIGN KEY ("definitionId") REFERENCES "ReportDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportRun" ADD CONSTRAINT "ReportRun_reportVersionId_fkey" FOREIGN KEY ("reportVersionId") REFERENCES "ReportVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportRun" ADD CONSTRAINT "ReportRun_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "Issue_tenantId_needsInsightRefresh_insightRefreshLockedUntil_id" RENAME TO "Issue_tenantId_needsInsightRefresh_insightRefreshLockedUnti_idx";

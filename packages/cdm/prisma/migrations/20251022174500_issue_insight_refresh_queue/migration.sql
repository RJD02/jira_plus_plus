-- AlterTable
ALTER TABLE "Issue"
  ADD COLUMN "needsInsightRefresh" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "insightRefreshRequestedAt" TIMESTAMP(3),
  ADD COLUMN "insightRefreshAttempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "insightRefreshLockedUntil" TIMESTAMP(3),
  ADD COLUMN "insightRefreshedAt" TIMESTAMP(3),
  ADD COLUMN "lastInsightError" TEXT;

-- CreateIndex
CREATE INDEX "Issue_tenantId_needsInsightRefresh_insightRefreshLockedUntil_idx"
  ON "Issue"("tenantId", "needsInsightRefresh", "insightRefreshLockedUntil");

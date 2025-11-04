ALTER TABLE "UserSummarySnapshot"
  ADD COLUMN "narrative" TEXT,
  ADD COLUMN "narrativeHash" TEXT,
  ADD COLUMN "narrativeGeneratedAt" TIMESTAMP;

ALTER TABLE "ProjectSummarySnapshot"
  ADD COLUMN "narrative" TEXT,
  ADD COLUMN "narrativeHash" TEXT,
  ADD COLUMN "narrativeGeneratedAt" TIMESTAMP;

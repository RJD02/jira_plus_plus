ALTER TABLE "UserSummarySnapshot"
  ADD COLUMN "richNarratives" JSONB,
  ADD COLUMN "needsNarrativeRefresh" BOOLEAN DEFAULT TRUE,
  ADD COLUMN "narrativeRefreshRequestedAt" TIMESTAMP,
  ADD COLUMN "narrativeRefreshLockedUntil" TIMESTAMP,
  ADD COLUMN "narrativeRefreshAttempts" INTEGER DEFAULT 0,
  ADD COLUMN "lastNarrativeError" TEXT;

ALTER TABLE "ProjectSummarySnapshot"
  ADD COLUMN "richNarratives" JSONB,
  ADD COLUMN "needsNarrativeRefresh" BOOLEAN DEFAULT TRUE,
  ADD COLUMN "narrativeRefreshRequestedAt" TIMESTAMP,
  ADD COLUMN "narrativeRefreshLockedUntil" TIMESTAMP,
  ADD COLUMN "narrativeRefreshAttempts" INTEGER DEFAULT 0,
  ADD COLUMN "lastNarrativeError" TEXT;

ALTER TABLE "MetadataEndpoint"
  ADD COLUMN "detectedVersion" TEXT,
  ADD COLUMN "versionHint" TEXT,
  ADD COLUMN "capabilities" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

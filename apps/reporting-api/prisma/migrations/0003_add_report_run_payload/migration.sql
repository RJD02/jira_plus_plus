ALTER TABLE reporting."ReportRun"
  ADD COLUMN IF NOT EXISTS payload JSONB;

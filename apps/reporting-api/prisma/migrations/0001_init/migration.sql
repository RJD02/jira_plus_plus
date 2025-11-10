-- Create reporting schema and required extensions
CREATE SCHEMA IF NOT EXISTS reporting;
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Report definitions and versions
DROP TABLE IF EXISTS reporting.report_run CASCADE;
DROP TABLE IF EXISTS reporting.dashboard_tile CASCADE;
DROP TABLE IF EXISTS reporting.dashboard_version CASCADE;
DROP TABLE IF EXISTS reporting.report_dashboard CASCADE;
DROP TABLE IF EXISTS reporting.report_version CASCADE;
DROP TABLE IF EXISTS reporting.report_definition CASCADE;

CREATE TABLE IF NOT EXISTS reporting."ReportDefinition" (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "tenantId" TEXT NOT NULL DEFAULT 'dev',
    slug TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    type TEXT NOT NULL DEFAULT 'QUERY',
    "personaTags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "scopePolicy" JSONB,
    "filterSchema" JSONB,
    "visualisationConfig" JSONB,
    "currentVersionId" UUID UNIQUE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS report_definition_slug_unique
  ON reporting."ReportDefinition" (slug);
CREATE INDEX IF NOT EXISTS report_definition_tenant_slug_idx
  ON reporting."ReportDefinition" ("tenantId", slug);

CREATE TABLE IF NOT EXISTS reporting."ReportVersion" (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "definitionId" UUID NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'dev',
    status TEXT NOT NULL,
    "queryTemplate" TEXT,
    "defaultFilters" JSONB,
    notes TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedAt" TIMESTAMP(3)
);

CREATE INDEX IF NOT EXISTS report_version_tenant_status_idx
  ON reporting."ReportVersion" ("tenantId", status);

ALTER TABLE reporting."ReportVersion"
  ADD CONSTRAINT report_version_definition_fk
  FOREIGN KEY ("definitionId")
  REFERENCES reporting."ReportDefinition"(id)
  ON DELETE CASCADE;

ALTER TABLE reporting."ReportDefinition"
  ADD CONSTRAINT report_definition_current_version_fk
  FOREIGN KEY ("currentVersionId")
  REFERENCES reporting."ReportVersion"(id)
  ON DELETE SET NULL;

-- Dashboards and tiles
CREATE TABLE IF NOT EXISTS reporting."ReportDashboard" (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "tenantId" TEXT NOT NULL DEFAULT 'dev',
    slug TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    "personaTags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "currentVersionId" UUID UNIQUE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS report_dashboard_slug_unique
  ON reporting."ReportDashboard" (slug);
CREATE INDEX IF NOT EXISTS report_dashboard_tenant_slug_idx
  ON reporting."ReportDashboard" ("tenantId", slug);

CREATE TABLE IF NOT EXISTS reporting."DashboardVersion" (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "dashboardId" UUID NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'dev',
    status TEXT NOT NULL,
    layout JSONB NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS dashboard_version_tenant_status_idx
  ON reporting."DashboardVersion" ("tenantId", status);

ALTER TABLE reporting."DashboardVersion"
  ADD CONSTRAINT dashboard_version_dashboard_fk
  FOREIGN KEY ("dashboardId")
  REFERENCES reporting."ReportDashboard"(id)
  ON DELETE CASCADE;

ALTER TABLE reporting."ReportDashboard"
  ADD CONSTRAINT report_dashboard_current_version_fk
  FOREIGN KEY ("currentVersionId")
  REFERENCES reporting."DashboardVersion"(id)
  ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS reporting."DashboardTile" (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "dashboardVersionId" UUID NOT NULL,
    "reportDefinitionId" UUID NOT NULL,
    "reportVersionId" UUID,
    "tenantId" TEXT NOT NULL DEFAULT 'dev',
    position JSONB,
    size JSONB,
    "tileOverrides" JSONB
);

CREATE INDEX IF NOT EXISTS dashboard_tile_tenant_idx
  ON reporting."DashboardTile" ("tenantId");

ALTER TABLE reporting."DashboardTile"
  ADD CONSTRAINT dashboard_tile_dashboard_version_fk
  FOREIGN KEY ("dashboardVersionId")
  REFERENCES reporting."DashboardVersion"(id)
  ON DELETE CASCADE;

ALTER TABLE reporting."DashboardTile"
  ADD CONSTRAINT dashboard_tile_report_definition_fk
  FOREIGN KEY ("reportDefinitionId")
  REFERENCES reporting."ReportDefinition"(id)
  ON DELETE CASCADE;

ALTER TABLE reporting."DashboardTile"
  ADD CONSTRAINT dashboard_tile_report_version_fk
  FOREIGN KEY ("reportVersionId")
  REFERENCES reporting."ReportVersion"(id)
  ON DELETE SET NULL;

-- Report runs
CREATE TABLE IF NOT EXISTS reporting."ReportRun" (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "reportVersionId" UUID NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'dev',
    "executedBy" TEXT,
    "executedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "durationMs" INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL,
    "cacheHit" BOOLEAN NOT NULL DEFAULT FALSE,
    "filterHash" TEXT,
    "filtersUsed" JSONB,
    error TEXT,
    "workflowId" TEXT,
    "temporalRunId" TEXT
);

CREATE INDEX IF NOT EXISTS report_run_version_executed_idx
  ON reporting."ReportRun" ("reportVersionId", "executedAt");
CREATE INDEX IF NOT EXISTS report_run_tenant_executed_idx
  ON reporting."ReportRun" ("tenantId", "executedAt");
CREATE INDEX IF NOT EXISTS report_run_workflow_idx
  ON reporting."ReportRun" ("workflowId");

ALTER TABLE reporting."ReportRun"
  ADD CONSTRAINT report_run_report_version_fk
  FOREIGN KEY ("reportVersionId")
  REFERENCES reporting."ReportVersion"(id)
  ON DELETE CASCADE;

-- Trigger to update updated_at timestamps
CREATE OR REPLACE FUNCTION reporting.touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER report_definition_touch_updated
BEFORE UPDATE ON reporting."ReportDefinition"
FOR EACH ROW EXECUTE FUNCTION reporting.touch_updated_at();

CREATE TRIGGER report_dashboard_touch_updated
BEFORE UPDATE ON reporting."ReportDashboard"
FOR EACH ROW EXECUTE FUNCTION reporting.touch_updated_at();

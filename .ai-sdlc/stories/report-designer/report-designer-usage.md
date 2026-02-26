# Report Designer — Usage Guide

## Current Status

The Report Designer is currently a **read-only report viewer**. It displays pre-seeded report definitions and their run results. There is no UI or API for creating, editing, or running reports through the application — reports must be seeded directly into the database.

The original Report Designer was a standalone SPA (`apps/reporting-designer/`) with a dedicated API, Temporal workflows, and an AI agent designer. It was removed in commit `c2e34cb0` (2026-01-14). What exists now is a simplified, integrated restoration that supports viewing reports only.

---

## How to Use the Report Viewer

### Accessing Reports

1. **Via Admin Console**: Navigate to Admin Console → scroll to the "Reporting" section → click **"Open designer"** (navigates to `/reports`)
2. **Via Navigation**: Click **"Reports"** in the top navigation bar (visible to ADMIN and MANAGER roles only)

### Viewing Reports

1. The Reports page shows all report definitions as cards
2. Click a card to expand and view:
   - Report metadata (name, description, type, persona tags)
   - Version history
   - Run count
   - The latest completed run's data displayed as a table
3. Click the same card again to collapse it

### Report Data Structure

Each report has:
- **Definition**: Name, slug, description, type (`QUERY`), persona tags
- **Versions**: Draft or Published status, version notes
- **Runs**: Execution history with status, duration, and payload (table data)

The payload format is:
```json
{
  "table": {
    "columns": ["Column1", "Column2", ...],
    "rows": [
      ["value1", "value2", ...],
      ...
    ]
  }
}
```

---

## How to Create Your Own Reports

Since there is no create/edit UI or API, reports are created via **direct database inserts**.

### Prerequisites

- Access to the PostgreSQL database (`jira_plus_plus`)
- The tenant ID (default: `dev`)

### Step 1: Create a Report Definition

```sql
INSERT INTO "ReportDefinition" (id, "tenantId", slug, name, description, type, "personaTags", "createdAt", "updatedAt")
VALUES (
  gen_random_uuid(),
  'dev',
  'my-custom-report',           -- unique slug per tenant
  'My Custom Report',           -- display name
  'Description of the report.', -- optional
  'QUERY',                      -- type (currently only QUERY is used)
  ARRAY['engineering'],         -- persona tags for categorization
  NOW(),
  NOW()
);
```

### Step 2: Create a Published Version

```sql
INSERT INTO "ReportVersion" (id, "tenantId", "definitionId", status, notes, "publishedAt", "createdAt", "updatedAt")
VALUES (
  gen_random_uuid(),
  'dev',
  '<definition-id-from-step-1>',
  'PUBLISHED',                  -- must be PUBLISHED to appear as "Published" badge
  'Initial version',            -- optional notes
  NOW(),
  NOW(),
  NOW()
);
```

### Step 3: Create a Run with Data

```sql
INSERT INTO "ReportRun" (id, "tenantId", "definitionId", "reportVersionId", "executedAt", "durationMs", status, "cacheHit", payload, "createdAt")
VALUES (
  gen_random_uuid(),
  'dev',
  '<definition-id>',
  '<version-id-from-step-2>',
  NOW(),
  500,                          -- execution duration in ms
  'COMPLETED',                  -- must be COMPLETED for data to show
  false,
  '{
    "table": {
      "columns": ["Project", "Open Issues", "Closed Issues", "Completion %"],
      "rows": [
        ["Project Alpha", "12", "48", "80%"],
        ["Project Beta", "25", "30", "55%"],
        ["Project Gamma", "3", "97", "97%"]
      ]
    }
  }'::jsonb,
  NOW()
);
```

### Quick Script: Create a Full Report in One Go

```sql
DO $$
DECLARE
  def_id UUID := gen_random_uuid();
  ver_id UUID := gen_random_uuid();
BEGIN
  INSERT INTO "ReportDefinition" (id, "tenantId", slug, name, description, type, "personaTags", "createdAt", "updatedAt")
  VALUES (def_id, 'dev', 'your-slug', 'Your Report Name', 'Description here', 'QUERY', ARRAY['your-tag'], NOW(), NOW());

  INSERT INTO "ReportVersion" (id, "tenantId", "definitionId", status, notes, "publishedAt", "createdAt", "updatedAt")
  VALUES (ver_id, 'dev', def_id, 'PUBLISHED', 'v1', NOW(), NOW(), NOW());

  INSERT INTO "ReportRun" (id, "tenantId", "definitionId", "reportVersionId", "executedAt", "durationMs", status, "cacheHit", payload, "createdAt")
  VALUES (gen_random_uuid(), 'dev', def_id, ver_id, NOW(), 100, 'COMPLETED', false,
    '{"table": {"columns": ["Col1", "Col2"], "rows": [["a", "b"], ["c", "d"]]}}'::jsonb, NOW());
END $$;
```

Run via:
```bash
docker exec jira_postgres psql -U postgres -d jira_plus_plus -c "<sql>"
```

---

## What's Missing (Future Work)

The following features from the original Report Designer have **not** been restored:

| Feature | Original Implementation | Current Status |
|---|---|---|
| Create/edit report definitions | Standalone designer SPA with form UI | Not available — DB inserts only |
| Run reports on demand | Temporal workflow execution | Not available — manual data inserts |
| Query template editor | SQL/GraphQL template editor with variables | Not available |
| Report scheduling | Temporal cron schedules | Not available |
| AI agent designer | LLM-powered report generation | Not available |
| Export (PDF/CSV) | Built into designer SPA | Not available |
| Draft → Publish workflow | UI-driven version management | Not available — set status directly in SQL |

### To restore full report creation capability, the recommended path is:

1. **Add GraphQL mutations**: `createReportDefinition`, `updateReportDefinition`, `publishReportVersion`, `runReport`
2. **Add a create/edit form** to ReportsPage (name, description, tags, query template)
3. **Add a "Run" button** that executes the query template against project data and stores the result as a new `ReportRun`
4. **Optionally**: Re-integrate Temporal for scheduled/background report execution

---

## GraphQL API Reference

### Queries (read-only, currently available)

```graphql
# List all report definitions
query ReportingDefinitions {
  reportingDefinitions {
    id, slug, name, type, personaTags
    currentVersion { id, status, publishedAt }
  }
}

# Get full report detail with runs and payload
query ReportDefinition($id: ID!) {
  reportDefinition(id: $id) {
    id, slug, name, description, type, personaTags
    versions { id, status, notes, publishedAt, createdAt }
    runs { id, status, executedAt, durationMs, payload, error }
  }
}

# List report runs with optional filters
query ReportingRuns($filter: ReportingRunFilterInput) {
  reportingRuns(filter: $filter) {
    id, reportVersionId, status, executedAt, durationMs, error
  }
}
```

### Authorization

- **Reports page** (`/reports`): Requires ADMIN or MANAGER role (frontend route guard)
- **GraphQL queries**: Require ADMIN or MANAGER role (backend `requireAdminOrManager`)
- **Admin Console reporting section**: Requires ADMIN role (part of admin console)

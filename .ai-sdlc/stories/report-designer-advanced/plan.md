# Plan — Full Report Designer: Create/Run/Schedule/Share KPI Reports + Chat Creation

**Approved approach**: Approach A (Fully Integrated)
**Plan confidence**: 65%

## Objectives

- Enable ADMIN/MANAGER to create, edit, version, run, schedule, and share KPI reports
- Support JQL-based data fetching + server-side aggregation for KPI computation
- Provide chat-based report creation using existing LLM infrastructure
- Email delivery of report results on schedule
- Full audit trail for all report lifecycle events
- Automated tests covering UI E2E and API contracts

## Scope

**In**: Report CRUD, config model, KPI library, on-demand execution, Temporal scheduling, email delivery, chat-to-report, audit logging, Playwright + API tests

**Out**: PDF/CSV export, Slack/Teams delivery, drag-and-drop builder, arbitrary SQL editor

---

## Milestones

### M1 — Schema: Add ReportSchedule + ReportDelivery + extend ReportVersion config
**Files**: `packages/cdm/prisma/schema.prisma`, new migration
**Changes**:
- Add `ReportSchedule` model:
  - `id`, `tenantId`, `definitionId`, `versionId`, `cron`, `timezone`, `enabled`
  - `recipients` (String[]), `filtersOverride` (Json?)
  - `lastRunAt`, `nextRunAt`, `lastError`, `lastErrorAt`, `lockedUntil`
  - Indexes on `(tenantId, enabled, nextRunAt)` for scheduler polling
- Add `ReportDelivery` model:
  - `id`, `tenantId`, `scheduleId`, `runId`, `recipients` (String[])
  - `status` (SENT/FAILED), `providerResponse`, `sentAt`, `error`
- Add `config` field (Json?) to `ReportVersion` for structured report configuration
- Run `prisma migrate dev` + `prisma generate`
**Verify**: Migration applies, `pnpm typecheck` passes
**Rollback**: Revert migration

### M2 — Backend: Report CRUD mutations + config validation
**Files**: `apps/api/src/typeDefs.ts`, `apps/api/src/resolvers.ts`
**Changes**:
- Add GraphQL mutations:
  - `createReportDefinition(input)` → returns ReportDefinition
  - `updateReportDefinition(input)` → returns ReportDefinition
  - `deleteReportDefinition(id)` → Boolean
  - `createReportVersion(input)` → returns ReportVersion (DRAFT with config)
  - `updateReportVersion(input)` → update config/notes (DRAFT only)
  - `publishReportVersion(id)` → set status=PUBLISHED, set `currentVersionId`
- Add input types: `CreateReportDefinitionInput`, `UpdateReportDefinitionInput`, `CreateReportVersionInput`, `UpdateReportVersionInput`
- Add `ReportConfig` type to schema:
  ```graphql
  type ReportConfig {
    kpis: [String!]!
    groupBy: [String!]!
    timeRange: ReportTimeRange!
    filters: ReportFilters
  }
  ```
- Server-side config validation: reject unknown KPIs, invalid groupBy values, bad date ranges
- All mutations enforce `requireAdminOrManager(ctx)` + tenant scoping
- All mutations create `AuditLog` entries
**Verify**: `pnpm typecheck`, API test for create/update/publish cycle
**Rollback**: Revert resolver + typeDef changes

### M3 — Backend: Report execution engine (JQL + server aggregation)
**Files**: New `apps/api/src/services/reportExecutionService.ts`
**Changes**:
- `executeReport(prisma, versionId, tenantId, executedBy?)` function:
  1. Load version config
  2. Build JQL from config filters (project, issueType, status, assignee, dateRange)
  3. Call `searchJiraIssues()` with constructed JQL (paginate to fetch all matching issues)
  4. Aggregate server-side by `groupBy` dimensions
  5. Compute KPIs:
     - `issue_count`: count per group
     - `resolved_count`: count where status category = "Done"
     - `open_count`: count where status category != "Done"
     - `in_progress_count`: count where status category = "In Progress"
     - `stuck_count`: issues not updated in X days (configurable, default 7)
     - `cycle_time_avg`: avg days from created to resolved (for resolved issues)
     - `throughput`: resolved per period (weekly/monthly bucketing)
  6. Format as `{ columns, rows }` table payload
  7. Create `ReportRun` with status COMPLETED/FAILED, payload, durationMs, error
- Add `runReport` mutation: calls `executeReport`, returns ReportRun
- Add `supportedKpis` query: returns the KPI library for the builder UI
- JQL builder utility: `buildJqlFromConfig(config, site)` → JQL string
**Verify**: API test with mock Jira data, verify table output format
**Rollback**: Remove service file + mutation

### M4 — Backend: Temporal workflow for scheduled execution + email delivery
**Files**: New `apps/api/src/temporal/workflows/reportScheduleWorkflow.ts`, new activities, `apps/api/src/temporal/worker.ts`
**Changes**:
- New workflow: `reportScheduleWorkflow`
  - Activity 1: Execute report (call `executeReport`)
  - Activity 2: Send email delivery (call `sendCommunication` with HTML table)
  - Activity 3: Record delivery status in `ReportDelivery`
- New activities: `reportActivities.ts`
  - `executeReportActivity(versionId, tenantId)`
  - `sendReportEmailActivity(runId, recipients, tenantId)`
  - `recordDeliveryActivity(scheduleId, runId, status, error?)`
- Register activities in `worker.ts`
- Add schedule mutations:
  - `createReportSchedule(input)` → creates Temporal schedule
  - `updateReportSchedule(input)` → updates schedule
  - `deleteReportSchedule(id)` → deletes Temporal schedule + DB record
  - `triggerReportSchedule(id)` → manual trigger
- Add queries:
  - `reportSchedules(definitionId)` → list schedules for a report
  - `reportDeliveries(scheduleId)` → delivery history
- HTML email template for report delivery:
  - Report name, time range, execution time
  - Top 20 rows of table data
  - Link to `/reports` page
**Verify**: Create schedule via API, trigger manually, verify run + email delivery record
**Rollback**: Remove workflow + activities, revert worker registration

### M5 — Backend: Chat-to-report (LLM-based config generation)
**Files**: New `apps/api/src/services/reportChatService.ts`
**Changes**:
- `generateReportConfig(prompt, tenantId)` function:
  1. System prompt with: supported KPIs list, groupBy options, filter options, time range format
  2. User prompt: the natural language description
  3. LLM response: structured JSON report config
  4. Validate response against config schema (same validation as M2)
  5. Return: `{ config, explanation, generatedJql? }`
- Use existing `llm/runtime.ts` infrastructure (respects `NARRATIVE_PROVIDER` env var)
- Add mutation: `generateReportFromChat(input: { prompt: String! })` → `ChatReportResult`
- `ChatReportResult` type: `{ config: ReportConfig, explanation: String, jql: String }`
- If LLM returns unsupported KPIs/filters: return explanation of limitation + closest alternative
**Verify**: API test with sample prompts, verify config output
**Rollback**: Remove service + mutation

### M6 — Frontend: Report Builder UI (create/edit/configure/preview)
**Files**: Modify `apps/jira-plus-plus/src/pages/ReportsPage.tsx`, new components
**Changes**:
- **Create Report modal/form**:
  - Name, description, persona tags
  - Creates definition + draft version
- **Report Builder panel** (shown when editing a draft version):
  - KPI selector (checkboxes from supported library)
  - GroupBy selector (dropdown: assignee, project, status, priority, issueType)
  - Time range picker (relative: last 7/14/30/90 days, or custom from/to)
  - Filters: project multi-select, issue type multi-select, status multi-select
- **"Run" button**: Executes report and shows results in table view
- **"Publish" button**: Publishes the draft version
- **Version history**: List of versions with status badges
- **Schedule panel**:
  - Cron expression input (with common presets: daily, weekly, monthly)
  - Timezone selector
  - Recipients email list
  - Enable/disable toggle
- **"Create with Chat" button**:
  - Opens chat input modal
  - User types natural language description
  - Shows proposed config + explanation
  - "Accept" creates the report definition + version
- Update existing card list to include "Create Report" card/button
**Verify**: Playwright E2E test for create → configure → run → results flow
**Rollback**: Revert ReportsPage changes

### M7 — Audit logging integration
**Files**: `apps/api/src/resolvers.ts`
**Changes**:
- After each mutation (create/update/delete/publish/schedule), insert `AuditLog` entry:
  - `action`: "CREATED", "UPDATED", "PUBLISHED", "DELETED", "SCHEDULED"
  - `entityType`: "ReportDefinition", "ReportVersion", "ReportSchedule"
  - `entityId`: the affected entity
  - `changes`: JSON diff of what changed (excluding secrets)
  - `userId`: from ctx.user
**Verify**: API test verifying audit log entries after mutations
**Rollback**: Remove audit log inserts

### M8 — Automated tests
**Files**: New `tests/reports/report-designer-advanced.spec.ts`, new API test files
**Changes**:
- **Playwright E2E tests**:
  - Create report → configure KPIs/groupBy/time → run → results visible
  - Schedule creation UI saves correctly
  - Unauthorized user cannot access designer
  - Chat-to-report flow creates a report
- **API tests** (via Playwright `request` context or direct fetch):
  - Create/update/publish/run mutation cycle
  - Config validation rejects invalid KPIs
  - Unauthorized access returns UNAUTHENTICATED
  - Run produces correct payload schema
  - Audit log entries created
**Verify**: All tests pass
**Rollback**: Remove test files

### M9 — Documentation (verification.md, patch_summary.md, audit.md)
**Files**: `.ai-sdlc/stories/report-designer-advanced/*.md`
**Changes**:
- `verification.md`: Local setup instructions, test commands, expected results
- `patch_summary.md`: Files changed with high-level diffs
- `audit.md`: Plan compliance, deviations, AC status, final confidence
**Verify**: All artifacts complete

---

## AC → Tests Mapping

| AC | Test | Framework |
|---|---|---|
| AC-1 (CRUD) | `report-designer-advanced.spec.ts`: create + edit report | Playwright |
| AC-1 (CRUD) | API test: create/update/publish mutations | API (fetch) |
| AC-2 (Config) | API test: config validation rejects invalid KPIs | API |
| AC-3 (Run) | Playwright: click Run → results table visible | Playwright |
| AC-3 (Run) | API test: runReport mutation returns payload | API |
| AC-4 (KPI) | API test: run with mock Jira → correct aggregation | API |
| AC-5 (Schedule) | API test: createReportSchedule mutation | API |
| AC-5 (Schedule) | Playwright: schedule form saves | Playwright |
| AC-6 (Email) | API test: delivery record created after trigger | API |
| AC-7 (Chat) | Playwright: chat input → proposed config → accept | Playwright |
| AC-7 (Chat) | API test: generateReportFromChat returns valid config | API |
| AC-8 (Auth) | API test: unauthenticated → 401, USER role → 403 | API |
| AC-9 (Audit) | API test: audit log entries after mutations | API |
| AC-10-12 | Coverage by above | Mixed |

## Test Data & Environment

- Playwright tests will use route interception to mock GraphQL responses (same pattern as existing `admin-auth-consistency.spec.ts`)
- API tests for KPI aggregation will mock `searchJiraIssues` responses
- Email delivery tests will verify DB records (not actual email send)
- Chat tests will mock LLM responses
- Required env vars documented in `verification.md`

## Open Questions

None — all required infrastructure exists. Proceeding with best effort on LLM prompt engineering for chat-to-report.

## Estimated Impact/Risk

- **Schema migration**: LOW (additive only)
- **API surface**: MED (many new mutations, but follows existing patterns)
- **Temporal workflow**: MED (new workflow, but pattern is established)
- **Frontend**: MED (significant UI addition, but contained in ReportsPage)
- **LLM integration**: MED (new prompt, but uses existing runtime)

## Plan Confidence: 65%

Strong foundation reduces implementation risk. The -35% gap is due to:
- Large feature surface (12 ACs across backend + frontend + Temporal + LLM)
- KPI aggregation correctness needs real JQL testing
- Chat-to-report prompt engineering is iterative
- Scheduling + email delivery end-to-end is complex

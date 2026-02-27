# Acceptance Criteria — Full Report Designer: Create/Run/Schedule/Share KPI reports + Chat creation

## AC-1: Report creation & editing (UI + API)
- ADMIN/MANAGER can create a report definition with:
  - name, slug (auto or manual), description, persona tags
- A report version can be created as DRAFT, edited, and PUBLISHED.
- Published versions are clearly indicated and used as default for runs.

## AC-2: Safe report configuration model
- Report versions store a structured config (no free-form SQL required for MVP) including:
  - KPI list (from supported library)
  - groupBy dimension(s) (at least 1 supported)
  - time range (from/to OR relative like last 7/30 days)
  - filters (project(s), issueType(s), status, assignee, label/category)
- Config is validated server-side and rejected with clear errors if invalid.

## AC-3: Run report on-demand
- ADMIN/MANAGER can click "Run" on a report version.
- A new ReportRun is created with:
  - status transitions (STARTED → COMPLETED/FAILED)
  - durationMs
  - payload in table format (columns + rows)
  - error field populated on failure
- UI shows the latest completed run (and history list).

## AC-4: KPI aggregation correctness (JQL + server aggregation)
- The system supports:
  - Jira issue retrieval using JQL filters derived from report config
  - server-side aggregation when needed (grouping and computed KPIs)
- At minimum, these use-cases must work:
  1) "Open issues by assignee in last 30 days"
  2) "Closed bugs by project (weekly) for last 4 weeks"
  3) "Stuck issues (not moved in X days) by status or assignee"

## AC-5: Scheduling report runs
- ADMIN/MANAGER can create/edit/disable a schedule for a report version:
  - cron expression
  - timezone
  - optional filters override (if supported)
- Scheduled runs produce ReportRuns automatically at the scheduled time.
- Schedule execution history is visible (last N runs).

## AC-6: Email sharing (scheduled delivery)
- ADMIN/MANAGER can configure recipients for a schedule (email list).
- On scheduled execution (or scheduled delivery), the system sends an email containing:
  - report name, time window
  - short summary (counts, key KPI highlights)
  - the rendered table data (or link + top rows)
  - link back to `/reports/<id>` (or equivalent)
- Delivery is recorded with status (SENT/FAILED) and timestamp.
- Secrets are not included in emails.

## AC-7: Chat-based report creation (guided)
- The Reports page includes "Create with Chat".
- User can enter a natural-language request.
- The system responds with a proposed report config including:
  - selected KPIs
  - groupBy
  - time range
  - filters
  - generated JQL (if applicable) shown for transparency
- User can confirm → report is created as DRAFT (or directly PUBLISHED if chosen).
- If the request cannot be mapped to supported features:
  - system explains limitation and proposes a closest supported alternative.

## AC-8: Authorization & tenant isolation
- Reports, versions, runs, schedules, deliveries are tenant-scoped.
- Only ADMIN/MANAGER can access create/edit/run/schedule/share.
- Server enforces 401/403 for unauthorized access even if UI is bypassed.

## AC-9: Observability & audit
- Report run failures are recorded with actionable error messages.
- Editing report definitions/versions/schedules creates an audit record:
  - who changed what, when (but not secret values)

## AC-10: Automated tests (required)
- At least one UI E2E test (Playwright or Cypress) verifies:
  - create report → configure KPIs/group/time → run → results visible
  - schedule creation UI saves correctly (mock time or direct schedule trigger)
  - unauthorized user cannot access designer actions
- At least one API test verifies:
  - create/update/publish/run mutations
  - unauthorized access returns 401/403
  - report run produces payload schema correctly

## AC-11: Verification documented
`verification.md` includes:
- how to run locally (api + web + postgres + temporal)
- how to create a report via UI and via chat
- how to trigger a scheduled run (manual trigger or short cron)
- how to verify email delivery (dev sink or test inbox)
- commands to run tests

## AC-12: Completion threshold
- All acceptance criteria PASS
- Final audit confidence score >= 90%
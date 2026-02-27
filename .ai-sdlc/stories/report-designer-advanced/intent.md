# Intent — Restore full Report Designer: Create/Edit/Run/Schedule/Share KPI reports (Jira++)

## Background
We currently have a read-only Report Viewer at `/reports` that can list report definitions and show latest completed runs. Report definitions and runs must be seeded directly into DB. The original standalone "Report Designer" (SPA + API + Temporal + AI designer) was removed; the current app only supports viewing.

## Problem
Managers/Admins need to:
- create KPI reports (from Jira data) via UI and via chat
- run reports on-demand
- schedule reports
- share reports through email (and optionally other channels later)

The system must support both:
- Jira-side aggregation using JQL where possible
- Server-side aggregation when JQL is insufficient (group-by, time buckets, computed KPIs)

## Goal
Build an integrated Report Designer inside the current Jira++ app that supports:
1) Report creation/editing (definitions + versions)
2) Running reports (manual + scheduled)
3) Report builder UI for KPIs + grouping + time filters + filters
4) Distribution via scheduled email (with delivery logs)
5) Chat-based report creation: "describe report in natural language", using existing JQL knowledge and a constrained report schema.

## Scope (In)

### A) Report Definition + Versioning
- Create/update report definition (name, description, tags/persona)
- Create draft version + publish version
- Store query/template spec and report configuration in version payload
- Maintain version history with Draft → Published workflow

### B) Report Builder (UI)
- A visual report builder to assemble KPI reports:
  - choose KPIs (predefined library)
  - choose grouping (user/category/type/project/status/priority/etc.)
  - choose time range (from/to, last N days/weeks/months)
  - choose filters (project(s), issue types, statuses, labels, assignees)
- Drag & drop (optional for MVP; must have at least add/remove/reorder KPIs)
- Preview results (run report) and save

### C) Run Reports
- Run on-demand (button)
- Store output as `ReportRun` with table payload and metadata (duration, status, error)
- Caching rules optional (cacheHit semantics already exist)

### D) Schedule Reports
- Create schedules per report (cron, timezone)
- Schedule triggers background report execution
- Store run history

### E) Share Reports (Email)
- Configure recipients list per schedule (and/or per report)
- Send report snapshot via email at schedule time
- Store delivery history (sent/failed, provider id)
- Emails must be client-ready (summary + table + link to report)

### F) Chat-based Report Creation
- UI entry: "Create report via chat"
- Input: natural language description (e.g., "weekly open vs closed bugs per assignee last 30 days")
- Output: proposed report configuration + generated JQL (if applicable) + explanation
- User confirms; then the report definition/version is created
- Constrained generation: only allow supported KPIs/groupings/filters to avoid unsafe SQL
- If user asks for unsupported KPI: agent proposes closest supported or asks for refinement

### G) Security & Tenant Isolation
- Access: ADMIN + MANAGER only (as per reporting authorization)
- Tenant isolation for all definitions/versions/runs/schedules/deliveries
- Report execution must respect Jira site/project permissions available to tenant/user

## Scope (Out)
- Arbitrary SQL editor for end-users (MVP should be config-driven and safe)
- Export to PDF/CSV (optional later; email HTML is sufficient for MVP)
- Multi-channel delivery (Teams/Slack) unless trivial to add later
- Full recreation of the old standalone designer SPA

## Constraints / Non-Functional
- No secrets in logs. Never store or return plain Jira API tokens.
- Report execution must be deterministic and auditable.
- Prefer reuse of existing reporting-* packages and Temporal for scheduling.
- Must handle failures gracefully: store error, show actionable message, retry policies optional.
- Use minimal schema changes and follow existing Prisma patterns.

## Report Semantics (MVP Contract)
Reports are KPI aggregates of Jira issues and activities. They must support:
- Group-by: user (assignee/reporter), issueType, project, status, priority, label/category, component (as available)
- Time filter: created/resolved/updated in a date range
- KPIs library (start small, expand):
  - issue counts: created, resolved/closed, open, in-progress
  - cycle time / lead time (server-side)
  - throughput per period (server-side)
  - blocker/stuck count (server-side using "not moved in X days")
  - sentiment/risk counts if already computed by Jira++ insights tables (optional)
- Data sources:
  - Use JQL for fetching issue sets (filtering)
  - Use server aggregation for computed metrics and grouping if needed

## Deliverables
- GraphQL mutations for report CRUD, publish, run, schedule, share
- UI for Report Designer: create/edit/builder/preview/versioning/schedules
- Temporal workflows for scheduled execution + email delivery
- Chat-to-report UI flow
- Automated tests (Playwright/Cypress + API tests)
- `.ai-sdlc` artifacts for this story: analysis.md, plan.md, execution.md, audit.md, verification.md
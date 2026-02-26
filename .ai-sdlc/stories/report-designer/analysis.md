# Analysis — Restore Report Designer

## Problem Statement

The Report Designer feature was introduced in commit `cd04e4eb` (2025-11-10) as a standalone SPA (`apps/reporting-designer/`) with a dedicated GraphQL API (`apps/reporting-api/`, port 4002), five shared packages, Temporal workflows, an AI agent designer, and PostgreSQL storage in a `reporting` schema. It was entirely removed in commit `c2e34cb0` (2026-01-14, "dropping reporting apis") — 85 files, ~13,000 lines deleted. The goal is to restore a minimal, working Report Designer integrated into the current main app.

## Current State

### What remains in the current codebase:
- **GraphQL schema**: `ReportingDefinition`, `ReportingVersion`, `ReportingRun` types already exist in `apps/api/src/typeDefs.ts` (lines 790-820)
- **Queries**: `reportingDefinitions` and `reportingRuns(filter:)` already defined in the Query type (lines 843-844)
- **Resolvers**: `reportingDefinitions` and `reportingRuns` resolvers exist in `apps/api/src/resolvers.ts` (lines 260-305), gated by `requireAdmin(ctx)`
- **Registry service**: `apps/api/src/services/reportingRegistryService.ts` — a GraphQL client that proxies to the external reporting API at `REPORTING_API_ENDPOINT`
- **Env config**: `REPORTING_API_ENDPOINT` and `REPORTING_API_TENANT_ID` in env schema (env.ts:68-69), configured as `http://localhost:4002/graphql`
- **Admin Console UI**: `AdminConsole.tsx` already fetches and displays `reportingDefinitions` and `reportingRuns` in a "Reporting" section

### What's missing:
- No dedicated `/reports` route in the main app
- No standalone report viewing page (only admin table listing)
- No way to create/view/execute reports — the admin section only lists definitions and runs
- The external reporting API (`apps/reporting-api/`) is deleted — the proxy client has nothing to call
- No database tables for reports in the main app's database
- No report data to display (empty arrays returned when `REPORTING_API_ENDPOINT` is unset)

## How the Old Feature Worked

| Aspect | Detail |
|--------|--------|
| **Access** | Standalone SPA on its own port (5176 dev). Workspace-based navigation with icon rail (Metadata / Ingestion / Recon tabs) |
| **Backend** | Dedicated Apollo GraphQL server on port 4002 with Prisma ORM on `reporting` schema |
| **Data format** | Report payloads: `{ table: { columns: string[], rows: unknown[][] }, metrics?: [...], chart?: {...}, metadata: {...} }` stored as JSONB |
| **Storage** | PostgreSQL `reporting` schema with 8 tables: ReportDefinition, ReportVersion, ReportRun, ReportDashboard, DashboardVersion, DashboardTile, AgentReflection, AgentMessage |
| **Execution** | Temporal workflows for async report execution + AI agent design sessions |
| **Auth** | Keycloak PKCE flow (same as main app). Header-based tenant/user identification at API level |
| **Catalog** | 6 pre-configured Jira datasets (issues summary, daily metrics, project health, sprint velocity, incident response, engineer focus) in `configs/reporting/catalog.json` |

## Candidate Approaches

### Approach A: Restore as integrated feature in main app (RECOMMENDED)
- Add a `/reports` route in the main Jira++ app
- Create a `ReportsPage` component showing report definitions and their data
- Move report storage into the main app's database (add Prisma tables to existing schema)
- Add resolvers directly in the main API (no external service dependency)
- Seed with the 6 pre-configured Jira catalog datasets as sample reports
- **Pros**: Single deployment, uses existing auth/routing/API, no external dependencies
- **Cons**: More integration work, need to create Prisma migration

### Approach B: Restore the standalone reporting API
- Bring back `apps/reporting-api/` from git history and adapt it
- Keep the proxy pattern in the main API
- **Pros**: Faithful to original architecture
- **Cons**: Requires running a separate service (port 4002), Temporal dependency, much larger scope, harder to maintain

### Approach C: Minimal static reports only
- Add a `/reports` route with hardcoded/seeded report definitions
- Reports render from static JSON data (no execution engine)
- Use existing `reportingDefinitions` query infrastructure
- **Pros**: Simplest, fastest to deliver
- **Cons**: No dynamic report execution, limited value

## Constraints & Assumptions

- The intent specifies "static reports" — AC-3 says "At least one static report is listed and can be opened/viewed"
- Scope explicitly excludes "Building a brand-new report builder from scratch"
- Must use existing app patterns (routing, auth, GraphQL, state management)
- Must not introduce deprecated dependencies
- The main API already has the GraphQL types and resolver stubs — we should build on those
- Temporal is NOT required (original used it but scope says "static reports")

## Risks / Unknowns

| Risk | Severity | Mitigation |
|------|----------|------------|
| Prisma migration could conflict with existing schema | LOW | Use separate `reporting` schema prefix or integrate into main schema |
| Report data format may not display cleanly without the old preview engine | MED | Use simplified table renderer; the payload format is well-documented |
| ADMIN-only access may be too restrictive per original intent | LOW | Make configurable for ADMIN + MANAGER roles |
| No seed data to show reports on first load | MED | Create a seed script or migration with sample report definitions |

## Testability Assessment

| AC | Testable? | Recommended Tool |
|----|-----------|-----------------|
| AC-1 (Git history documented) | Manual review | N/A — this analysis.md satisfies it |
| AC-2 (Route reachable) | Yes | Playwright — route loads, renders heading |
| AC-3 (Static reports E2E) | Yes | Playwright — select project, view report list, open report |
| AC-4 (Auth/access control) | Yes | Playwright + API test — unauthenticated blocked, role check |
| AC-5 (Architecture alignment) | Partial | Build/lint/typecheck commands |
| AC-6 (Automated tests) | Yes | Playwright + API tests |
| AC-7 (Verification docs) | Manual review | N/A |
| AC-8 (Confidence >= 90%) | Self-assessed | N/A |

## Initial Confidence

**45%** — Analysis complete, approach identified, but no code changes yet. The existing GraphQL stubs and admin UI reduce integration risk significantly.

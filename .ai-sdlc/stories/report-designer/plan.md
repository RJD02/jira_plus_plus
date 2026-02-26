# Plan — Restore Report Designer (Approach A: Integrated)

## Objectives

- Add a `/reports` route to the main Jira++ app with navigation entry
- Create database tables for report definitions, versions, and runs in the main DB
- Add GraphQL resolvers that serve report data directly (no external reporting API dependency)
- Seed at least one viewable static report with sample data
- Gate access to ADMIN and MANAGER roles
- Add Playwright E2E + API tests for acceptance criteria

## Scope

**In:**
- Prisma schema additions for report tables
- Backend resolvers for report CRUD/read
- Frontend `ReportsPage` with report list and report viewer
- Navigation entry for `/reports` (ADMIN + MANAGER)
- Auth enforcement (frontend RequireRole + backend requireUser/requireAdmin)
- Seed data (at least 1 report with viewable payload)
- Playwright E2E tests + API-level tests

**Out:**
- Report execution engine (Temporal workflows)
- AI agent designer
- Report editor / Monaco integration
- Dashboard composer
- External reporting API service

## Plan Steps

### M1 — Database: Add report tables to main Prisma schema
- **Files**: `packages/cdm/prisma/schema.prisma`, new migration file
- **Change**: Add `ReportDefinition`, `ReportVersion`, `ReportRun` models to the existing Prisma schema (simplified from original 8 tables — no dashboards/agent tables needed for static reports)
- **Verification**: `pnpm migrate` succeeds, `pnpm generate` produces updated client
- **Rollback**: Drop migration, revert schema

### M2 — Backend: Replace proxy resolvers with direct DB resolvers
- **Files**: `apps/api/src/resolvers.ts`, `apps/api/src/typeDefs.ts`
- **Change**:
  - Update `reportingDefinitions` resolver to query Prisma directly instead of proxy client
  - Update `reportingRuns` resolver similarly
  - Add `reportDefinition(id: ID!)` query for single report fetch
  - Add `reportDefinitionBySlug(slug: String!)` query
  - Relax access from ADMIN-only to ADMIN + MANAGER (per original intent)
  - Add a query to fetch report payload data: `reportRun(id: ID!)` returning the JSONB payload
- **Verification**: `pnpm typecheck` passes, manual GraphQL query returns data
- **Rollback**: Revert resolver changes

### M3 — Seed data: Create sample report definitions
- **Files**: New seed script or Prisma seed file
- **Change**: Insert at least 2 report definitions with published versions and sample run data (table format with columns/rows)
- **Verification**: After `pnpm seed`, querying `reportingDefinitions` returns data
- **Rollback**: Delete seed records

### M4 — Frontend: Create ReportsPage component
- **Files**: New `apps/jira-plus-plus/src/pages/ReportsPage.tsx`
- **Change**:
  - Report list view: shows report definitions with name, type, persona tags, status
  - Report detail view: clicking a report shows its latest run payload as a rendered table
  - Use existing Apollo client and GraphQL patterns from other pages
  - Style consistent with existing pages (Tailwind, slate theme)
- **Verification**: Page renders, shows report list, clicking shows table data
- **Rollback**: Remove file

### M5 — Frontend: Add route and navigation entry
- **Files**: `apps/jira-plus-plus/src/App.tsx`
- **Change**:
  - Add `{ to: "/reports", label: "Reports" }` to navigation for ADMIN + MANAGER roles
  - Add `<Route path="/reports" element={<RequireRole allowedRoles={["ADMIN", "MANAGER"]}><ReportsPage /></RequireRole>} />`
- **Verification**: Route accessible, navigation shows for correct roles, 404 catchall doesn't intercept
- **Rollback**: Remove route + nav entry

### M6 — Auth enforcement verification
- **Files**: `apps/api/src/resolvers.ts` (already in M2)
- **Change**: Ensure all report resolvers call `requireUser(ctx)` at minimum; admin-specific mutations use `requireAdmin(ctx)`
- **Verification**: Unauthenticated GraphQL request returns UNAUTHENTICATED, USER role returns FORBIDDEN for admin ops
- **Rollback**: N/A (defensive check)

### M7 — Automated tests
- **Files**:
  - `tests/reports/report-designer.spec.ts` (Playwright E2E)
  - Work folder reference in `.ai-sdlc/stories/report-designer/tests/`
- **Change**:
  - **E2E test 1**: `/reports` route loads for authenticated MANAGER/ADMIN user, shows report list
  - **E2E test 2**: Click a report, verify report content/table is visible
  - **API test 1**: Unauthenticated GraphQL `reportingDefinitions` returns UNAUTHENTICATED
  - **API test 2**: Authenticated request returns report data array
- **Verification**: `npx playwright test tests/reports/` passes
- **Rollback**: Remove test files

### M8 — Documentation
- **Files**: `verification.md`, `audit.md`, `execution.md`, `patch_summary.md`
- **Change**: Document all steps, commands, test results, and confidence scoring
- **Verification**: All docs present and complete

## Test Plan (AC → Tests mapping)

| AC | Test | Framework |
|----|------|-----------|
| AC-1 (Git history) | N/A — documented in `analysis.md` | Manual |
| AC-2 (Route reachable) | `report-designer.spec.ts` → "reports route loads" | Playwright |
| AC-3 (Static reports E2E) | `report-designer.spec.ts` → "report is visible and can be opened" | Playwright |
| AC-4 (Auth/access) | `report-designer.spec.ts` → "unauthorized rejected" + API test | Playwright |
| AC-5 (Architecture) | `pnpm typecheck && pnpm build && pnpm lint` | CLI |
| AC-6 (Tests included) | Tests above | Playwright |
| AC-7 (Verification docs) | `verification.md` | Manual |
| AC-8 (Confidence >= 90%) | `audit.md` | Self-assessed |

### Test data/fixtures needed:
- Keycloak test user with MANAGER or ADMIN role (existing `dev-writer` user)
- Seeded report definitions in database (from M3)
- Running frontend dev server + API server

## Open Questions

None — proceeding with Approach A (integrated into main app).

## Estimated Impact/Risk

- **Risk**: LOW — builds on existing GraphQL stubs, uses established patterns
- **Impact**: MED — adds new database tables, new page, new route

## Plan Confidence

**70%** — Clear path forward, existing stubs reduce risk. Main uncertainty: Prisma migration complexity and ensuring seed data produces a realistic-looking report.

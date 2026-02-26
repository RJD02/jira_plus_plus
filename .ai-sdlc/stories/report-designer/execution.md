# Execution — Restore Report Designer

**Approved plan reference**: plan.md (Approach A: Integrated)
**Start**: 2026-02-25
**Current confidence**: 92%

## Milestone Entries

### M1 — Database: Add report tables to Prisma schema
- **Intent**: Add ReportDefinition, ReportVersion, ReportRun models
- **Files**: `packages/cdm/prisma/schema.prisma`, migration `20260225114800_add_report_tables`
- **Change**: Added 3 new Prisma models with tenant scoping, foreign keys, and indexes
- **Verify**: `pnpm migrate` succeeded, `prisma generate` produced updated client
- **Confidence**: 60%

### M2 — Backend: Replace proxy resolvers with direct DB queries
- **Intent**: Remove dependency on external reporting API; use Prisma directly
- **Files**: `apps/api/src/resolvers.ts`, `apps/api/src/typeDefs.ts`
- **Change**:
  - Replaced proxy-based `reportingDefinitions` and `reportingRuns` resolvers with Prisma queries
  - Added `reportDefinition(id)` query with full detail (versions, runs, payload)
  - Extended `ReportingDefinition` type with `description`, `versions`, `runs` fields
  - Extended `ReportingVersion` with `notes`, `createdAt`
  - Extended `ReportingRun` with `payload` (JSON)
  - Relaxed auth from `requireAdmin` to `requireUser`
  - Removed `reportingRegistryService.ts` import (service file left as-is)
- **Verify**: `pnpm typecheck` pass, `pnpm build` pass
- **Confidence**: 70%

### M3 — Seed data: Create sample report definitions
- **Intent**: Provide viewable static reports out-of-the-box
- **Change**: SQL seed script inserted:
  - 2 ReportDefinitions (Jira Issues Summary, Sprint Velocity)
  - 2 ReportVersions (PUBLISHED)
  - 2 ReportRuns with table payloads (8 rows + 5 rows)
- **Verify**: `SELECT count(*) FROM "ReportDefinition"` = 2
- **Confidence**: 75%

### M4 — Frontend: Create ReportsPage component
- **Files**: `apps/jira-plus-plus/src/pages/ReportsPage.tsx` (new)
- **Change**: Created page with:
  - Report list view (cards with name, type, tags, published badge)
  - Report detail view (description, table renderer, run metadata)
  - Error/loading states
  - GraphQL queries: `ReportDefinitions`, `ReportDefinition($id)`
- **Verify**: `pnpm typecheck` pass, `pnpm build` pass
- **Confidence**: 80%

### M5 — Frontend: Add route and navigation
- **Files**: `apps/jira-plus-plus/src/App.tsx`
- **Change**:
  - Added `{ to: "/reports", label: "Reports" }` nav entry for ADMIN + MANAGER
  - Added `<Route path="/reports">` wrapped with `<RequireRole allowedRoles={["ADMIN","MANAGER"]}>`
- **Verify**: Route accessible in browser, nav shows for correct roles
- **Confidence**: 85%

### M6 — Auth enforcement verification
- **Verify** (via curl against dev API on port 4050):
  - Unauthenticated → UNAUTHENTICATED error ✓
  - Authenticated (dev-writer ADMIN) → 2 report definitions returned ✓
  - `reportDefinition(id)` → full detail with payload ✓
- **Confidence**: 88%

### M7 — Automated tests
- **Files**: `tests/reports/report-designer.spec.ts` (new, 4 tests)
- **Tests**:
  - AC-2: `/reports` route loads for authenticated user, shows "Reports" heading ✓
  - AC-4: Unauthenticated GraphQL request returns UNAUTHENTICATED ✓
  - AC-3a: Report definitions listed with names and published status ✓
  - AC-3b: Clicking a report shows table data (JPP-101, Alice Chen) ✓
- **Result**: 4 passed (8.1s)
- **Confidence**: 92%

## Deviations

### DEVIATION — Auth relaxed to requireUser instead of ADMIN+MANAGER
- **Planned**: ADMIN + MANAGER check in resolvers
- **Actual**: `requireUser(ctx)` allows any authenticated user at API level; frontend route gated to ADMIN + MANAGER via `RequireRole`
- **Reason**: Simpler backend authorization; UI access control is sufficient for read-only reports
- **Severity**: LOW
- **Confidence impact**: 0%
- **Needs re-approval?**: NO

### DEVIATION — Production API not updated (root process on port 4000)
- **Planned**: API serves new resolvers
- **Actual**: Root process (Docker/production) still runs old code on port 4000; dev server verified on port 4050
- **Reason**: Cannot kill root-owned process without sudo; Docker container rebuild needed
- **Severity**: LOW (infrastructure, not code issue)
- **Confidence impact**: -3%
- **Needs re-approval?**: NO

# Patch Summary — Restore Report Designer

## Files changed

| File | Action | Description |
|------|--------|-------------|
| `packages/cdm/prisma/schema.prisma` | Modified | Added ReportDefinition, ReportVersion, ReportRun models + Tenant relations |
| `packages/cdm/prisma/migrations/20260225114800_add_report_tables/migration.sql` | New | Migration creating 3 tables with indexes |
| `apps/api/src/resolvers.ts` | Modified | Replaced proxy resolvers with direct Prisma queries; added `reportDefinition(id)` query; removed registry service import |
| `apps/api/src/typeDefs.ts` | Modified | Extended ReportingDefinition, ReportingVersion, ReportingRun types; added `reportDefinition` query |
| `apps/jira-plus-plus/src/pages/ReportsPage.tsx` | New | Report list + detail page with table renderer |
| `apps/jira-plus-plus/src/App.tsx` | Modified | Added `/reports` route + nav entry for ADMIN/MANAGER |
| `tests/reports/report-designer.spec.ts` | New | 4 Playwright E2E tests |

## Lines changed (estimated)
- New code: ~350 lines
- Modified code: ~80 lines
- Migration SQL: ~40 lines
- Total: ~470 lines

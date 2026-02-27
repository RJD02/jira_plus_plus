# Analysis — Full Report Designer: Create/Run/Schedule/Share KPI Reports + Chat Creation

## Problem Statement

Jira++ currently has a read-only report viewer at `/reports` that displays pre-seeded report definitions and their run payloads. Admins and managers cannot create, edit, run, schedule, or share reports through the application. All report data must be seeded via direct SQL. The original standalone Report Designer SPA was removed; this story restores full report lifecycle management as an integrated feature.

## Current Behavior vs Expected

| Area | Current | Expected |
|---|---|---|
| Report creation | SQL insert only | UI form + chat-based creation |
| Report editing | Not possible | Edit definition, draft/publish versions |
| Report execution | Not possible | On-demand "Run" button, stores results |
| Report scheduling | Not possible | Cron-based scheduled execution via Temporal |
| Report sharing | Not possible | Email delivery with table data + link |
| KPI aggregation | Not possible | JQL-based fetch + server-side aggregation |
| Chat creation | Not possible | Natural language → report config via LLM |

## Existing Infrastructure (Assets We Can Reuse)

1. **Database**: `ReportDefinition`, `ReportVersion`, `ReportRun` models exist with tenant scoping, versioning, and payload storage. `AuditLog` table exists for change tracking.
2. **GraphQL**: Read queries exist (`reportingDefinitions`, `reportDefinition`, `reportingRuns`). No mutations yet.
3. **Temporal**: Client/worker/workflow infrastructure is production-ready. Patterns for scheduling exist in `syncService.ts` and `projectSummaryAutomationService.ts`.
4. **Email**: Multi-provider communication service (SMTP + Resend) with HTML template patterns in `inviteService.ts`.
5. **Jira Client**: `searchJiraIssues(jql)` supports JQL-based search with pagination. Fields include status, priority, assignee, created, updated.
6. **AI/LLM**: Multi-provider narrative generation (OpenAI, Anthropic, Ollama) already configured via `NARRATIVE_PROVIDER` env var.
7. **Frontend**: ReportsPage with card list + detail view + table renderer. Button, Modal, form components available.
8. **Insights data**: `IssueInsight`, `TaskSummarySnapshot`, `UserSummarySnapshot`, `ProjectSummarySnapshot` provide pre-computed analytics.

## Schema Additions Needed

- `ReportSchedule` model (cron, timezone, enabled, recipients, last/next run tracking)
- `ReportDelivery` model (schedule reference, status, provider response, recipients)
- Extend `ReportVersion` with `config` JSON field for structured report configuration (KPIs, groupBy, timeRange, filters)
- No changes to existing models needed — they're well-designed

## Candidate Approaches

### Approach A: Fully Integrated (Recommended)
- Add mutations to existing API resolvers
- Add report execution service (JQL fetch + server aggregation)
- Add Temporal workflow for scheduled runs + email delivery
- Add report builder UI to ReportsPage
- Add chat-to-report using existing LLM infrastructure
- **Pro**: Single deployment, reuses all infrastructure
- **Con**: Large surface area in one story

### Approach B: Phased Delivery
- Phase 1: CRUD + run on-demand (AC-1,2,3,4,8)
- Phase 2: Scheduling + email (AC-5,6)
- Phase 3: Chat creation (AC-7)
- **Pro**: Lower risk per phase
- **Con**: Multiple approval cycles, slower

**Recommendation**: Approach A with milestones that can be verified incrementally.

## Risks & Unknowns

| Risk | Severity | Mitigation |
|---|---|---|
| Jira API rate limits during report execution | MED | Batch JQL queries, cache results, limit concurrent runs |
| LLM hallucination in chat-to-report | MED | Constrain to supported KPI library, validate config server-side |
| Temporal scheduling complexity | LOW | Follow existing `syncService.ts` patterns exactly |
| Email deliverability | LOW | Use existing tested email infrastructure |
| Large result sets overflowing payload | MED | Limit rows (1000), paginate in UI |

## Testability Assessment

| AC | Testable? | Tool |
|---|---|---|
| AC-1 (CRUD) | Yes | Playwright (UI) + API test |
| AC-2 (Config model) | Yes | API test (validation) |
| AC-3 (Run on-demand) | Yes | Playwright + API test |
| AC-4 (KPI aggregation) | Partially | API test with mock Jira data |
| AC-5 (Scheduling) | Yes | API test (create schedule), manual Temporal verify |
| AC-6 (Email) | Partially | API test (delivery record), mock email |
| AC-7 (Chat creation) | Yes | Playwright (UI flow), API test with mock LLM |
| AC-8 (Auth) | Yes | API test (401/403) |
| AC-9 (Audit) | Yes | API test (audit log entries) |
| AC-10-12 | Meta | Coverage by above |

## Initial Confidence: 55%

High confidence in infrastructure readiness. Uncertainty around: JQL aggregation complexity, LLM prompt engineering for chat-to-report, and the sheer size of the feature surface.

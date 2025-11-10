# Reporting & Dashboard Platform — Specification

## Summary & Goals
- Deliver a unified reporting surface inside Jira++ that lets admins design reports and dashboards once, publish them to specific personas (executives, managers, leads, individual contributors), and guarantee that each viewer only sees data from their authorised projects and teams.
- Start with query-driven reports (SQL/GraphQL templates) but design the system so it can later support code-backed resolvers and agent-generated dynamic reports.
- Provide persona landing dashboards that highlight the most relevant KPIs while allowing drill-down through filters and exports.

## Persona Targets & Core Use Cases
- **Executive / Account Owner** — cross-project portfolio health, critical risks, staffing trends, SLA adherence.
- **Project / Delivery Manager** — sprint progress, blockers, velocity, team availability, workload balance.
- **Team Lead / Engineering Manager** — review queues, owner-by-owner workload, escalation tracking, unassigned work.
- **Individual Contributor** — personal backlog, blockers, dependencies, upcoming deadlines, availability status.
- Personas inherit existing RBAC rules; dashboards must automatically scope reports to the viewer’s accessible projects/teams.

## Functional Requirements
1. **Report Definitions**
   - Each report stores metadata (name, description, persona tags), scope rules, filter schema, data source (query template now, resolver later), and visual configuration (table/card/chart).
   - Support lifecycle states: draft, preview, published, archived with version history and rollback.
2. **Dashboards**
   - Dashboards group multiple reports, track layout metadata, and target personas. Reports can appear on multiple dashboards.
   - Provide freshness indicators, export controls, and optional subscription hooks (Phase 2).
3. **Filters & Parameters**
   - Built-in filter types: date range, project/team multi-select, status, text, numeric.
   - Filters have default values, can be locked for certain personas, and may reference dynamic resolvers (`currentUser.projects`).
4. **Scope Enforcement**
   - Report executions must intersect requested filters with viewer permissions (tenant, project, team). No bypass via client input.
5. **Publishing Workflow**
   - Draft → Preview → Publish, with optional scheduled go-live and manual rollback.
   - Caches should bust automatically when new versions publish.
6. **Execution & Results**
   - Parameterised query execution (via Prisma or curated SQL views). Responses normalised to a `ReportResult` payload supporting tables, metrics, and charts.
   - Cache results per (tenant, report version, filter hash, scope hash).
7. **Admin Studio**
   - Admin-only builder for CRUD, visual query editor (with raw SQL toggle), filter designer, preview harness, and persona scope configuration.
   - Provide both a hand-crafted designer (forms, drag/drop) and an agentic designer that can ingest specs, CDM metadata, and APIs to propose report definitions via conversational canvas.
8. **Viewer Experience**
   - Persona dashboards accessible from main nav; users can apply allowed filters, pin favourites, export data, and view run metadata.
9. **Audit & Observability**
   - Track edits, publishes, and run history (duration, success/failure, cache hits).
10. **Extensibility**
   - Architecture must allow future custom resolver integration (Node modules) and agent-driven report authoring without breaking existing definitions.
11. **Scheduling & Delivery**
    - Allow admins to schedule report refresh jobs (cron-like frequencies) and configure delivery channels (email, Slack, download link) per persona.

## Non-Functional Requirements
- Multi-tenant isolation with per-tenant schema binding.
- Performance targets: cached report <= 2 s p95, cold execution <= 6 s p95, timeout at 8 s.
- Availability aligned with core API SLAs; dashboard should degrade gracefully if a tile fails.
- Security: enforce existing RBAC, ensure parameterised queries, log admin actions.
- Compliance: no cross-tenant leakage, support data retention policies.
- Dynamic extensibility: new reports and code procedures must go live without application redeploys by relying on registry metadata + sandbox execution.
- Pluggable catalogue: all schema lookups route through `CatalogProvider`; Phase 1 ships a file-based implementation, later swapped for central metadata without redesign.

## Experience Overview
### Reporting Studio (Admin)
- **Library View:** sortable list of reports and dashboards showing persona tags, publish status, last run health.
- **Builder Wizard:** steps for Basics → Data → Filters → Visualisation → Scope & Persona → Preview → Publish.
- **Preview Mode:** run report with sample filters, show execution time, row counts, potential bottlenecks.
- **Versioning:** display draft vs published diff, allow comments/notes, maintain audit trail.
- **Canvas Designer (Agentic):** conversational workspace similar to ChatGPT Canvas; admins describe needs, the agent drafts report/query skeletons, proposes filters/visuals, and allows human refinement before saving. Each session is orchestrated via Temporal workflow (`AgentDesignWorkflow`) so prompts, suggestions, and approvals are durably logged.
- **Manual Designer:** structured form + drag/drop interface for precise control; users can switch between manual and agent-generated drafts at any stage.
- **Designer SDK:** shared UI & API toolkit that the standalone designer SPA consumes. Provides components (dataset selector, filter builder, preview panel) and ensures consistency whether embedded in Admin Console or deployed independently.

### Console Entry Points & Isolation Model
- Provide a **launchpad** after login with three panels: User Console, Admin Console, and **Reporting Designer**. Access derives from shared auth but each vertical loads its own shell.
- The Reporting Designer runs as its own SPA/module, framed within the launchpad but capable of evolving into a vendor-neutral designer product. It consumes shared auth tokens and APIs while keeping UI, routing, and deployment isolated.
- Admin Console still links to the Designer (deep link), yet both can evolve independently: Admin focuses on operational controls; Designer focuses on report/agent authoring. Shared SDK exports ensure consistent styling where needed without forcing tight coupling.

### Vertical Isolation & Deployment Strategy
- **Frontend Bundles**
  - `User Console` (existing Next.js app) remains focused on daily workflows.
  - `Admin Console` extends the current admin pages and hosts shared management tooling.
  - `Reporting Designer` is a separate bundle (Next.js/SPA) loaded via launchpad iframe or micro-frontend mount. It communicates through shared SDKs and GraphQL endpoints but ships its own routing, release cadence, and UI components.
- **Auth & Session**
  - All verticals rely on the same identity provider and JWT/session cookie. The launchpad issues a short-lived signed token when switching verticals; each shell validates and exchanges it for GraphQL access tokens.
  - Role-based claims determine which vertical buttons appear. Reporting Designer can therefore be published to external customers without exposing admin tooling.
- **Shared Contracts**
  - `Designer SDK` exposes UI primitives (dataset pickers, query editor, preview panels) and TS types (report definitions, filter schema). Admin Console imports the same SDK for consistency, while the standalone designer can version-lock or fork as needed.
  - Backends (GraphQL, Temporal workflows, sandbox runner) sit behind tenant-aware APIs; all verticals call the same endpoints. No vertical keeps proprietary logic client-side, enabling independent deployment.
- **Data & Observability**
  - Temporal workflows and report runs are tagged with `originVertical` metadata so audits differentiate whether a change came from Admin Console or standalone Designer.
  - Feature flags can be scoped per vertical (e.g., enable agent canvas only in designer bundle while Admin Console continues manual mode).
- **Forking into Standalone Solution**
  - Deploy Reporting Designer on its own subdomain (e.g., `designer.jira++`) with launchpad simply deep-linking out when in integrated mode.
  - Package the SDK and GraphQL client as public npm modules. Third parties can consume the SDK against our APIs, or we can license the designer as a white-label product pointing at different metadata/catalog providers.
  - Maintain backward-compatible API contracts so external deployments upgrade independently; use semantic versioning with deprecation windows.
  - For on-prem or air-gapped customers, ship the designer bundle + SDK as a container that targets the same Temporal/sandbox services, enabling a full fork without touching User/Admin consoles.

### Persona Dashboards
- **Layout:** configurable sections (e.g., KPIs, Trends, Risks) built from report tiles with saved sizing.
- **Filters:** global dashboard filters (date range, project) plus per-tile overrides.
- **Interactions:** expand tile to full view, download CSV, copy permalink with filters applied.
- **Freshness Indicator:** show `last refreshed` timestamp and whether data came from cache.

### Filters & Sharing
- Filter panel shows available controls with locked indicators; disallowed filters appear disabled for that persona.
- Export options (Phase 1: CSV, Phase 2: PDF/Slack). Provide subscription/notification list in Phase 2+.
- Shareable links preserve filter state but re-check access on open.

## Architecture Overview
- **Report Registry Service** (GraphQL module in `apps/api`): manages report/dashboard CRUD, versioning, scope policies, and execution endpoints.
- **Execution Engine**: composes runtime filters with scope policy, executes template queries via Prisma/raw SQL (whitelisted views), normalises to UI schema, caches responses in Redis.
- **Agent Orchestration Service**: LLM-powered component with access to CDM schema, report templates, and specs; generates draft queries, filter schemas, and visual suggestions. Stores proposals as versions requiring human approval.
- **Sandbox Runner**: isolated execution environment (containerised or VM-based) for complex, code-defined reports. Supports multi-step procedures, temporary package imports, and resource/time limits. Results persisted back to registry.
- **Scheduling & Notifications Service**: cron-style orchestrator (leveraging existing worker infra) that triggers report refresh jobs, warms caches, and dispatches deliveries (email, Slack, downloadable exports) based on admin-defined schedules.
- **Temporal Workflow Layer**: Temporal (or similar workflow engine) coordinates long-lived processes—agent design sessions, report execution pipelines, scheduled deliveries—providing durable state, retries, and audit trails out-of-the-box. Individual activities encapsulate agent prompts, sandbox runs, cache writes, and notification sends.
- **Catalog Provider Interface**: abstraction that surfaces datasets, fields, relationships, and metrics to both manual and agentic designers. Initial implementation uses a file-based manifest (generated from Prisma/CDM) so future metadata systems can replace it without refactoring.
- **Reporting API Service**: dedicated backend (separate deployable in `apps/reporting-api`) exposing Reporting Designer endpoints (GraphQL/REST) and owning the reporting schema in Postgres (e.g., `reporting`). This service depends on shared packages for registry access, CatalogProvider, Temporal workflow clients, and sandbox runner. The legacy `apps/api` consumes the same SDK for read-only access and backwards compatibility.
- **UI Modules**: Admin Console extension for studio; new `/reports` area in client app for persona dashboards with tile renderer components.
- **Access Control Layer**: uses existing auth context (`RequestContext`) to derive tenant, projects, role; enforces scope before query execution.
- **Caching Layer**: Redis cluster keyed by `{tenant}:{reportVersionId}:{scopeHash}:{filterHash}` with TTL and manual bust tooling.
- **Future Extensibility**: plug-in interface for resolver-based reports, asynchronous execution via worker queue, agent integration for dynamic authoring.

## Data Model & Schema Changes
- `ReportDefinition` (id, slug, name, description, personaTags[], type, scopePolicy JSON, filterSchema JSON, visualisationConfig JSON, currentVersionId, createdAt/By, updatedAt).
- `ReportVersion` (id, definitionId, status, queryTemplate, defaultFilters JSON, notes, createdAt/By, publishedAt/By).
- `ReportDashboard` (id, slug, name, personaTags[], layout JSON, currentVersionId, createdAt/By, updatedAt).
- `DashboardVersion` (id, dashboardId, status, layout JSON, publishedAt/By).
- `DashboardTile` (id, dashboardVersionId, reportDefinitionId, layout bounds, tileOverrides JSON).
- `ReportRun` (id, reportVersionId, tenantId, executedBy, executedAt, durationMs, status, filtersUsed JSON, filterHash, cacheHit, error).
- `ScopePolicy` embedded JSON structure:
  ```
  {
    "mode": "tenant" | "project" | "team" | "custom",
    "allowedProjectIds": [],
    "allowedTeamIds": [],
    "dynamic": ["viewer.projects", "viewer.teams"]
  }
  ```
- Add Prisma migrations with appropriate indexes (e.g., `(tenantId, personaTags)`, `(reportVersionId, executedAt)`).

## API Contracts
- **Query Fields**
  - `reportDefinitions(filter)` → paginated list with metadata, current version, and publish status.
  - `reportDefinition(id)` → definition + draft/published versions.
  - `reportDashboards(persona)` → layout and tile definitions for the persona.
  - `runReport(reportId, filters)` → executes published version and returns `ReportResult`.
  - `reportRuns(reportId, limit)` → execution history for observability.
- **Mutations (admin)**
  - `createReportDefinition`, `updateReportDefinition`, `deleteReportDefinition`.
  - `createReportVersion`, `updateReportVersion`, `publishReportVersion`, `archiveReportVersion`.
  - `createReportDashboard`, `updateReportDashboard`, `publishReportDashboard`.
  - `previewReportVersion(versionId, filters)` (stores run preview status without publishing).
- **ReportResult Schema**
  ```
  type ReportResult {
    versionId: ID!
    data: ReportPayload!
    visualisation: VisualisationConfig!
    executedAt: DateTime!
    durationMs: Int!
    cachedAt: DateTime
    cacheHit: Boolean!
  }

  type ReportPayload {
    table?: TablePayload
    metrics?: [MetricPayload!]
    chart?: ChartPayload
    metadata?: JSON
  }
  ```
- **Filter Schema**
  ```
  type ReportFilter {
    key: String!
    label: String!
    type: FilterType!
    required: Boolean!
    defaultValue: JSON
    allowedValues: JSON
    lockedForPersonas: [PersonaRole!]
    valueResolver: String
  }
  ```
- Provide REST mirror (`POST /reports/run`) for worker/testing scenarios.

## Execution Flow
1. Viewer requests dashboard → client fetches published layout & tiles for persona.
2. For each tile, client requests `runReport(reportId, filters)` with dashboard/global filter values.
3. API loads published version, merges default filters with request, applies scope policy (intersect with viewer permissions).
4. Temporal workflow `ReportExecutionWorkflow` kicks off with context (tenant, reportVersionId, filters). It selects runtime mode: `QUERY` (direct Prisma/raw SQL activity) or `PROCEDURE` (sandbox activity executing multi-step code).
5. Activities emit structured logs/metrics by default. Procedure mode spins up sandbox container, runs approved module, captures output, and returns payload to workflow.
6. Workflow activity persists result, updates cache, and records run history. Temporal completion yields `ReportPayload`.
7. Response returned with execution metadata; UI renders tile and indicates freshness.
8. Cache invalidated on publish/scope change/manual bust or on completion of scheduled refresh jobs.

## Access Control & Security
- Only admins can manage definitions/dashboards; viewer endpoints require persona-based RBAC.
- Scope policy must exist before publish; builder enforces validation.
- Parameterise queries; restrict accessible tables to curated views; lint SQL templates for forbidden clauses.
- Audit logs capture create/update/publish/delete, along with preview runs.
- Ensure shareable links still validate viewer access on load; no data pushed to client unless viewer authorised.

## Performance & Capacity
- Leverage read replicas for heavy queries; discourage cross-tenant aggregations.
- Add guardrails: maximum row limits, mandatory pagination for table widgets, cost hints in builder.
- As usage grows, support pre-materialised datasets (nightly job) for expensive reports; store result pointers in cache for instant retrieval.
- Collect run metrics (duration, row count, cache hits) in analytics pipeline.

## Caching Strategy
- Redis key: `report:{tenant}:{versionId}:{scopeHash}:{filterHash}`.
- Default TTL 10 minutes (configurable).  
- Manual bust endpoints for admins; automatic bust on publish/version change or filter schema update.
- Optionally warm caches on schedule for high-traffic dashboards.

## Observability & Telemetry
- Instrument executor with structured logs (reportId, versionId, duration, rows, status).
- Emit metrics for cache hit ratio, run latency, failure rate, top reports by traffic.
- Add tracing spans (GraphQL resolver → executor → DB query) to existing APM.
- UI telemetry: builder actions, publish events, dashboard tile load times.

## Phased Delivery Plan
1. **Phase 0 – Foundations**
   - Schema migrations, GraphQL types, stub executor returning mock data.
   - Admin navigation entry and feature flag scaffolding.
   - Implement `CatalogProvider` interface with file-based manifest (generated from CDM) to unblock designer work.
2. **Phase 1 – Query Reports MVP**
   - Visual query builder, filter designer, execution engine with caching, basic widgets (table, KPI card, bar/line chart).
   - Persona dashboards with manual layout.
   - Audit logging and RBAC enforcement.
   - Introduce Temporal as orchestration backbone (minimal workflow for report execution) to ensure durability from day one.
3. **Phase 2 – Enhanced UX**
   - Additional visualisations, cross-report filters, CSV/PDF export, scheduled refresh, subscriptions, approvals workflow.
4. **Phase 3 – Custom Resolvers & Async**
   - Resolver registry for Node modules, background jobs for long-running reports, sandbox runner + materialised datasets.
5. **Phase 4 – Agent-driven Authoring**
   - Deep integration of agentic canvas with CDM catalogue, automated draft/publish pipeline, conversational dashboard changes, dynamic report generation with human-in-the-loop approvals.

## Testing & Validation
- **Unit Tests:** scope policy enforcement, filter validation, SQL template parameterisation, cache key generation.
- **Integration Tests:** admin CRUD flows, publish workflow, persona access checks, dashboard rendering with seeded data.
- **Performance Tests:** execute representative reports against staging dataset to confirm latency targets.
- **Smoke Tests:** nightly automated runs of published reports with default filters to detect failures.
- **UI Tests:** Cypress flows for builder wizard, dashboard interactions, export actions.

## Risks & Mitigations
- **Slow or failing reports degrade experience** → enforce execution timeouts, preview performance metrics, provide per-report alerts.
- **Mis-scoped data exposure** → mandatory scope validation, automated regression tests, review checklist before publish.
- **Query authoring complexity** → supply curated datasets, sample templates, context-aware linting, documentation.
- **Cache inconsistency** → tie cache busting to publish events, surface freshness indicator, manual bust tooling.
- **Migration overhead** → introduce via feature flag, seed sample content, coordinate with release training.
- **Future resolver complexity** → plan for job queue, isolation, rate limiting before enabling resolver type.

## Open Questions & Next Steps
- Do we need approval workflow between drafting and publishing (e.g., product sign-off)?  
- Which datasets should ship as curated views for initial builder (issues, availability, worklogs, risks)?  
- Should dashboards support end-user customisation (drag/drop) in MVP or follow-up release?  
- Confirm infrastructure for Redis scaling and read replicas ahead of Phase 1 rollout.  
- Gather stakeholder feedback on proposed persona dashboards before commencing UI design sprints.

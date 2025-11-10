# Reporting Designer Implementation Plan

This document converts the reporting platform spec into actionable engineering work. It assumes Phase 1 focuses on shipping the standalone, agent-assisted Reporting Designer alongside the shared report execution backend.

> **Current status:** Skeleton projects are in place for the standalone Reporting Designer app (`apps/reporting-designer`), the dedicated Reporting API service (`apps/reporting-api`), and the shared reporting packages (`packages/reporting-*`). The reporting API now exposes a GraphQL server backed by the reporting Prisma schema with create/list/publish operations, dashboard mutations, and a `runReportVersion` workflow that queues Temporal jobs while falling back to sandbox execution; run records are updated on completion. Temporal worker scaffolding (workflows + worker entrypoint) is checked in. The Designer shell proxies to the API, supports creating definitions and publishing new versions via the shared registry client, and the legacy Admin Console now surfaces reporting metadata alongside a deep link into the designer. Upcoming milestones focus on real workflow orchestration, sandbox execution, and richer canvas tooling.

## 0. Guiding Principles
- **Vertical isolation first**: Reporting Designer ships as its own app (UI + backend edge) sharing auth but deployable separately.
- **Shared contracts**: Registry API, catalog provider, and execution workflows live in `apps/api`/shared packages so Admin Console, Designer, and third-party SDKs all use the same surface area.
- **Metadata-agnostic**: Everything depends on the `CatalogProvider` interface; Phase 1 uses file-based manifests, future phases swap in external metadata services without rewrites.
- **Temporal orchestration**: Durable workflows log agent sessions (`AgentDesignWorkflow`) and report executions (`ReportExecutionWorkflow`), enabling auditing and retries.
- **Sandbox execution**: Code-based “solution as code” reports run in isolated containers managed by the workflow layer; query-based reports continue to use direct Prisma calls.

## 1. Repository Layout & New Packages
```
apps/
  api/                             # existing GraphQL service (read-only integrations)
  jira-plus-plus/                  # existing user/admin console
  reporting-designer/              # NEW: Next.js app serving agentic designer
  reporting-api/                   # NEW: standalone backend powering designer & reporting workflows
packages/
  reporting-catalog/               # NEW: CatalogProvider interface + file-based impl
  reporting-registry/              # NEW: shared types, SDK helpers, GraphQL client
  reporting-temporal/              # NEW: workflow definitions (agent, execution)
  reporting-sandbox/               # NEW: sandbox runner client + manifests
  reporting-ui-sdk/                # NEW: shared UI components (dataset picker, preview) used by designer + admin console
```
- `apps/reporting-designer` exports an embeddable build (micro-frontend) and standalone SPA.
- Each package publishes TypeScript types and helper functions consumed by all apps.

## 2. Backend Enhancements (`apps/api`)
The historical API remains for legacy consumers and will rely on shared SDKs to query the reporting system. A new `apps/reporting-api` service owns write operations, designer endpoints, and Temporal orchestration.

### 2.1 Report Registry & APIs
- Create Prisma schema dedicated to Postgres schema `reporting` and migrations for `ReportDefinition`, `ReportVersion`, `ReportDashboard`, `DashboardVersion`, `DashboardTile`, `ReportRun`.
- Implement `apps/reporting-api/src/modules/reporting` providing GraphQL + REST endpoints for CRUD, publish, run, scheduling (as per spec).
- Upgrade reporting designer workspace (see `editor_workspace_spec.md`) – Monaco/CodeMirror integration, metadata-driven completion, active canvas.
- Expose SDK (`packages/reporting-registry`) that both `reporting-api` and legacy `apps/api` use to access registry data (legacy routes become thin proxies if needed).
- Ensure multi-tenant scoping and cross-schema transactions via Prisma datasource pointing to same Postgres but `searchPath=reporting`.

### 2.2 Catalog Provider Integration
- Introduce `CatalogProvider` service in `packages/reporting-catalog`.
- Default impl `FileCatalogProvider` loads JSON manifest from `configs/reporting/catalog.json`.
- Register provider in `reporting-api` service; export lightweight client so legacy API/admin console can query metadata through the same interface.

### 2.3 Temporal Workflows
- Define workflows in `packages/reporting-temporal`:
  - `AgentDesignWorkflow` orchestrates agent prompts, suggestions, and human approvals.
  - `ReportExecutionWorkflow` handles query/procedure execution, caching, run logging.
  - `ScheduledDeliveryWorkflow` warms caches and sends emails/Slack notifications.
- Deploy Temporal workers in `apps/api` or a new worker process `apps/reporting-worker` depending on load. Initial phase can reuse `Dockerfile.worker` by registering new task queues.

### 2.4 Sandbox Runner
- Create `packages/reporting-sandbox` for managing containerised execution:
  - Interface `SandboxRunner.exec(reportVersionId, codeRef, input)` returning `ReportPayload`.
  - Phase 1 implementation can shell out to node VM with security guardrails; roadmap includes container runtime (Firecracker/Docker).
- Register sandbox runner as Temporal activity used by `ReportExecutionWorkflow`.

## 3. Reporting Designer App (`apps/reporting-designer`)
### 3.1 Bootstrapping
- Scaffold Next.js app with TRPC or GraphQL client using `reporting-registry` package.
- Authentication:
  - Reuse existing auth cookies/JWT; add route guard to redirect through launchpad.
  - Provide environment vars for API base URL, metadata manifest path.

### 3.2 Agent Canvas
- Integrate LLM provider (existing LLM runtime or new `apps/api/src/llm` endpoints) to power conversational canvas.
- Build UI using `reporting-ui-sdk` components: prompt panel, schema explorer (backed by `CatalogProvider` data), preview pane showing live run results.
- Hook Temporal `AgentDesignWorkflow` via API endpoints (`POST /agent/design/start`, etc.).
- Persist drafts into Report Registry via GraphQL mutations; allow manual editing before publish.
- **Dynamic plan & tool activity:** Designer UI renders an Agent Plan panel with live steps, status chips, and tool call logs. Backend stores `plan_state` per reflection and updates it each turn based on agent output. Agent runtime can call “virtual tools” (catalog lookup, doc fetch, preview run) that both influence the plan and show activity in the UI.
- **Optimistic conversation entries:** User prompts show immediately with status (sending/sent/failed). Assistant responses can include text-only guidance or Apply-ready snippets.

### 3.3 Dashboard Composer
- Provide drag-drop layout builder referencing saved reports.
- Commit dashboards to registry (`createReportDashboard` mutation).
- Publish dashboards with preview mode leveraging `ReportExecutionWorkflow`.

### 3.4 Metadata Assistant Vision
- Treat Reporting Designer as one “skill” inside a broader metadata assistant shell. Future skills (Ingestion Planner, Recon Auditor, Monitoring) reuse the same UI scaffolding (conversation pane, plan panel, tool activity log) and swap their tool palettes.
- Build a metadata client that mirrors the spark-ingestion metadata service API (projects, datasets, docs, GitHub repos, ingestion status, etc.). For now it reads `configs/reporting/catalog.json`; later it will call the real service.
- Expose metadata “tools” (catalog lookup, doc search, code search, ingestion status, preview execution) via the reporting API so the agent runtime can orchestrate them and update plan state.
- Index agent conversations back into metadata so future prompts can reference prior reasoning within the same project.
- Copy/reference upstream specs (Nucleus) as needed so the GraphQL contract stays aligned. Treat spark-ingestion’s metadata modules as inspiration but re-implement locally to avoid cross-repo coupling.

## 4. Shared SDKs & Tooling
### 4.1 `reporting-ui-sdk`
- Build component library (React + Tailwind/Chakra) for dataset selector, filter builder, visualisation preview, run health widget.
- Export theme tokens to match Admin Console styles while enabling override for standalone deployments.

### 4.2 `reporting-registry`
- Provide TypeScript client (GraphQL codegen) and helper hooks for running reports, loading definitions, managing filters.
- Include caching helpers and typing for `ReportPayload`.

### 4.3 `Catalog CLI`
- In `packages/reporting-catalog`, add CLI command `pnpm catalog:generate` to dump Prisma schema/CDM metadata into file manifest for Phase 1.

## 5. Scheduling & Delivery
- Extend existing worker (`Dockerfile.worker`) or create new service to enqueue Temporal workflows based on admin-defined schedules.
- Support email and Slack deliveries:
  - Reuse existing notification services (if any) or add `packages/reporting-delivery`.
  - For Phase 1, implement email export (HTML + CSV attachments) and Slack block kit message.

## 6. Deployment & Isolation
- Launchpad updates (in `apps/jira-plus-plus`):
  - Add navigation card linking to external designer app (new route or subdomain).
  - Pass signed token for SSO; designer verifies and exchanges for session with `reporting-api`.
- Deployment strategy:
  - Build pipeline generates separate Docker images for Reporting Designer and Reporting API.
  - Configure Postgres with additional schema `reporting`; migrations run via `reporting-api`.
  - Terraform/k8s manifests add services for designer frontend, reporting API, Temporal workers, sandbox runtime.
  - Document environment variables (Temporal queues, catalog manifest path, sandbox runtime, `DB_SCHEMA=reporting`, shared auth issuer).

## 7. Observability & Governance
- Add structured logging (pino/winston) for workflows and sandbox runs with `originVertical`.
- Prometheus metrics: workflow durations, agent suggestion counts, sandbox failures.
- Audit logging: store agent prompt/response metadata (with redaction) linked to report versions.

## 8. Deliverable Milestones
1. **Milestone A** — Registry backend, catalog provider stub, Temporal workflows scaffolding, GraphQL API ready.
2. **Milestone B** — Reporting Designer MVP (agent canvas + manual editor), basic dashboard composer, ability to publish and view reports in designer.
3. **Milestone C** — Sandbox execution + solution-as-code support, scheduling/delivery jobs, Admin Console integration (view-only).
4. **Milestone D** — SDK release, third-party embedding docs, production hardening (observability, RBAC audits).

## 9. Open Questions
- Which LLM provider powers the agent canvas (existing local LLM vs hosted API)?
- What runtime will sandbox use at launch (Node VM vs container)? Governance for package allowlist?
- Do we require approvals before publishing agent-generated reports, or can admins bypass?
- How will shareable designer deployments manage branding/theming for OEM customers?
- How does the metadata service evolve (projects, multi-source indexing, endpoint registry) and how do we migrate the designer from file-based catalog to the real service?
- How will “skills” be packaged (Report Designer vs Ingestion Planner) inside the same assistant shell? What is the skill switch experience?

## 10. Next Steps
1. Align stakeholders on Milestone A scope and resourcing (backend + workflows + catalog stub).
2. Create engineering tickets per package/app with owners.
3. Generate initial Prisma migration drafts for registry tables.
4. Bootstrap `apps/reporting-designer` using `pnpm create next-app` (or internal template) and set up shared UI SDK skeleton.
5. Implement catalog generation CLI to unblock agent canvas schema browsing.
6. Define metadata client interface + skill scaffolding so Designer can call spark-ingestion metadata endpoints when they land (file-based catalog acts as temporary adapter).
6. Implement dynamic plan API (plan_state persistence, tool invocation hooks) and corresponding UI panel.

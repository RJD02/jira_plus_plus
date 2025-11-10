# Reporting Platform — Milestone A Snapshot

Milestone A delivers the core backend foundation required for the agentic Reporting Designer and downstream dashboards. It is intentionally backend‑heavy; the goal is to unblock subsequent UI milestones by standing up the registry, catalog, and orchestration layers.

## Quick Start

```bash
# 1. Install dependencies and generate Prisma clients
pnpm install
pnpm --filter @platform/cdm prisma generate
pnpm --filter @apps/reporting-api prisma generate

# 2. Bring up Postgres/Temporal (reuse existing docker compose stack)
pnpm stack:up
# or, if you only need Postgres:
pnpm db:up

# 3. Launch the reporting API
pnpm dev:reporting

# Optional: run the Temporal worker for async report execution
pnpm dev:reporting:worker

```

Legacy sample catalog data lives in `configs/reporting/catalog.json` for reference. Collection
runs now populate the catalog dynamically.

## What Ships in Milestone A

- **Reporting registry schema & migrations** — the `reporting` Postgres schema contains definitions, versions, dashboards, tiles, and run history tables created via Prisma migrations.
- **Standalone Reporting API** — Apollo GraphQL service (`@apps/reporting-api`) exposing CRUD for reports/dashboards, run history, and catalog queries (`catalogDatasets`, `catalogDataset`).
- **Temporal workflow scaffolding** — `reportExecutionWorkflow` queues report runs onto Temporal and records lifecycle transitions; the Temporal worker boots via `pnpm dev:reporting:worker`.
- **Fallback execution path** — a sandbox stub (`NoopSandboxRunner`) ensures runs complete even when Temporal is unavailable, returning metadata immediately.
- **Catalog provider stub** — file-backed manifest with two datasets and GraphQL accessors; ready to swap for a metadata service in later milestones.
- **Admin Console read integration** — existing Admin Console surfaces report definitions and run history through the shared registry client.
- **Shared packages** — `@reporting/catalog`, `@reporting/registry`, `@reporting/sandbox`, `@reporting-temporal`, and `@reporting-ui-sdk` are bootstrapped for downstream reuse.

## What to Expect When Running It

- You can create/publish report definitions, versions, dashboards, and tiles via GraphQL mutations or the Admin Console.
- Running `runReportVersion` immediately persists a `ReportRun` row and kicks off Temporal; without a worker running, the fallback sandbox marks the run as `COMPLETED`.
- Catalog queries return the stub datasets, enabling designer tooling to inspect available columns.
- GraphQL endpoint is available at `http://localhost:4002/graphql` (configurable with `REPORTING_API_ENDPOINT`).

## Known Gaps (Planned for Later Milestones)

Milestone A intentionally omits end-user UX and advanced orchestration features:

- No dedicated Reporting Designer UI yet (arrives in Milestone B).
- Query execution is mocked; sandbox still returns placeholder data.
- No caching, persona/dashboard viewer experience, or delivery workflows.
- Observability, audit logging, and RBAC hardening remain TODOs.
- Admin Console uses the registry for reads only; write flows stay in the reporting API.

Use this snapshot as the integration surface for upcoming work on the designer canvas, sandbox execution, and scheduling.

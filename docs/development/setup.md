# Local Development Setup

## Prerequisites

- Node.js 20.x and PNPM (`corepack enable pnpm`) 
- Docker Engine + Docker Compose 
- PostgreSQL client tools (optional, for manual inspection)

## First Run

```bash
pnpm install
pnpm --filter @jira-plus-plus/api prisma migrate dev
pnpm --filter @jira-plus-plus/api dev
pnpm --filter @jira-plus-plus/web dev
```

For the full stack, start the infrastructure compose file:

```bash
docker compose -f infra/docker-compose.yml up postgres temporal temporal-ui
```

### Full-stack dev shortcut

```bash
pnpm start   # generates Prisma clients, builds reporting packages, brings up Docker, runs all dev servers
# ... Ctrl+C when finished ...
pnpm stop    # shuts down the docker stack (safe to run even if already stopped)
```

### Reporting API quick start

Milestone A adds a dedicated reporting backend. Run it locally with:

```bash
pnpm --filter @apps/reporting-api prisma generate
pnpm dev:reporting          # GraphQL API on http://localhost:4002
pnpm dev:reporting:worker   # (optional) Temporal worker for async execution
```

The API reads dataset metadata from `configs/reporting/catalog.json`; override
the location via `REPORTING_CATALOG_PATH`.

### Metadata API quick start

The metadata service federates dataset/catalog definitions for both the designer
and the reporting API. Start it alongside the rest of the stack:

```bash
pnpm prisma:generate:metadata
pnpm migrate:metadata
pnpm --filter @apps/metadata-api dev   # GraphQL API on http://localhost:4010/graphql
pnpm --filter @apps/metadata-api temporal:worker   # Temporal worker for sourcing jobs
```

The metadata service now expects catalog data to flow through registered
endpoints. Connect a source and trigger a collection run to populate the
catalog. Switch to Postgres by setting `METADATA_DATABASE_URL`; otherwise it
stores JSON manifests under `METADATA_STORE_DIR`.

Spark ingestion / recon jobs can forward fresh catalog snapshots to the same
service by setting `metadata.remote.endpoint` (or the `METADATA_GRAPHQL_ENDPOINT`
env var) before running the Python tooling; the runtime now emits through the
GraphQL metadata emitter.

Once the API is up you can trigger sourcing jobs through the Metadata Console
(UI) which will register endpoints and launch Temporal-managed collectors
under the hood. The CLI utilities remain available for emergency/manual use,
but the supported flow is entirely UI-driven.

### Keycloak & Auth stack

Authentication now relies on a local Keycloak realm so GraphQL requests
carry `tenant_id`, `project_id`, and role claims. Bring the auth stack up
with:

```bash
scripts/start-keycloak.sh          # spins up Postgres + Keycloak on http://localhost:8081
scripts/test-keycloak.sh           # fetches a token for the seeded dev user
```

Shut it down with `scripts/stop-keycloak.sh`. The imported realm lives under
`infra/keycloak/realm-nucleus.json` and exposes a confidential client
`jira-plus-plus` (secret `change-me`) plus a sample user
`dev-writer/password`. Override any of the defaults via the `KEYCLOAK_*`
variables in `.env`.

When the metadata API is running you can verify auth end-to-end by pairing
`scripts/test-keycloak.sh` with a GraphQL call:

```bash
TOKEN=$(scripts/test-keycloak.sh)
curl -s -H "Authorization: Bearer $TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"query":"{ health { status version } }"}' \\
  http://localhost:4010/graphql
```

The response should include `status: "ok"`; a 403 indicates the metadata API
is still running without the Keycloak realm configured.

The web console expects the same configuration at build time. Populate
`VITE_KEYCLOAK_BASE_URL`, `VITE_KEYCLOAK_REALM`, and
`VITE_KEYCLOAK_CLIENT_ID` in your `.env` (or `.env.local`) so Vite injects
them when you run `pnpm dev`.

## Test Strategy

- **Unit tests**: `pnpm --filter @jira-plus-plus/* test -- --run` for the package you touch.
- **Local E2E**: `./scripts/run-e2e-local.sh` (invoked automatically by the pre-push hook, wraps `pnpm e2e:run`).
- **Live E2E**: `./scripts/run-e2e-live.sh` after the release hits UAT
  (`https://app.jira-plus-plus.in`).

`pnpm verify` executes `scripts/verify.sh`, which installs deps, lints,
typechecks, runs tests, and builds Docker images. Make it part of your
workflow before pushing changes.

## Git Hooks

Copy the provided sample pre-commit hook:

```bash
cp .github/hooks/pre-commit.sample .git/hooks/pre-commit
chmod +x .git/hooks/pre-commit
```

Now every commit runs `pnpm verify` automatically.

To install both the commit and push hooks in one go:

```bash
pnpm hooks
```

The pre-push hook blocks direct commits on `main`, nudging you back to the PR flow.

## Environment Variables

- `apps/web/.env.development` targets the local API (`http://localhost:4000`).
- `.env.example` is the canonical template for new developers.
- `VITE_APP_BRAND` tunes the UI copy per app (set to `Jira++ Console` for the Jira UI, `Nucleus Metadata Console` for the designer).
- The designer runs on its own dev port (`VITE_DESIGNER_DEV_PORT`, defaults to 5176) so it no longer collides with the Jira++ dev server on 5175.
- Never commit real secrets; use `infra/.env.template` to document runtime
  expectations.
- UAT/production deployments require SMTP credentials
  (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USERNAME`, `SMTP_PASSWORD`, `SMTP_SECURE`,
  `SMTP_FROM_EMAIL`) so invitation and notification email channels work.
- Reporting integrations look for `REPORTING_API_ENDPOINT` (GraphQL URL for the reporting service) and an optional `REPORTING_API_TENANT_ID`. Leave them unset to disable reporting features locally.
- The designer and reporting catalog default to the file manifest, but set
  `METADATA_CLIENT_MODE=remote` plus `METADATA_GRAPHQL_ENDPOINT` to point them at
  the metadata service. Provide `METADATA_DEFAULT_PROJECT` to control the
  partition that ingestion/recon workflows emit into, and `METADATA_SEED_MANIFEST`
  when you want a different bootstrap dataset.

Refer to `specs/deployment/plan.md` and `specs/deployment/ci-cd.md` for the
deployment story and branching conventions.

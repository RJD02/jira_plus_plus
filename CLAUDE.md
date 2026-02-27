# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Jira++ is an AI-powered Jira enhancement platform. It syncs data from Jira Cloud, generates AI-driven insights/narratives/summaries via LLMs, and presents them through a React dashboard with role-based access (ADMIN, MANAGER, USER).

## Monorepo Structure

pnpm 10.18+ monorepo with workspaces in `apps/*` and `packages/*`.

**Apps:**
- `apps/api` — Apollo GraphQL server (Node.js, ESM, TypeScript). Entry: `src/index.ts`. Resolvers: `src/resolvers.ts`. Auth: `src/auth.ts`.
- `apps/jira-plus-plus` — React 18 + Vite + Tailwind CSS 3 frontend. Uses Apollo Client, React Router 6, Keycloak.js.

**Key packages:**
- `@platform/cdm` — Prisma ORM schema + migrations (`packages/cdm/prisma/schema.prisma`). 40+ multi-tenant models.
- `@platform/llm-core-runtime` — Vendor-neutral LLM skill execution (OpenAI, Anthropic, Ollama with fallback chain). YAML skill manifests + Zod schemas.
- `@reporting/*` — Reporting catalog, registry, UI SDK, Temporal workflows, sandbox.
- `@metadata/*` — Metadata service core + client.

**TypeScript path aliases** (defined in `tsconfig.base.json`): `@platform/cdm`, `@platform/clients`, `@metadata/*`, `@reporting/*`.

## Common Commands

```bash
# Install & setup
pnpm install
pnpm prisma:generate          # Generate Prisma client (required after schema changes)
pnpm migrate:dev               # Run migrations in dev (creates migration files)
pnpm migrate                   # Deploy existing migrations

# Development
pnpm dev:api-stack:workers     # API + Temporal worker (concurrently)
pnpm dev:web                   # Vite dev server for frontend
pnpm dev:stack                 # API + web together
pnpm start                     # Full stack: infra + core + web

# Infrastructure
pnpm db:up                     # Start Postgres + MinIO + NATS + local-llm
pnpm stack:up                  # Start Postgres + Temporal + Traefik
pnpm keycloak:start            # Start Keycloak (separate compose)

# Testing
pnpm test                      # Unit tests (web app via Vitest)
pnpm test:all                  # Unit tests across all apps
pnpm --filter @jira-plus-plus/api test   # API unit tests only
pnpm e2e:run                   # Playwright E2E tests
pnpm e2e:open                  # Playwright interactive UI

# Quality
pnpm lint                      # ESLint (web app)
pnpm lint:all                  # ESLint all apps
pnpm typecheck                 # TypeScript check all apps
pnpm format                    # Prettier format all apps
pnpm verify                    # Full CI: install, generate, lint, typecheck, test, docker build
```

## Testing

- **Unit tests**: Vitest. Run via `scripts/run-vitest.mjs` which enforces `--run --passWithNoTests`.
  - API tests: `apps/api/src/__tests__/`
  - Web tests: `apps/jira-plus-plus/src/**/__tests__/`
- **E2E tests**: Playwright (Chromium, headless). Config: `playwright.config.ts`. Tests in `tests/` root directory. 180s timeout.

## Architecture Details

**Auth flow**: Keycloak (OAuth2/OIDC) → JWT validated via JWKS on API side (`src/auth.ts`). Session tokens signed with `SESSION_SECRET` (HS256). Credentials encrypted with `ENCRYPTION_SECRET`. Frontend uses `keycloak-js` with token injection into Apollo Client.

**Data sync**: Jira Cloud REST API client (`src/jira-client.ts`) → Temporal workflows (`src/temporal/workflows/`) for durable sync, insight refresh, narrative generation, and daily summary automation.

**AI pipeline**: YAML skill definitions in `apps/api/src/llm/skills/` → `@platform/llm-core-runtime` SkillRegistry/SkillExecutor → model adapters (OpenAI/Anthropic/Ollama). All calls traced to `LlmSkillTrace` table.

**GraphQL**: Single resolvers file at `apps/api/src/resolvers.ts` (~1900 lines). Custom scalars: DateTime, Date, JSON.

**Multi-tenancy**: All database models link to `Tenant`. Enforced at the Prisma query level.

## Code Style

- Prettier: single quotes, semicolons, 100 char width, trailing commas
- ESM throughout (`"type": "module"` in API)
- TypeScript strict mode, target ES2022
- API uses `tsx` for dev, `tsc` for production build

## Infrastructure

- PostgreSQL 15 with pgvector extension
- Temporal 1.20+ for durable workflows (task queue: `jira-sync`)
- Keycloak 23 for auth (realm: `nucleus`, client: `jira-plus-plus`)
- Traefik for reverse proxy/TLS
- MinIO for S3-compatible object storage

## Environment

Copy `.env.example` to `.env` and `apps/api/.env.example` to `apps/api/.env`. Critical vars: `DATABASE_URL`, `SESSION_SECRET`, `ENCRYPTION_SECRET`, Keycloak config, LLM API keys. Frontend env vars are prefixed with `VITE_`.

## AI-SDLC Workflow

The project uses a structured AI-driven SDLC documented in `.ai-sdlc/agent.md`. Feature work and debugging follow a folder-based lifecycle:
`.ai-sdlc/stories/<date>_<slug>/` or `.ai-sdlc/debugging/<date>_<slug>/` with phases: intent → analysis → plan → approval → execution → audit.

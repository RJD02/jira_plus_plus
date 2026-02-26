# Jira++ — Consolidated Project Summary

## What is Jira++?

**Jira++** is an **AI-powered Jira enhancement platform** that sits on top of Jira Cloud/Server. It syncs project data in real-time and generates intelligent insights, daily summaries, narratives, and team health analytics — empowering managers, team members, and executives with actionable intelligence.

---

## Key Features

### For Team Members (Focus Board)

- Personal work dashboard with assigned issues, blockers, and recent activity
- AI-generated daily summaries (yesterday's work + today's plan)
- Issue-level insights with sentiment analysis, risk flags, and escalation signals
- Worklog timeline and collaboration notes

### For Managers (Manager Dashboard)

- Sprint-level KPIs: velocity, completion rates, risk analysis
- Team health metrics: active users, idle rate, blocker rate
- AI-generated executive briefs and highlights
- Structured performance reviews tied to real project data

### For Executives / Scrum Masters (Scrum Board)

- Project daily summaries and per-user narratives
- Per-ticket analysis with participant info
- High-level project narratives with executive briefs
- Newsletter export (PDF / Slack)

### Admin Console

- User management with RBAC (ADMIN, MANAGER, USER)
- Jira site registration (multiple instances)
- Project sync configuration with automation schedules
- Tracked user management and sync health monitoring

---

## Full Tech Stack

| Layer                | Technology                                                                                      |
| -------------------- | ----------------------------------------------------------------------------------------------- |
| **Frontend**         | React 18, TypeScript, Vite, Tailwind CSS, Apollo Client, React Router, Lucide icons             |
| **Backend**          | Node.js 20+, Apollo GraphQL Server 4, TypeScript (ESM)                                         |
| **Database**         | PostgreSQL 15 + pgvector, Prisma ORM (40+ tables, multi-tenant)                                |
| **Auth**             | Keycloak (OAuth2/OIDC), JWT, bcryptjs                                                          |
| **Workflow Engine**  | Temporal (durable distributed workflows)                                                        |
| **AI/LLM**          | OpenAI (GPT-4o-mini), Anthropic (Claude 3 Haiku), Ollama (Mistral) — vendor-neutral skill runtime |
| **Email**            | Nodemailer + Resend API                                                                         |
| **Infrastructure**   | Docker Compose, Traefik (reverse proxy + TLS), MinIO (S3-compatible)                           |
| **Testing**          | Cypress, Playwright, Vitest                                                                     |
| **Monorepo**         | pnpm workspaces                                                                                 |
| **Observability**    | Prometheus metrics, LLM execution traces in DB                                                  |

---

## Where & How AI Agents Are Used

### 1. Skill-Based LLM Runtime (`packages/llm-core-runtime/`)

A **vendor-neutral skill execution framework** with:

- **SkillRegistry** — Skills are YAML manifests with model specs, input/output Zod schemas, and caching rules
- **SkillExecutor** — Orchestrates invocation with provider selection, template rendering, output parsing, tracing, and Prometheus metrics
- **Model Adapters** — Pluggable adapters for OpenAI, Anthropic, and Ollama with automatic fallback (`openai → anthropic → ollama`)

### 2. AI Skills (`apps/api/src/llm/skills/`)

| Skill                  | Purpose                                                                              |
| ---------------------- | ------------------------------------------------------------------------------------ |
| `issue-insight.v1`     | Analyzes individual issues for sentiment, escalation risk, signals, and status progression |
| `project-narrative.v1` | Generates executive-level project health summaries                                   |
| `user-narrative.v1`    | Generates per-user daily narratives (accomplishments, blockers, focus areas)          |

### 3. Temporal Workflows (Durable AI Orchestration)

| Workflow                              | What It Does                                                                            |
| ------------------------------------- | --------------------------------------------------------------------------------------- |
| `refreshIssueInsightsWorkflow`        | Batch-processes issues through the issue-insight skill, stores sentiment + risk signals  |
| `refreshNarrativesWorkflow`           | Generates project + user narratives on schedule (3x/day default) or on-demand           |
| `projectSummaryAutomationWorkflow`    | Orchestrates full daily summary generation across projects and users                    |
| `syncProjectWorkflow`                 | Periodic Jira data ingestion (issues, comments, worklogs)                               |

### 4. AI-Driven SDLC Workflow (`.ai-sdlc/`)

A **folder-driven agent collaboration workflow** documented in `.ai-sdlc/agent.md`:

- Structured lifecycle: `intent → analysis → plan → approval → execute → audit → loop`
- Each story lives in its own folder with structured markdown artifacts
- Designed for AI agent + human collaboration on feature development

### 5. LLM Observability

Every AI call is traced in the `LLMSkillTrace` database table with: input/output hashes, token counts, latency, model/provider used, and cache hit status.

---

## Architecture Highlights

- **Monorepo** with `apps/` (api, web) and `packages/` (cdm, llm-core-runtime, metadata-core, reporting-*)
- **Multi-tenancy by design** — `tenantId` on all tables with hard isolation in queries
- **GraphQL API** — 60+ queries, 30+ mutations, 120+ types
- **Durable workflows** via Temporal ensure AI tasks are retryable, auditable, and survive failures
- **Pluggable LLM providers** — swap models via environment variables without code changes
- **Enterprise-ready** — Keycloak SSO, Traefik TLS, Docker multi-stage builds, Kubernetes-ready images

---

## Project Structure

```
jira-plus-plus/
├── apps/
│   ├── api/                          # Apollo GraphQL backend
│   │   ├── src/
│   │   │   ├── llm/                  # AI skill runtime
│   │   │   │   ├── skills/           # Skill manifests & templates
│   │   │   │   ├── runtime.ts        # Executor orchestration
│   │   │   │   └── types.ts          # Skill input/output types
│   │   │   ├── temporal/             # Workflow definitions & activities
│   │   │   │   ├── workflows/        # Durable workflows
│   │   │   │   ├── activities/       # Sync, narrative, insight tasks
│   │   │   │   └── worker.ts         # Worker bootstrap
│   │   │   ├── services/             # Domain business logic
│   │   │   │   ├── insights/         # Issue insight computation
│   │   │   │   ├── narratives/       # Narrative generation & queueing
│   │   │   │   ├── communication/    # Email/invite channels
│   │   │   │   ├── newsletter/       # Newsletter generation
│   │   │   │   └── telemetry/        # Sync metrics
│   │   │   ├── jira-client.ts        # Jira REST API integration
│   │   │   ├── auth.ts               # JWT + password hashing
│   │   │   ├── resolvers.ts          # GraphQL resolver implementations
│   │   │   ├── typeDefs.ts           # GraphQL schema
│   │   │   └── env.ts                # Environment validation (Zod)
│   │   └── Dockerfile
│   │
│   └── jira-plus-plus/               # React/Vite frontend
│       ├── src/
│       │   ├── pages/                # HomePage, AdminConsole, Manager, Scrum, Focus, Reports
│       │   ├── components/           # scrum/, manager/, focus/, ui/
│       │   ├── lib/                  # Apollo client, auth, API client
│       │   └── providers/            # AuthProvider (Keycloak)
│       └── vite.config.ts
│
├── packages/
│   ├── cdm/                          # Core Data Model (Prisma schema, 40+ tables)
│   ├── llm-core-runtime/             # Vendor-neutral LLM framework
│   ├── metadata-core/                # Metadata endpoint management
│   ├── metadata-client/              # Metadata client library
│   ├── reporting-catalog/            # Report definitions
│   ├── reporting-registry/           # Report registry
│   ├── reporting-ui-sdk/             # Report UI components
│   └── reporting-temporal/           # Reporting workflow support
│
├── infra/
│   ├── docker-compose.yml            # Main stack (postgres, temporal, api, web, traefik)
│   ├── keycloak/                     # Keycloak + OIDC realm config
│   └── traefik/                      # Reverse proxy config
│
├── cypress/                          # E2E tests (Cypress)
├── tests/                            # Integration/auth tests (Playwright)
├── .ai-sdlc/                         # AI SDLC workflow documentation
├── scripts/                          # Dev/CI helper scripts
├── docs/                             # Development & reporting docs
└── configs/                          # Report catalog definitions
```

---

## Authentication & Security

- **Keycloak** for OAuth2/OIDC team authentication with realm `nucleus`
- **JWT tokens** signed with `SESSION_SECRET`, include user ID + role
- **Local admin bootstrap** via `ADMIN_EMAIL` / `ADMIN_PASSWORD` environment variables
- **bcryptjs** for stored credential hashing
- **Role-based access control**: ADMIN, MANAGER, USER with `requireAdmin()` guards
- **Tenant isolation**: All queries scoped via `ctx.withTenant()`

---

## Developer Workflow

```bash
pnpm install                           # Install dependencies
pnpm start                             # Full stack (infra + api + web)
pnpm dev                               # Frontend only
pnpm --filter @jira-plus-plus/api dev  # API only
pnpm verify                            # Lint + typecheck + test + build
```

- **Pre-push hooks** block direct commits to main
- **E2E tests** via Cypress (SPA) and Playwright (browser matrix)
- **Unit tests** via Vitest

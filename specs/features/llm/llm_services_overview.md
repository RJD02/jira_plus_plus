# LLM Services Overview

## Product Capabilities

| Feature | Where Users See It | Triggering Events | Key Benefits |
| --- | --- | --- | --- |
| **Daily Scrum Summaries** | `ScrumPage` → AI Summary side panel (`AISummaryPanel`/`AISummaryDrawer`) | Automatic: nightly Temporal sync<br />On demand: “Regenerate” button per teammate | Rapid stand-up prep, highlights blockers, tracks focus areas |
| **Hierarchical Summaries (Task → User → Project)** | Feeds `AISummaryPanel`, future dashboards (`specs/features/daily_scrum_board/hierarchical_ai_summary.md`) | Generated during `processInsightQueue` batches | Roll-up narrative + metrics without manual note taking |
| **Issue Insights Overlay** | Scrum board → “LLM Insights” overlay (`IssueInsightsOverlay`) | Automatic on issue sync<br />On demand when user opens overlay | Condenses history, sentiment, escalation risk per issue |
| **LLM Trace Metrics** | Admin dashboards (Prometheus/Grafana planned) | Every skill run | Cost & latency tracking, model observability |

## Architecture at a Glance

```
Jira Sync (Temporal workflow)
   └─ upsertIssueFromDetail → enqueueInsightRefresh(issue)

Insight Refresh Workflow (`refreshIssueInsightsWorkflow`)
   └─ `processInsightQueue` activity
        ├─ claimInsightRefreshBatch (locks issues)
        ├─ ensureIssueInsights / hierarchicalSummaryService
        │    ├─ SkillRegistry (YAML manifest)
        │    ├─ SkillExecutor (schema validation + adapter)
        │    ├─ Provider adapters (OpenAI, Anthropic, Ollama)
        │    └─ TraceStore (persists usage + cache)
        └─ mark success / failure, releases lock

Frontend Queries (`ScrumPage`)
   ├─ `DAILY_SUMMARIES_QUERY` → user summaries + metrics
   ├─ `PROJECT_DAILY_SUMMARIES_QUERY` → project snapshots + task rollups
   └─ Issue insights lazy query (`ISSUE_INSIGHTS_QUERY`)
```

### Data Stores

* `IssueInsight` + `IssueInsightSnapshot` – persisted narratives, sentiment, escalation score, raw provider metadata.
* `TaskSummarySnapshot` / `UserSummarySnapshot` / `ProjectSummarySnapshot` – hierarchical rollups powering AI Summary drawer.
* `LlmSkillTrace` – latency, usage, cache hits for every skill invocation.

## Workflow Details

### 1. Sync & Queue (Fast Path)

* `syncProjectWorkflow` finishes ingesting Jira issues and **enqueues** each touched issue for LLM processing via `enqueueInsightRefresh`.
* Queue fields on `Issue` (`needsInsightRefresh`, `lockedUntil`, attempts) ensure deterministic retry handling.
* Sync stays IO-bound; LLM costs happen later.

### 2. Background Processing (Batch)

* `refreshIssueInsightsWorkflow` can be scheduled (Temporal cron) or triggered manually.
* `processInsightQueue` claims a batch, runs skills, and writes success/failure markers.
* Failures back off via `insightRefreshLockedUntil`; metrics logged via `TraceStore` and Prometheus hooks.

### 3. Frontend Consumption

* `ScrumPage` loads latest snapshots per project and maps payloads into the AI Summary panel.
* Regeneration button calls a mutation that re-enqueues the user’s daily summary run; once the batch processor re-computes, Apollo cache updates and the panel refreshes.
* Issue overlay fetches `issueInsights` lazily; results reuse cached snapshots when available (hash + provider matching).

## Running the Services

| Task | Command |
| --- | --- |
| Build & boot everything (install, Prisma, DB, migrate, dev servers) | `pnpm start` |
| Apply Prisma migrations only | `pnpm migrate` |
| Generate Prisma client (after schema change) | `pnpm prisma:generate` |
| Temporal worker (handles sync + insight activities) | `pnpm -C apps/api temporal:worker` *(see `package.json` in `apps/api`)* |
| API dev server (GraphQL + REST + Temporal host) | `pnpm -C apps/api dev` |

### On-Demand Skill Runs

* **UI Regenerate** – adds job to queue; background worker processes within next batch.
* **Manual Trigger** – developers can call `requestInsightRefreshWorkflow({ projectId })` via Temporal CLI or new admin tool to push urgent recalculations.
* **Cache Control** – `allowCache` flag lets queue avoid re-invoking models if hash + provider unchanged.

## Benefits

* **Predictable Costs** – batching + caching keep token usage under control; queue stats expose pending volume.
* **Operational Visibility** – Trace logs, lock counters, and Prometheus metrics simplify debugging (slow skills, provider outages).
* **User Trust** – schemas enforce consistent narrative structure; UI shows provenance (timestamp, supporting tasks).
* **Extensibility** – new skills drop in via YAML manifest; adapters abstract provider differences (OpenAI/Anthropic/Ollama/local).
* **Separation of Concerns** – Jira ingestion remains fast; LLM summarisation scales independently and can be throttled or paused without blocking sync.

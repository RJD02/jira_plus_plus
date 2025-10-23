# Text Analytics Insights — Technical Spec
_Last updated: 2025-10-22 • Author: Codex (assistant)_

## Architecture Overview
- **Goal**: Generate lightweight insights (summary, sentiment/tone, escalation heuristics, notable signals) for a Jira issue and expose them via `/api/tickets/:id/insights`.
- **Flow**  
  1. Temporal sync finishes/upserts an issue → enqueue `IssueInsightsJob`.  
  2. Job loads latest issue snapshot (comments, worklogs, links, cached insight) from CDM.  
  3. Derive features:
     - Rule-based summary (issue title + key sentence extraction).  
     - Sentiment & tone via pluggable adapters (`OpenAI`, `LocalVader`).  
     - Escalation score from heuristics (priority, age, SLA proximity, keywords, unresolved blockers).  
     - Signals array (timeline anomalies, negative sentiment, repeated reopen).  
  4. Persist `IssueInsight` record + vector timestamp hash.  
  5. REST controller reads cached record (regenerate if stale or forced).  
  6. Insights surfaced in UI + API.
- **Caching / Reuse**:  
  - Store `hash(issue.id + updatedAt + key fields)` to skip recompute when nothing changed.  
  - Keep adapter outputs by provider to prevent double-billing (OpenAI).  
  - Background recompute triggered on issue change, manual refresh optional.

## Data Model & Schema Changes
Add new table in CDM:

```
model IssueInsight {
  id                String   @id @default(uuid())
  tenantId          String   @default("dev")
  issueId           String
  providerSummary   Json?      // { provider: 'rule-based', summary: string, confidence: number }
  sentiments        Json?      // [{ provider, sentiment, tone, score }]
  escalationScore   Float?
  signals           Json?      // array of { type, label, severity, metadata }
  lastIssueHash     String     // hash of fields used for scoring
  computedAt        DateTime   @default(now())
  expiresAt         DateTime?  // TTL in case policies require refresh
  metadata          Json?
  issue             Issue      @relation(fields: [issueId], references: [id])
  tenant            Tenant     @relation(fields: [tenantId], references: [id])

  @@unique([tenantId, issueId])
  @@index([tenantId, computedAt])
}
```

Additional columns in `Issue` (CDM already updated):
- `assigneeChangedAt`, `startedAt`, `resolvedAt`, `statusCategory`, `browseUrl`, `reporterId`, `parentIssueId`, `dueDate`. Current ingestion populates these.

API schema (`apps/api/prisma/schema.prisma`) mirrors `IssueInsight` for GraphQL/REST usage.

Migration steps:
1. Create `IssueInsight` table + indexes.  
2. Backfill existing issues with stub entries (optional background job).  
3. Update Prisma client.

## API Contracts
### GraphQL (primary surface)
```graphql
query IssueInsights(
  $issueId: ID!,
  $provider: InsightsProvider = AUTO,
  $refresh: Boolean = false
) {
  issueInsights(issueId: $issueId, provider: $provider, refresh: $refresh) {
    issueId
    summary { text provider confidence }
    sentiment { label score tones provider }
    escalateScore
    signals { type severity detail metadata }
    computedAt
    expiresAt
    providerMetadata
  }
}
```
`InsightsProvider`: `AUTO | OPENAI | LOCAL`. Resolver: return cached insight, enqueue recompute when hash mismatches or `refresh=true`.

### REST (optional parity)
`GET /api/tickets/:id/insights?provider=openai|local|auto&refresh=true|false` returns identical JSON for integrations unable to consume GraphQL.

### Background job contract
`IssueInsightsJob` payload:
```json
{
  "tenantId": "dev",
  "issueId": "uuid",
  "updatedAt": "2025-10-22T11:39:00Z",
  "force": false
}
```

Job logic:
- Recompute when `force` or `lastIssueHash != currentHash`.
- Write output & telemetry; emit metric `insights.compute.duration_ms`, counter for provider usage.

## External Integrations
- **OpenAI Adapter** (`text-analytics/openai.ts`):  
  - Model: `gpt-4o-mini` (configurable).  
  - Prompt template summarises issue fields + recent comment bullets.  
  - Respect rate limits; exponential backoff.  
- **Local Adapter** (`text-analytics/local-llm.ts`):  
  - Runs a containerised lightweight model (`mistral-7b-instruct` or `phi-3-mini`) via `llama.cpp` / `llm-server`.  
  - Provides summary + sentiment/tone in a single pass; no external network.  
  - Falls back to lightweight lexicon heuristics only if the local model is offline.
- Adapter interface:
```ts
interface InsightAdapter {
  summarize(payload: IssueContext): Promise<{ summary: string; confidence: number }>;
  analyzeSentiment(payload: IssueContext): Promise<{ label: string; score: number; tones: string[] }>;
}
```
Provider selected via config (`INSIGHTS_PROVIDER=openai|local|auto`).  
Adapters can enrich `signals` and leverage issue links + changelog history.

## Signals Catalogue
| Signal Id | Description | Inputs | Severity Heuristic |
|-----------|-------------|--------|--------------------|
| `negative_sentiment` | Recent comments trend negative | LLM sentiment, comment timestamps | score < -0.4 → medium, < -0.7 → high |
| `escalation_keywords` | Keywords (“escalate”, “urgent”, “blocker”) | LLM keyword extraction | ≥2 keywords in last 24h → high |
| `sla_risk` | SLA nearing breach | dueDate, priority, startedAt | Due < 6h & unresolved P1/P2 → high |
| `stalled_progress` | No work since N days | jiraUpdatedAt, worklogs | >3 days inactivity on high priority → medium/high |
| `reopened_multiple` | Frequent reopen cycles | changelog history | reopen count ≥2 → medium, ≥4 → high |
| `linked_blocker` | Blocked by critical linked issue | IssueLink graph, linked status/priority | unresolved linked blocker P1 → high |
| `dependency_cascade` | Many unresolved dependencies | IssueLink breadth | ≥3 outward unresolved → medium |
| `resolution_regression` | Resolved then reopened | status history, statusCategory | resolvedAt exists & statusCategory ≠ “Done” → medium |
| `assignment_churn` | Many assignee changes | changelog, assigneeChangedAt | ≥3 changes within 7 days → medium |
| `long_running` | Age exceeds baseline | createdAt, SLA baseline | Age > 2× SLA threshold → medium |
| `positive_feedback` | Positive sentiment (context) | LLM | label “positive” & score > 0.6 (positive signal) |

Each signal returns `metadata` (linked issue keys, timestamps, counts) for UI tooltips.

## Performance & Capacity Considerations
- Cache results in DB; recompute only when issue hash changes.  
- Limit history for summary to latest N comments (config default 10).  
- Batch job queue to avoid bursting LLM calls; concurrency per provider (OpenAI -> 5).  
- Store per-tenant provider usage for billing.

## Security, Privacy, Compliance
- Scrub secrets before sending to external adapters (strip tokens/passwords).  
- Feature flag ensures OpenAI disabled for tenants requiring on-prem only (fallback to local).  
- Log minimal context; redact personally identifiable info in telemetry.  
- Respect data retention: `IssueInsight.metadata` only stores non-sensitive references (IDs, link types).  
- Document/monitor OpenAI usage for audit; allow tenants to opt out.

## Error Handling
- If adapter fails: mark `signals` with `provider_error`, fall back to rule-based summary & lexicon sentiment.  
- Retries (max 3) with jitter; on repeated failure, record in `IssueInsight` with `escalate_score` set to heuristic only.  
- API returns cached insight even if latest recompute failed (with `signals` entry describing staleness).  
- Reference shared error handling patterns when logging/raising to UI.

## Risks & Mitigations
| Risk | Mitigation |
|------|------------|
| OpenAI latency / cost spikes | Cache results; support `local` provider; add breaker when monthly quota reached. |
| Temporal backlog due to expensive jobs | Limit job requeue frequency; shard queue; expose command to recompute on-demand. |
| Heuristics misfire (false escalations) | Log `escalate_score` components; add admin tunables for thresholds; review in pilot. |
| Data drift (new Jira fields not hashed) | Centralize `issueHash(issue)` helper; add unit tests verifying fields accounted for. |
| Sentiment accuracy for multilingual | Detect locale; fallback to language-specific lexicon or mark `signals` requiring manual review. |

## Next Steps
1. Implement CDM migration + Prisma update (done).  
2. Build adapters & job orchestration.  
3. Expose REST endpoint + docs.  
4. Add observability (metrics, dashboards).  
5. Roll out tenant by tenant with feature flag `insights.enabled`.

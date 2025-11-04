# Feature: Hierarchical AI Narratives for Daily Scrum

## Purpose
Tell a coherent cross-level story of progress every day: where the project stands, how the team collaborated, and what needs attention next. Summaries must cascade from workspace → project → user → task → moment, remain easy to audit, and stay inexpensive to regenerate.

## Goals
- Produce crisp, human-readable narratives instead of task dumps.
- Allow leads to drill from high-level storyline to supporting artefacts without leaving the view.
- Capture collaboration, sentiment, and pending decisions alongside task movement.
- Persist snapshots so temporal comparisons (yesterday, last week) are effortless.
- Keep generation deterministic, cache-friendly, and under 10s end-to-end per project.

## Personas
- **Delivery / Engineering Manager:** needs an executive view of project health, collaboration, and systemic risks.
- **Technical Lead:** wants to spotlight blockers, unassigned work, and idle contributors before stand-up.
- **Individual Contributor:** checks that the AI captured their story accurately and can regenerate when context changes.
- **Program / Exec Stakeholder:** scans the workspace pulse to prioritise escalations across projects.

---

## Story Stack

| Level | Narrative Focus | Key Questions | Primary Consumers |
| --- | --- | --- | --- |
| Workspace Pulse | Organisational tone across projects | Which initiatives moved? Where are systemic risks? | Execs, Delivery Leads |
| Project Narrative | Sprint/story trajectory & collaboration | Are we on track? Who partnered? What needs action? | EM / PM |
| User Chapter | Personal momentum & responsibilities | What did I move? Who am I waiting on? | ICs, Leads |
| Task Beat | Work item status & timeline | Where is this issue now? What happened recently? | Everyone drilling down |
| Moment Snapshot | Raw events (worklogs, comments) | What exactly occurred? | Diagnostics |

Each layer references the one below it so viewers can drill into detail on demand.

---

## Content Contracts

### Task Beat (`TaskSummarySnapshot.payload`)
- `headline` – 1 sentence status (“Load tests stabilised, PR pending review”).
- `status` – `BLOCKED | IN_PROGRESS | IN_REVIEW | DONE | STALLED`.
- `timeline[]` – chronological events: `{ at, actorId?, label }`.
- `participants[]` – `{ userId?, contributionMinutes, commentCount, waitingOn }`.
- `riskFlags[]` – e.g., `dependency`, `unassigned_regression`, `stale_5d`.
- `nextStep` – concise future action.
- `linkedResources[]` – PRs, docs, key related issues.
- `sentiment` – aggregated from Issue Insight for quick reuse.

### User Chapter (`UserSummarySnapshot.payload`)
- `headline` – outcome statement anchored on project/stakeholder impact.
- `progressTimeline[]` – curated beats the user influenced (links task snapshot timeline entries).
- `collaborationNotes[]` – `{ partnerUserId, note }` capturing reviews/hand-offs.
- `pendingDecisions` – split into `ownedByUser[]` and `waitingOnOthers[]`.
- `mood` – `{ label, score, rationale }` synthesised from tasks touched.
- `accomplishments[]`, `inFlight[]`, `blockers[]` – reference task IDs but framed narratively.
- `nextMoves[]` – forward-looking focus lines tied to sprint goals.
- `activityMetrics` – `{ worklogMinutes, tasksTouched, reviewsGiven, blockers }`.

### Project Narrative (`ProjectSummarySnapshot.payload`)
- `opening` – 2–3 sentences summarising momentum, sentiment, and risk.
- `chapterHighlights[]` – notable progress threads linking user + task + outcome.
- `teamHealthSnapshot.offlineUsers` – teammates marked unavailable for the stand-up window.
- `riskOutlook` – structured data: blocker surge, idle rate, unassigned regressions, dependency alerts.
- `callsToAction[]` – next steps for leads (assign reviewer, escalate dependency).
- `unassignedWatchlist[]` – tasks that lost owners or went outside tracked cohort.
- `teamHealthSnapshot` – KPIs (active %, idle %, worklog totals, sentiment trend).
- `workspaceContext` – optional pointer summarising how the project fits the broader pulse.

### Workspace Pulse (future extension)
- Derived from project narratives: `workspaceBrief`, `spotlightProjects`, `systemicRisks`, `capacityOutlook`.

---

## Targeting Strategy (Cost Control)
- **Rolling window (7d):** for a snapshot on day `D`, inspect events from `D-6 … D`. If no changes in that window, reuse the previous payload (hash match) and skip LLM calls.
- **Daily cadence:** each day persists a new snapshot reflecting “today’s story” plus any relevant events from the rolling window; historic snapshots are never mutated.
- **Always include:** blockers, unassigned regressions, sprint-goal issues, items with recent negative sentiment—even if primary activity was earlier.
- **Workspace aggregation:** recompute only when ≥1 project narrative changed or sentiment delta exceeds threshold.
- **Moment pruning:** keep top N impactful events per task (status changes, large worklogs, blocker comments).
- **Caching:** hash task event bundle so LLM calls are skipped when inputs unchanged.

---

## Generation Pipeline
1. **Trigger:** daily cadence (per project timezone), manual regenerate, or post-sync hooks.
2. **Collect:** fetch Jira events, worklogs, comments, linked PR metadata since last run; load previous snapshots for diffing.
3. **Task Beat:** compile deterministic timeline + metadata; optional lightweight LLM call for `headline` + `nextStep`; reuse Issue Insight sentiment.
4. **User Chapter:** compose from task payloads; small LLM prompt permitted for `headline` and `mood` rationales; ensure delta phrasing using previous snapshot.
5. **Project Narrative:** rule-based aggregation + optional prompt when multiple collaboration threads need synthesis. Leverage cached user snapshots when no new activity within the window.
6. **Workspace Pulse:** aggregate across projects (optional phase).
7. **Persist:** transactional write task → user → project snapshots, emit run event.
8. **Cache bust:** invalidate GraphQL caches serving Scrum board and dashboards.

---

## Narrative Generation Workflow (Async Augmentation)
To keep the ingest path deterministic while still delivering rich prose:

1. **Snapshot write** (task → user → project) happens synchronously during the daily run. Snapshots contain structured facts and pull in cached ticket insights when available.
2. **Narrative job enqueue:** once a snapshot is persisted, emit a `NarrativeRequested` event per scope (project, each user). Payload includes snapshot IDs, hashes of the structured input, and the latest insight metadata (issue IDs + insight hash).
3. **Narrative worker:** consumes the queue, checks if a previous narrative exists with the same input hash.  
   - If unchanged, reuse the prior story verbatim.  
   - If different, call the appropriate LLM prompt (project / user) with structured data + curated insight excerpts. Store the generated text, prompt parameters, and model in `NarrativeSnapshot` keyed by `(snapshotId, scope)`.
4. **UI render:** Scrum page and other surfaces load the structured payload immediately. If narrative text is ready, they render it; otherwise they show a “story generating…” placeholder and poll via GraphQL.
5. **On-demand refresh:** UI exposes `regenerateNarrative(scope: PROJECT|USER, snapshotId)` mutation that enqueues a forced re-run (bypassing cache) when a human wants fresher wording.

This mirrors the ticket insight flow: cached outputs by default, asynchronous catch-up, and explicit refresh hooks.

---

## Insight Reuse & Coverage
- Sync pipeline already enqueues issue insight refresh when a tracked teammate touches an issue (worklog, comment, mention).  
- Narrative workers pull the most recent insight text + signals for each referenced task; if insight is missing or stale they surface a “pending insight” chip but still generate the storyline.  
- Backfill or targeted look-back resync reuses existing insights whenever possible; only unseen issues hit the LLM queue.  
- Metrics: insight coverage % per project/day so we can monitor gaps as the backlog drains.

---

## Persona Storylines
Target daily “newsletter” style outputs per persona, all sourced from the same snapshot & narrative store:

| Persona | Surface | Narrative Blocks |
| --- | --- | --- |
| Engineering Manager | Scrum project card + email digest | Project opening, collaboration threads, risk outlook, calls to action |
| Tech Lead | Daily AI drawer tab (“Lead View”) | Top blockers, idle/unassigned spotlight, dependency alerts, key collaborator notes |
| Individual Contributor | User drawer + optional DM/email | Personal headline, accomplishments, pending decisions, “waiting on” list |
| Exec / Program | Workspace pulse dashboard + optional weekly summary | Project leaderboard, systemic risks, mood trend |

Each block references canonical snapshots so numbers match Team Pulse. Prompts emphasise actionable tone (“Today the data platform cleared the backlog, but X dependency is at risk…”) and avoid duplicating raw tables already visible.

---

## Delivery Channels
- **Scrum Page:** immediate consumer; renders structured data instantly and swaps in narratives when ready.  
- **Notifications:** once narratives are generated for the day, schedule emails/slack posts per persona (“Daily Project Brief” to EM, “Your AI Stand-up” to IC). Allow unsubscribe / cadence controls.  
- **Archive:** store HTML/markdown versions alongside snapshots so the newsletter can be regenerated for audits or backfill.

---

## Backfill & Regeneration Strategy
- When running `backfillProjectSummaries`, process each day in chronological order. After writing the structural snapshot, enqueue narrative jobs with `force=false` so they reuse older stories when inputs match.  
- If we tweak prompts or models, run a “narrative backfill” job that re-enqueues existing snapshots with `force=true` to regenerate storytelling without re-ingesting Jira.  
- Insight queue behaves the same: any snapshot referencing a task without insight will enqueue it; once the insight arrives, the next narrative run (manual or scheduled) can refresh the story.

---

## Snapshot Schema (Existing + Additions)
```prisma
model TaskSummarySnapshot {
  id             String   @id @default(uuid())
  tenantId       String   @default("dev")
  projectId      String
  issueId        String
  userId         String?
  summaryDate    DateTime
  runId          String
  payload        Json     // includes timeline, participants, sentiment
  createdAt      DateTime @default(now())

  @@index([tenantId, projectId, summaryDate])
  @@index([tenantId, issueId, summaryDate])
  @@index([tenantId, runId])
}

model UserSummarySnapshot {
  id             String   @id @default(uuid())
  tenantId       String   @default("dev")
  projectId      String
  userId         String?
  summaryDate    DateTime
  runId          String
  taskSummaryIds String[]
  payload        Json     // includes mood, collaborationNotes, pendingDecisions
  createdAt      DateTime @default(now())

  @@unique([tenantId, userId, projectId, runId])
  @@index([tenantId, projectId, summaryDate])
}

model ProjectSummarySnapshot {
  id             String   @id @default(uuid())
  tenantId       String   @default("dev")
  projectId      String
  summaryDate    DateTime
  runId          String
  userSummaryIds String[]
  payload        Json     // includes callsToAction, offlineUsers
  createdAt      DateTime @default(now())

  @@unique([tenantId, projectId, runId])
  @@index([tenantId, projectId, summaryDate])
}
```
Retain snapshots for ≥90 days; consider archival pipeline later.

---

## API / GraphQL Updates
- Extend types to surface new narrative fields:
  ```graphql
  type TaskSummaryPayload {
    headline: String!
    status: TaskSummaryStatus!
    timeline: [TaskTimelineEvent!]!
    participants: [TaskParticipant!]!
    riskFlags: [String!]!
    nextStep: String
    sentiment: SentimentSnapshot
    linkedResources: [LinkedResource!]!
  }
  ```
- Add optional `perspective` argument for queries (e.g., `projectDailySummaries(range:, perspective: "narrative")`) to allow lightweight vs. full payloads.
- Permit regenerate mutations to accept `trackedUserId` if no platform user exists.
- Provide pagination/cursors for date ranges and expose run metadata (`runId`, `generatedAt`, `model`).

---

## UI / UX Concepts
- **Workspace Pulse Dashboard:** cards for each project with tone badge, CTA chips (“Review blockers”, “Celebrate win”).
- **Project Story Panel:** hero card with opening narrative, slider to view previous days, expandable sections for threads and calls to action.
- **User Drawer:** tabs for `Overview`, `Signals`, `Timeline`, `Pending on Me`. Show collaboration chips linking to other users. Regenerate button available if the user or tracked user is mapped.
- **Task Modal:** timeline in centre, participants on side, Issue Insight sentiment + signals integrated at top. “View in Jira” and “Open Insight Overlay” actions.
- **Breadcrumb Drilldown:** Workspace → Project → User → Task → Moment, with breadcrumbs to jump back.
- **Comparisons:** toggle to highlight delta sentences between current and previous snapshot; weekly storyboard view concatenating openings.

---

## Prompting & Guardrails
- Task level uses deterministic structured prompt; retry once on validation failure.
- User & project levels prefer templatized composition; only call LLM when narrative complexity > threshold (e.g., >5 tasks and >2 blockers).
- Enforce factual tone—avoid subjective adjectives unless sourced from sentiment analysis.

---

## Observability & Ops
- Metrics: latency, token usage, validation failures, regeneration counts, sentiment shifts.
- Logs: structured (runId, projectId, summaryDate, level).
- Alerts: consecutive generation failures, spike in blockers or negative sentiment.

---

## Migration Plan
1. Ship schema changes and dual-write to new snapshots alongside existing `DailySummary`.
2. Build summarisation pipeline guarded by feature flag.
3. Update GraphQL + UI to consume new story stack (start with user drawer hybrid view).
4. Backfill last 30–60 days of snapshots for historical context.
5. Enable workspace pulse once project narratives are stable.

---

## Acceptance Criteria
- Project narrative surfaces collaboration threads, mood, and calls to action for the selected date.
- User drawer shows hybrid view (narrative, signals, timeline, pending decisions) and supports regenerate for mapped or tracked users.
- Task modal includes timeline + participants, and ties into Issue Insight sentiment.
- Summaries persist by `runId`; historical comparison highlights deltas without mutating past data.
- Token usage stays within budget thanks to active-window targeting and caching.

# Spec: Temporal Orchestration Platform

## Context & Goal
- Coordinate ingestion, enrichment, and export workflows across tenants using Temporal while enforcing namespace isolation and consistent logging.
- Provide explicit lifecycle semantics for `endpointSyncWorkflow`, including scheduling controls, backoff, and cursor advancement.
- Align orchestration metadata with KV checkpoints, log taxonomy, and Agent house rules.

## Scope
- Temporal namespace configuration and metadata.
- Task queues for TypeScript (`meta-ts`) and Python (`meta-py`) workers.
- Workflow lifecycle definitions, schedules, and manual controls (pause/resume/reschedule/trigger).
- Cursor and advance rules for deterministic replay.
- Backoff policies and log event expectations.

## Namespaces
- Create namespaces per environment (`dev`, `staging`, `prod`) and per workload family (`harvesters`, `backfills`, `experiments`), yielding combinations like `prod.harvesters`.
- Namespace metadata includes:
  - `owner`: team responsible.
  - `contact`: escalation channel.
  - `defaultRetention`: 30 days history for harvesters, 7 days for experiments.
  - `encryption`: KMS key alias referenced in ops runbook.
- Automation validates namespace existence before deployment; missing namespace fails CI.

## Task Queues
- `meta-ts`: TypeScript workers handling API orchestration, GraphQL triggers, and lightweight transformations.
- `meta-py`: Python workers executing harvesters, data enrichment, and ML tasks.
- Workflows declare required queues in specs; activities must not cross language boundaries without contract wrappers.

## Workflow: `endpointSyncWorkflow`
- **Purpose**: synchronize external endpoints (APIs, documentation sources) into normalized items.
- **States & Events**
- `Pending` (created, waiting for schedule) -> event `Scheduled`.
- `Running` (actively synchronizing) -> events `Heartbeat`, `ActivityStarted`, `ActivityCompleted`.
- `WaitingCursorAdvance` (blocked on external checkpoint) -> event `CursorAdvanceRequested`.
- `Backoff` (retry delay applied) -> event `RetryScheduled`.
- `Succeeded` -> event `Completed`.
- `Failed` -> event `Failed`.
- `Cancelled` -> event `Cancelled`.
- **Lifecycle**
  1. Scheduler enqueues workflow with tenant/project metadata.
  2. Workflow fetches last cursor from KV. If missing, initial full sync.
  3. Activities run on `meta-py` (harvest) and `meta-ts` (normalize) queues with heartbeats.
  4. Workflow updates cursor in KV using CAS; on conflict, transitions to `WaitingCursorAdvance`.
  5. Completion emits log events and metrics, then schedules next run.

## Schedule Controls
- **Pause**: sets schedule to `paused=true`, adds annotation in KV; workflows in `Pending` remain unscheduled.
- **Resume**: flips `paused=false`, writes audit log referencing authorization.
- **Reschedule**: updates cron expression; future runs use new cadence while existing runs finish.
- **Trigger**: manual invocation with `manual_trigger_id`; bypasses schedule but respects concurrency limits.

## Cursor & Advance Rules
- Cursor stored as deterministic JSON payload (e.g., OneDrive delta token, Git SHA).
- CAS conflicts instruct workflow to wait and retry with exponential backoff.
- When external source reports no new data, workflow records heartbeat but does not mutate cursor.
- Manual overrides require spec reference and create `CursorAdvanceRequested` event for audit.

## Backoff Policy
- Exponential backoff starting at 1 minute, doubling up to 1 hour for recoverable failures.
- Fatal errors (e.g., authorization revoked) push workflow to `Failed` state and require manual intervention.
- Backoff metadata stored in workflow memo for observability and support tooling.

## Logging Expectations
- Emit logs per `log-taxonomy.md`:
  - `INFO` at schedule start (`directive=endpointSyncWorkflow`).
  - `INFO` for `CursorAdvanceRequested` with reason.
  - `WARN` on recoverable errors (network, rate limit) with future retry timestamp.
  - `ERROR` when workflow transitions to `Failed`.
  - `DEBUG` optional for pre/post payload hashes guarded by feature flag.
- Log fields include `workflow_id`, `run_id`, `tenant_id`, `project_id`, and `spec_id`.

## Metrics & Observability
- Metrics: run duration, item counts, cursor lag, backoff attempts.
- Alerts: failed runs > 3 within 24 hours per tenant triggers pager.
- Traces: each activity spans propagate correlation ID aligned with log taxonomy.

## Acceptance Criteria
- Workflows launch in environment-specific namespaces and respect task queue assignments.
- Manual pause/resume/reschedule/trigger operations update schedules and produce audit logs.
- CAS cursor conflicts result in `WaitingCursorAdvance` state and controlled retries.
- Backoff policy enforces upper bound of 1 hour for recoverable errors; fatal errors escalate.
- Logs contain required fields and align with taxonomy; missing fields fail ingestion tests.

## Open Questions
- Should `meta-ts` handle certain harvesters for latency reasons?
- Do we need dynamic namespace creation for tenant onboarding?
- How to expose cursor state to end users without leaking sensitive tokens?

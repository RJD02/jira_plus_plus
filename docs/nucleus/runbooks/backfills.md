# Runbook: Backfills

## Purpose
Guide on-call and engineering teams through planning, executing, and monitoring backfill operations across tenants without disrupting live workloads.

## Preparation
1. Confirm target data domain (docs, code, API registry) and scope (tenant, project, date range).
2. Validate source availability and credentials; ensure signed URLs or raw data accessible.
3. Review related specs and ADRs for expected behaviour and dependencies.
4. Communicate schedule to stakeholders; set expectations for impact and duration.

## Execution Strategy
- Prefer dedicated Temporal namespace for backfills (`<env>.backfills`) with isolated task queues.
- Use versioned workflow definitions; document run parameters (tenants, time ranges, checkpoints).
- Throttle concurrency to avoid exceeding API rate limits or database load (monitor queue depth).
- Ensure KV checkpoints for live workflows remain unchanged; use separate keys or suffix `/backfill`.

## Step-by-Step Procedure
1. **Snapshot Baseline**
   - Capture baseline metrics (entity counts, edge counts, search index size).
   - Export relevant KV checkpoints for reference.
2. **Enable Backfill Workflow**
   - Deploy workflow with read-only mode until validation complete.
   - Run dry-run for single tenant/project to test pipeline.
3. **Execute Backfill**
   - Launch workflow for full scope, monitoring logs and metrics.
   - Record progress via `backfill_progress` dashboard (items processed, remaining).
   - Handle retries per worker policy; escalate if fatal errors occur.
4. **Validate Results**
   - Compare entity/edge counts against baseline and expected deltas.
   - Run acceptance packs relevant to domain (docs, code, API registry).
   - Verify search results and API responses show refreshed data.
5. **Advance Checkpoints**
   - Update backfill-specific KV keys with final token.
   - If backfill should become canonical cursor, coordinate handoff (documented approval).
6. **Close Out**
   - Mark workflows as completed, archive logs and metrics.
   - Communicate completion to stakeholders with summary.
   - File follow-up tickets for any data remediation or automation improvements.

## Monitoring & Alerts
- Watch `workflow_runs_total`, `workflow_retry_attempts_total`, and queue depth for backfill namespace.
- Alert when failure rate exceeds 2% or runtime surpasses planned window by 25%.
- Track database CPU and storage growth; pause if thresholds near limits.

## Rollback / Mitigation
- If data corruption detected, revert to baseline snapshot or restore from backup.
- Disable backfill workflows and revert KV checkpoints to pre-run values.
- Notify stakeholders of rollback and re-plan with mitigations.

## Checklist
- [ ] Scope defined and stakeholders informed.
- [ ] Dry-run completed with success.
- [ ] Monitoring dashboards active for duration.
- [ ] KV keys updated and documented.
- [ ] Acceptance pack executed post-run.
- [ ] Completion report shared; follow-up items logged.

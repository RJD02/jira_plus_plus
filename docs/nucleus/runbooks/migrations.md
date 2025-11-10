# Runbook: Schema Migrations

## Purpose
Provide controlled process for planning and executing database schema changes across environments while protecting data integrity and uptime.

## Preconditions
1. Migration proposal documented in spec/ADR with approval from DB and security leads.
2. Change reviewed for RLS impact, index requirements, and rollback plan.
3. Backups verified within the last 24 hours; restoration test run in staging.
4. Deployment window scheduled with on-call coverage and stakeholder notification.

## Change Categories
- **Safe additive**: new tables, columns with defaults, non-blocking indexes.
- **Risky**: column type changes, dropping columns, table rewrites.
- **Operational**: data backfills accompanying schema adjustments.

## Step-by-Step Procedure
1. **Plan**
   - Assess migration type and determine tooling (online migration framework vs direct SQL).
   - Confirm affected tables have RLS policies updated if needed.
   - Draft runbook snippet covering timing, commands, and verification queries.
2. **Staging Rehearsal**
   - Run migration in staging with production-like data subset.
   - Monitor metrics (query latency, lock duration); capture before/after schema snapshots.
   - Execute related acceptance packs to ensure application compatibility.
3. **Pre-Deploy Checks**
   - Freeze related deploys or coordinate release plan.
   - Ensure backups and monitoring dashboards ready.
   - Prepare rollback scripts (inverse migration or restore plan).
4. **Execution**
   - Apply migration using automated pipeline; monitor logs for errors.
   - For long-running operations, track lock wait and adjust throttle if available.
   - Validate success via schema introspection and sample queries.
5. **Post-Deploy Verification**
   - Run smoke tests: entity CRUD, key API endpoints, relevant workflows.
   - Confirm metrics and alerts remain within SLO.
   - Update migration status board with completion notes.
6. **Rollback (if needed)**
   - If errors encountered, execute rollback script or restore backup snapshot.
   - Communicate rollback immediately and assess data impact.

## Guardrails
- Avoid blocking migrations during peak usage; use online index builds where possible.
- Always include default values or backfill scripts when adding NOT NULL columns.
- Do not drop columns without deprecation period and data export.
- RLS policies must be reapplied if schema rebuild occurs (using stored procedures or automation).
- Coordinate with backfill runbook when migrations require data transformations.

## Monitoring & Alerts
- Track database locks, replication lag, and query latency during migration.
- Alert if replication lag exceeds 60 seconds or migration time exceeds planned window by 20%.
- Set temporary alert for increased error rate on API layer.

## Checklist
- [ ] Migration approved with spec/ADR reference.
- [ ] Staging rehearsal completed and results documented.
- [ ] Backups verified and rollback plan prepared.
- [ ] Monitoring dashboards configured.
- [ ] Migration executed and verified in production.
- [ ] Post-migration report shared with stakeholders.

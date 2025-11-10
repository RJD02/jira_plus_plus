# Runbook: Incident Classes

## Purpose
Provide actionable guidance for on-call responders to triage incidents based on symptoms, diagnose likely causes, and execute remediation steps.

## Class A: Availability / API Failures
- **Symptoms**
  - GraphQL or REST endpoints returning 5xx responses or timing out.
  - Alert: GraphQL p95 latency > 300 ms or error rate > 5%.
- **Diagnosis**
  1. Check status of API pods and load balancers.
  2. Review recent deploys or configuration changes.
  3. Inspect database connection pool saturation and query logs.
  4. Validate Keycloak availability and token issuance.
- **Actions**
  1. Roll back recent deployment if correlated with start time.
  2. Scale API pods if CPU/memory exhausted; confirm load normalizes.
  3. Flush stuck connections; restart pods if needed.
  4. Engage platform DBA if database latency persists.
  5. Post incident summary in on-call channel; open follow-up ticket.

## Class B: Workflow Failures / Backlog
- **Symptoms**
  - Temporal workflows failing or stuck in `Backoff`.
  - Queue depth > 100 for `meta-py` or `meta-ts`.
- **Diagnosis**
  1. Review Temporal dashboard for failing workflows and error messages.
  2. Examine worker logs for error class (retryable, validation, fatal).
  3. Check KV conflict metrics for spikes.
  4. Verify external dependencies (OneDrive, GitHub, etc.) via status pages.
- **Actions**
  1. For transient errors, confirm retries progressing; adjust backoff if necessary.
  2. If validation failures, quarantine bad payloads and notify data owners.
  3. For fatal errors, pause affected schedules, open incident, and escalate to engineering lead.
  4. Drain backlog by temporarily increasing worker concurrency after root cause addressed.
  5. Update incident tracker with resolution and lessons learned.

## Class C: Security / Access Violations
- **Symptoms**
  - Unauthorized access attempts logged.
  - Signed URL misuse or secrets exposure alerts.
- **Diagnosis**
  1. Identify affected tenant/project and requester identity from logs.
  2. Validate whether issue stems from misconfigured roles, leaked tokens, or platform bug.
  3. Check Keycloak audit and vault logs for anomalies.
  4. Review recent deployments touching security or RLS.
- **Actions**
  1. Revoke compromised tokens and disable affected accounts or service credentials.
  2. Rotate secrets via vault and document rotation in security channel.
  3. Patch configuration or roll back offending change.
  4. Notify security lead and produce incident report complying with policy.
  5. Monitor for repeated attempts; ensure logs forwarded to SIEM.

## Class D: Data Integrity / Schema Drift
- **Symptoms**
  - Unexpected nulls, missing edges, or schema mismatch errors.
  - Alerts about failed migrations or analytics anomalies.
- **Diagnosis**
  1. Compare current schema with expected version (check migrations runbook).
  2. Investigate ingestion pipelines for contract validation errors.
  3. Inspect recent releases for changes to normalized items or edges.
  4. Review audit logs for manual data fixes.
- **Actions**
  1. Halt affected workflows to prevent further corruption.
  2. Use backfill runbook to restore correct state from source of truth.
  3. Coordinate with DBAs for schema correction if needed.
  4. Document incident, capture root cause, and schedule ADR/spec updates.

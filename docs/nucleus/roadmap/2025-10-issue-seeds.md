# Issue Seeds — October 2025

Pre-drafted issue blurbs referencing the artefacts created in this planning pass. Each entry includes a link to the target document and the acceptance criteria drawn from the spec or runbook.

---

### Issue: spec — nucleus-core
- **Link**: [docs/specs/platform/2025-10/nucleus-core.md](../specs/platform/2025-10/nucleus-core.md)
- **Acceptance Criteria**
  - Create, read, update, and delete entities, edges, and annotations within a tenant while RLS blocks cross-tenant access in tests.
  - Embedding writes reject duplicate hashes and support search latency within the documented SLO.
  - KV checkpoints coordinate ingestion replays without conflicting updates across agents.
  - Blob links resolve to signed URLs under tenant policies, denying unauthorized access.
  - Audit records exist for entity mutations and cross-project grants.

### Issue: spec — orchestration-temporal
- **Link**: [docs/specs/platform/2025-10/orchestration-temporal.md](../specs/platform/2025-10/orchestration-temporal.md)
- **Acceptance Criteria**
  - Workflows launch in environment-specific namespaces and respect task queue assignments.
  - Manual pause, resume, reschedule, and trigger operations update schedules and produce audit logs.
  - CAS cursor conflicts place workflows in `WaitingCursorAdvance` with controlled retries.
  - Backoff policy caps recoverable retries at one hour; fatal errors escalate.
  - Logs include required fields that match the taxonomy; missing fields fail ingestion tests.

### Issue: spec — api-surface
- **Link**: [docs/specs/platform/2025-10/api-surface.md](../specs/platform/2025-10/api-surface.md)
- **Acceptance Criteria**
  - API returns structured validation errors with field-level messages.
  - Pagination tokens stay stable across versions and expire after 24 hours.
  - Idempotent requests avoid duplicates and are covered by integration tests.
  - Monitoring captures p95 latency for `metaEntities` and `/ingress/batch`.

### Issue: spec — docs-ingest
- **Link**: [docs/specs/domains/2025-10/docs-ingest.md](../specs/domains/2025-10/docs-ingest.md)
- **Acceptance Criteria**
  - Doc descriptors persist with correct tenant, project, and source metadata.
  - Chunking produces deterministic IDs and embeddings without duplication.
  - Optional blob storage accessible via signed URL while unauthorized attempts are denied.
  - Search surfaces newly ingested docs within SLA (< 5 minutes).
  - KV checkpoints update after successful sync, with conflicts retried per spec.
  - "Done" means descriptors saved, chunks indexed, and optional blobs stored behind signed URLs when required.

### Issue: spec — code-index
- **Link**: [docs/specs/domains/2025-10/code-index.md](../specs/domains/2025-10/code-index.md)
- **Acceptance Criteria**
  - Repository descriptors include mandated metadata and align to tenants/projects.
  - Incremental runs with unchanged commits produce no duplicate descriptors.
  - KV checkpoints advance atomically; conflicts log retries.
  - Codeowner data yields edges to team entities; missing owners flagged.
  - Optional symbol extraction produces descriptors without storing raw blobs.
  - API registry links exist for referenced endpoints.
  - "Done" means descriptors written, dependency edges created, and checkpoint persisted.

### Issue: spec — api-registry
- **Link**: [docs/specs/domains/2025-10/api-registry.md](../specs/domains/2025-10/api-registry.md)
- **Acceptance Criteria**
  - Registry lists endpoints per service and version with method, path, and operation ID.
  - MinIO blob hash matches metadata entry; mismatches block activation.
  - Code linkage records exist or document exceptions.
  - Deprecation metadata visible via API for consumers.
  - Audit trail covers spec publication, updates, and deprecation events.

### Issue: spec — kv-checkpoints
- **Link**: [docs/specs/platform/2025-10/kv-checkpoints.md](../specs/platform/2025-10/kv-checkpoints.md)
- **Acceptance Criteria**
  - Key naming follows prefix rules; invalid names reject with field errors.
  - CAS conflicts trigger deterministic retry behaviour with WARN logs.
  - Sample use cases progress safely without duplicate processing.
  - TTL-managed locks release automatically with expiration events logged.
  - Documentation referenced from contributor guides so teams adopt standard.

### Issue: adr — polyglot-boundaries
- **Link**: [docs/adr/0001-polyglot-boundaries.md](../adr/0001-polyglot-boundaries.md)
- **Acceptance Criteria**
  - Language ownership documented for core APIs (Go), harvesters (Python), and adapters (TypeScript).
  - Cross-language interactions use generated contracts housed in `docs/contracts/`.
  - ADR linked from affected specs and onboarding docs to enforce boundary guidance.

### Issue: adr — storage-model
- **Link**: [docs/adr/0002-storage-model.md](../adr/0002-storage-model.md)
- **Acceptance Criteria**
  - Postgres (`meta` schema), MinIO, and managed KV responsibilities are documented and adopted.
  - Entity and edge querying relies on Postgres with pgvector for search.
  - Operational runbooks reflect MinIO capacity planning and KV usage.

### Issue: ops — observability-slos
- **Link**: [docs/specs/platform/2025-10/observability.md](../specs/platform/2025-10/observability.md)
- **Acceptance Criteria**
  - Logs conform to taxonomy with required fields.
  - Metrics emit with correct labels and scrape successfully in staging.
  - SLOs recorded in operations runbook with owners identified.
  - Alerts tested in staging and tuned for noise.
  - On-call playbooks reference metrics, dashboards, and log searches.

### Issue: security — rls-and-signed-urls
- **Link**: [docs/specs/platform/2025-10/security-rls.md](../specs/platform/2025-10/security-rls.md)
- **Acceptance Criteria**
  - Requests missing valid claims return 401/403 and are audited.
  - RLS integration tests prevent cross-tenant reads.
  - Signed URL issuance limited to authorized roles with expiry <= 15 minutes.
  - Credential references resolved via vault without exposing secrets.
  - Completion checklist archived for every new endpoint or feature.

### Issue: runbook — incident-classes
- **Link**: [docs/runbooks/incident-classes.md](../runbooks/incident-classes.md)
- **Acceptance Criteria**
  - Runbook enumerates availability, workflow, security, and data integrity incident classes.
  - Each class includes symptom list, diagnosis steps, and actionable remediation.
  - Contacts and escalation expectations documented for on-call use.

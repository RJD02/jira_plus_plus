# Spec: KV Checkpoints and Progress Tracking

## Context & Goal
- Standardize compare-and-set (CAS) semantics for coordination keys used by agents and workflows.
- Establish naming conventions, retry policies, and sample use cases (OneDrive delta, Git last SHA, index versions).
- Ensure KV operations integrate with audit trails, log taxonomy, and platform RLS.

## Key Naming
- Prefix keys by tenant and project: `tenant/<tenant_id>/project/<project_id>/`.
- Append domain-specific paths, e.g., `docs/onedrive/delta`, `code/<repo_slug>/last_sha`, `search/index/<index_name>/version`.
- Use lowercase components separated by `/`; avoid whitespace and uppercase letters.
- Keys limited to 128 characters; longer identifiers must be hashed with documented mapping.

## Data Envelope
- Stored payload includes:
  - `value`: JSON string representing checkpoint data (e.g., token, SHA, version number).
  - `version`: monotonically increasing integer maintained by KV service.
  - `lastWriter`: `<agent>:<directive>` or service account identifier.
  - `requestId`: deterministic string per write attempt (timestamp + workflow ID).
  - `specRef`: optional pointer to governing spec.
  - `updatedAt`: ISO 8601 timestamp assigned server-side.
- TTL optional; ephemeral locks must set `ttlSeconds`.

## CAS Semantics
- Clients submit `expectedVersion`; success when matches current version.
- On mismatch, respond with `version_conflict` including current `version` and `value`.
- Write operations logged at INFO on success; conflicts logged at WARN with correlation ID.
- Upstream workflows handle conflicts by reloading state and deciding whether to retry or escalate.

## Retry & Backoff
- For conflicts, adopt bounded exponential backoff: 1s, 2s, 4s, capped at 32s before escalation.
- On transient errors (network, timeout), retry with jitter; after 5 attempts escalate to manual triage.
- Fatal errors (permission denied, malformed payload) fail fast and surface to maintainers.

## Failure Modes
- **Conflict**: Another worker advanced the checkpoint; caller reloads and replays missing work.
- **Stale Request**: `requestId` reused with outdated payload; KV returns `version_conflict`.
- **TTL Expiry**: Ephemeral lock expired; workflows must re-acquire before proceeding.
- **Storage Outage**: Workflow enters backoff and emits alert if unavailable > 5 minutes.

## Sample Use Cases
- **OneDrive Delta**: Store latest delta token and drive snapshot ID. CAS ensures only one harvester advances after a sync.
- **Git Last SHA**: Persist last processed commit per repository. Symbol extraction uses same checkpoint to avoid reprocessing.
- **Search Index Versions**: Track active embedding index version; change triggers reindex jobs and invalidates caches.

## Integration with Logs & Audit
- All `kvPut` operations emit structured logs with `directive`, `key`, `requestId`, `version`.
- Audit pipeline records the before/after values (hashed) for compliance without storing raw secrets.
- Metrics track success vs conflict rates; alert when conflict rate > 10% sustained.

## Acceptance Criteria
- Key naming conforms to prefix rules; invalid names rejected with field error.
- CAS conflicts produce deterministic retry behaviour and emit WARN logs.
- Use cases demonstrate safe progression without duplicate processing.
- TTL-managed locks release automatically and log expiration events.
- Documentation referenced in `CONTRIBUTING.md` and specs guides contributors to follow standard.

## Open Questions
- Should we support batch CAS operations for multi-key updates?
- Do we need automatic dead letter queues for repeated conflicts?
- How to expose checkpoint status in UI without leaking sensitive values?

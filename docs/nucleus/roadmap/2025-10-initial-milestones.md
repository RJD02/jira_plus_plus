# Roadmap: October 2025 Initial Milestones

## Milestone M1: Core Platform Foundations
- **Epic**: Core metadata store provisioning
  - **Acceptance Criteria**: Multi-tenant entity, edge, and annotation tables provisioned with RLS enabled; SLO monitoring in place for GraphQL reads.
  - **Demo Criteria**: Walkthrough showing tenant-scoped entity CRUD via `metaEntities` with audit logs.
- **Epic**: Temporal orchestration scaffolding
  - **Acceptance Criteria**: Namespaces created per environment; `endpointSyncWorkflow` deployed with schedule controls and backoff.
  - **Demo Criteria**: Trigger manual sync and show state transitions in workflow history.
- **Epic**: API shells (GraphQL + REST ingress)
  - **Acceptance Criteria**: Operations `metaEntities`, `metaEdges`, `registerEndpoint`, `/ingress/batch` available with authentication and idempotency.
  - **Demo Criteria**: Invoke sample queries/mutations and validate pagination tokens.
- **Epic**: Docs ingestion baseline
  - **Acceptance Criteria**: OneDrive and Markdown connectors emit normalized descriptors, chunks, embeddings; KV checkpoints advance.
  - **Demo Criteria**: Search UI prototype surfaces newly ingested docs within SLA.

## Milestone M2: Code & API Integration
- **Epic**: GitHub repository indexing
  - **Acceptance Criteria**: Repository, commit, file descriptors stored with ownership edges; KV checkpoint per repo.
  - **Demo Criteria**: Re-run index to show idempotent behaviour and checkpoint advancement.
- **Epic**: API registry standing up
  - **Acceptance Criteria**: Services can publish spec versions with MinIO storage, hash validation, and code linkages.
  - **Demo Criteria**: Publish sample API, link code file, and view endpoint list per version.
- **Epic**: KV semantics enforcement
  - **Acceptance Criteria**: `kvGet`/`kvPut` operations enforce CAS with retries, logging, and metrics per spec.
  - **Demo Criteria**: Simulate conflict scenario and show retry/backoff resolution.

## Milestone M3: Experience & Backfills
- **Epic**: Search experience polish
  - **Acceptance Criteria**: GraphQL `metaSearch` returns blended doc/code/API results with facets; p95 latency under 500ms.
  - **Demo Criteria**: Interactive query showing facets, highlights, and embedding-based ranking.
- **Epic**: Lineage edges enrichment
  - **Acceptance Criteria**: Declared dependencies from specs create edges; foreign key discovery automates additional links.
  - **Demo Criteria**: Visualize lineage graph highlighting newly inferred edges.
- **Epic**: Historical backfills
  - **Acceptance Criteria**: Backfill workflows replay historical data per tenant with namespace isolation and audit trails.
  - **Demo Criteria**: Run backfill job, monitor states, and show before/after entity counts.

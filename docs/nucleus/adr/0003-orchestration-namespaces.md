# ADR 0003: Orchestration Namespaces

## Status
Accepted

## Context
- Temporal orchestrates ingestion, enrichment, and export workflows across multiple tenants and environments.
- Early workflows reused the default namespace, causing collisions between staging and production and complicating replay.
- Security reviews require isolation so that credentials and rate limits respect environment boundaries.

## Decision
- Provision Temporal namespaces per environment (`dev`, `staging`, `prod`) and per directive family (`harvesters`, `backfills`, `experiments`).
- Agents must include namespace metadata in specs and register with least privilege task queues.
- Namespace creation and retention policies are codified in ops runbooks, with automated checks verifying namespace health.

## Consequences
- Replay and troubleshooting stays scoped, reducing blast radius of misconfigured workflows.
- Additional namespaces introduce minor management overhead but improve observability and quota enforcement.
- Credentials and secrets can be rotated per namespace without cross-environment leakage.

## Alternatives
- **Single namespace with logical tagging**: rejected; tag drift is hard to police and does not satisfy isolation requirements.
- **Namespace per workflow**: rejected; excessive fragmentation would strain Temporal control plane and team bandwidth.

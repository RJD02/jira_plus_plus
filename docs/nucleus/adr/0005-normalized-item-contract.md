# ADR 0005: Normalized Item Contract

## Status
Accepted

## Context
- Harvesters ingest artifacts from heterogeneous sources (Git, Confluence, Swagger, JDBC) that represent the same conceptual items.
- Downstream graph builders struggled with inconsistent field names and missing provenance.
- Consumers require deterministic identifiers to stitch items into the unified metadata graph.

## Decision
- Define a normalized item contract with required fields: `item_id`, `source_system`, `entity_type`, `canonical_path`, `hash`, `owners`, and `timeline`.
- Contracts are versioned in `docs/contracts/` and reused across harvesters; breaking changes require spec + ADR.
- Agents must emit both raw payloads and normalized items, storing the latter in a shared staging table before graph projection.

## Consequences
- Graph projection becomes predictable, reducing reconciliation code and duplicate edges.
- Harvesters incur modest transformation cost but gain reusable libraries.
- Schema evolution is now transparent, with audit trails for each contract revision.

## Alternatives
- **Pass-through source schemas**: rejected; forces every consumer to build bespoke mapping layers.
- **Fully denormalized aggregator**: rejected; would couple all ingestion logic to a single mega-spec and limit scalability.

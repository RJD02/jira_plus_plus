# ADR 0002: Storage Model

## Status
Accepted

## Context
- Nucleus needs to represent metadata relationships, durable content, and operational signals in a single platform.
- Previous prototypes scattered data across ad-hoc tables, S3 buckets, and spreadsheets, making discovery and lineage impossible.
- The ingestion pipeline must support replay and evolution without forcing monolithic migrations.

## Decision
- Use Postgres (`meta` schema) as the authoritative store for entities, edges, annotations, and embeddings, leveraging pgvector for semantic search.
- MinIO stores heavy or binary artifacts (PDFs, specs, blobs) referenced by Postgres URIs.
- A managed KV store provides low-latency coordination, feature flags, and checkpoints with compare-and-set semantics (see ADR 0006).

## Consequences
- Querying metadata for GraphQL federation remains consistent and transactional.
- Operators must maintain Postgres extensions and MinIO capacity planning.
- Data governance benefits from a single lineage source, easing auditing and retention policies.

## Alternatives
- **Polyglot storage per component**: rejected; increases operational toil and complicates querying.
- **Graph database primary**: rejected; current team expertise and tooling favour relational storage augmented with vector search.

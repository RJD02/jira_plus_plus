# ADR 0004: GraphQL Federation

## Status
Accepted

## Context
- Nucleus exposes metadata through a GraphQL API consumed by internal tools and partner systems.
- Individual services own slices of the graph (code catalog, docs index, API registry) and must stay deployable independently.
- Without federation, the central schema becomes a bottleneck and prevents teams from evolving their domains.

## Decision
- Adopt GraphQL Federation with a declarative supergraph that composes subgraphs owned by domain teams.
- Each subgraph publishes schema changes through CI, validated against the supergraph contract and spec references.
- The gateway enforces authentication, rate limiting, and observability consistently while delegating resolution to subgraphs.

## Consequences
- Teams can ship schema updates independently while preserving a unified API surface.
- Central tooling must manage composition checks and version locks before deployment.
- Consumers receive a richer schema with explicit ownership metadata, aiding debugging.

## Alternatives
- **Monolithic GraphQL server**: rejected; slows down domain autonomy and increases merge conflicts.
- **REST aggregation layer**: rejected; harder to express relationships and requires bespoke client orchestration.

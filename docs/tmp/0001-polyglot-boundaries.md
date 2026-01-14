# ADR 0001: Polyglot Boundaries

## Status
Accepted

## Context
- Nucleus spans services written in Go, Python, and TypeScript to balance performance, data tooling, and interface ergonomics.
- Prior cross-language integrations drifted because bindings were hand coded without shared contracts or version discipline.
- Operations wants clear ownership lines so that build tooling, on-call rotations, and dependency upgrades stay manageable.

## Decision
- Go owns core APIs and metadata graph services, Python owns harvesters and ML/data enrichers, and TypeScript owns UI adapters and DX tooling.
- Cross-language calls must traverse generated contracts published in `docs/contracts/` (gRPC, GraphQL, OpenAPI); direct in-process bindings are prohibited.
- Each boundary is accompanied by an ADR reference inside affected specs, and runtime interfaces are versioned with semantic tags.

## Consequences
- Service owners can optimise within their stack without unexpected upstream breakage.
- Build pipelines need to keep contract generation in sync, adding modest CI overhead.
- Onboarding is simpler because new contributors can focus on one language before stepping across boundaries.

## Alternatives
- **Single language rewrite**: rejected; would delay delivery and dilute strengths of existing components.
- **Ad-hoc polyglot**: rejected; past attempts created impedance mismatches and unpredictable behaviour.

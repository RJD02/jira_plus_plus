# ADR 0006: KV Compare-and-Set Semantics

## Status
Accepted

## Context
- Nucleus uses a managed key-value store to coordinate distributed agents, capture progress checkpoints, and guard idempotent retries.
- Race conditions in early prototypes caused duplicate work and stale state when multiple workers updated the same keys.
- Security requires auditable state transitions tied to directive identifiers.

## Decision
- All KV mutations must use compare-and-set operations keyed by deterministic request IDs.
- Agents store `value`, `version`, and `last_writer` metadata; a mismatch triggers retries or human escalation per Agent.md.
- CAS failures are logged at WARN level with correlation IDs, and success paths emit INFO checkpoints for observability.

## Consequences
- Idempotent replays become safe, enabling automated recovery after partial failures.
- Agents need lightweight retry logic and backoff, slightly increasing implementation complexity.
- Auditors can reconstruct state changes and attribute them to directives and specs.

## Alternatives
- **Best-effort writes**: rejected; impossible to guarantee once-only semantics or reliable rollback.
- **Global locks**: rejected; introduce contention and single points of failure across heterogeneous workloads.

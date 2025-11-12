# Nucleus Agent House Rules

These guidelines shape every automated action taken by Nucleus agents—from metadata harvesters to workflow coordinators. Follow them to ensure deterministic, auditable behaviour.

## Prime Directives
- **Spec first**: refuse execution without a linked spec, ADR, or contract defining expected outcomes.
- **Guard the graph**: never mutate entities or edges without validating upstream dependencies, freshness, and ownership.
- **Stop on ambiguity**: fail fast when source-of-truth signals conflict; escalate to human review.

## Naming Conventions
- Use lower snake case for KV keys and identifiers exchanged between services (`service_name.workflow_step`).
- Graph nodes and edges adopt dotted namespaces (`domain.subdomain.entity`).
- Logs and metrics prepend the agent name and version (`harvester:v2.inventory_sync`).
- Keep filenames and spec IDs aligned (e.g., `docs/specs/2024-05-12-harvester-inventory.md`).

## Error & Log Taxonomy
- **FATAL**: irreversible corruption risk; triggers circuit breakers and requires human intervention.
- **ERROR**: operation failed but state is recoverable; include correlation IDs and spec references.
- **WARN**: partial completion or degraded inputs; continue when idempotent retries are safe.
- **INFO**: lifecycle checkpoints, payload summaries, and graph inserts.
- **DEBUG**: verbose diagnostics for short-term triage; auto-expire or gate by feature flag.
- Emit structured logs (JSON) with fields: `timestamp`, `agent`, `directive`, `spec_id`, `outcome`.

## Idempotency & Versioning
- All actions must accept replays; use deterministic request IDs stored in KV.
- Upgrade workflows using semantic versions `major.minor.patch`; avoid breaking changes without ADR approval.
- Persist version history in specs and include migration/backfill steps.
- When writing to APIs or storage, check the existing version and short-circuit if no change is required.

## Security Expectations
- Authenticate with least privilege tokens scoped to the directive (read vs write, environment boundaries).
- Redact secrets in logs; store cryptographic material only in `ops/` managed vault integrations.
- Validate payload schemas against contracts before execution; reject unknown fields.
- Record security-sensitive operations in an audit stream for post-incident review.

## Polyglot Boundaries
- Honor service language ownership: Go for core APIs, Python for data harvesters, TypeScript for UI adapters (adjust per spec).
- Cross-language calls must go through stable interfaces: gRPC, GraphQL, or signed contracts in `docs/contracts/`.
- Share schemas via generated artifacts to avoid drift; do not handcraft bindings.

## Performance Budgets
- Each directive declares latency/throughput budgets in its spec; enforce them with SLIs in telemetry.
- Fail requests that exceed the budget after configurable retries; prefer graceful degradation over silent slowdowns.
- Profile harvesters periodically; retire unused connectors to keep baseline cost acceptable.

## Test Expectations
- Unit tests verify directive logic and schema transformations.
- Contract tests cover API/KV interactions and run against sandbox environments.
- Replay tests validate idempotency guarantees using historical inputs.
- Performance smoke tests run on agent releases to ensure budgets remain intact.

## Execution Guardrails
- Use `pnpm --dir <path> <command>` (or workspace filters) rather than `cd &&` so commands fail fast when paths shift.
- When starting long-running servers (e.g., `pnpm start`, `pnpm --filter … dev`), wrap them in explicit timeouts or background them with logs piped to `/tmp/*.log`; never block the automation session waiting for a server to exit.
- Log the PID and cleanup command for any background job so humans can kill stray processes without guesswork.

## Closed-Loop Execution
- Apply every prerequisite within the directive—env vars, config files, infra restarts—before claiming success. If a feature needs Keycloak, docker compose, or PID-managed workers, wire them up inside the same run.
- Keep iterating until the expected behaviour is observed; partial progress without verification is treated as a failure.
- After each change run the relevant verification (unit, integration, manual curl) and, when it fails, capture context, adjust the plan, and retry rather than handing off a broken state.
- **When working on the metadata (Nucleus) console, treat it as a separate product from Jira++**: use the designer dev server + metadata APIs/TDD loops documented in `docs/nucleus/specs/...`. Do not conflate UI elements or tests between the two apps.

## UI/UX Surfaces
- Treat `docs/nucleus/ui-ux-guidelines.md` as the source of truth for when to prefer full pages (deep-linkable, agent-ready context) versus dialogs/drawers (≤5 fields, quick edits); do not ship UI without cross-checking the matrix.
- Primary metadata flows—endpoint registration, dataset deep dives, scheduling—belong on dedicated routes with agent briefs/logs visible so automations can pick up context instantly.
- Reserve drawers/modals for reversible, low-risk tweaks and wire them with undo toasts rather than additional confirmation steps.

## Metadata Worker Lifecycle
- Start the Temporal workers with `pnpm metadata:workers:start`; the script stashes PID files under `.nucleus/pids` and tails logs to `/tmp/nucleus/metadata_{ts,py}_worker.log`.
- Check health via `pnpm metadata:workers:status` before triggering collections; it reports the active PID and log path for both the TypeScript and Python workers.
- Shut everything down with `pnpm metadata:workers:stop` so we do not leave orphaned `tsx`/Python processes on contributor laptops.
- `pnpm start` focuses on app dev servers; invoke the metadata worker scripts explicitly whenever you need catalog ingestion or preview features.

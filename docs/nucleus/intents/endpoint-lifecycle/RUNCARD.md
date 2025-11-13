# Run Card — endpoint-lifecycle

ROLE: Developer Agent (follow docs/meta/AGENT_CODEX.md)

SLUG: endpoint-lifecycle

SCOPE: Implement and verify the Endpoint Lifecycle feature per intents/endpoint-lifecycle/SPEC.md so that all assertions in intents/endpoint-lifecycle/ACCEPTANCE.md pass. No unrelated refactors.

INPUTS:

* intents/endpoint-lifecycle/INTENT.md
* intents/endpoint-lifecycle/SPEC.md
* intents/endpoint-lifecycle/ACCEPTANCE.md
* docs/meta/*
* runs/endpoint-lifecycle/*

OUTPUTS:

* runs/endpoint-lifecycle/PLAN.md
* runs/endpoint-lifecycle/LOG.md (heartbeat every 10–15 min)
* runs/endpoint-lifecycle/QUESTIONS.md (blocking issues)
* runs/endpoint-lifecycle/DECISIONS.md (tiny assumptions)
* runs/endpoint-lifecycle/TODO.md (tiny follow-ups)
* Code + tests (GraphQL schema, resolvers, UI wiring)

LOOP:
Plan → Implement → Test → Patch → Heartbeat.
Commits ≤ ~150 LOC; reference AC# in each message.

HEARTBEAT:
Append to LOG.md every 10–15 min → `{timestamp, done, next, risks}`.

STOP WHEN:

* All acceptance checks pass, OR
* A blocking question with minimal repro is in QUESTIONS.md and STATE set to blocked.

POST-RUN:
Update sync/STATE.md Last Run; append a line to stories/endpoint-lifecycle/STORY.md.

GUARDRAILS:

* Do not modify *_custom.* or `// @custom` blocks.
* Prefer *_gen.* or `// @generated` blocks.
* Keep `make ci-check` < 8 minutes.
* Fail-closed on ambiguity.
* Preserve existing working Temporal workflows (`testConnection`, `triggerCollection`).
* Follow Keycloak role matrix (viewer/editor/admin) at API and UI.

TASKS FOR THIS RUN:

1. **GraphQL Schema & Resolvers** — Implement queries and mutations defined in SPEC.md:

   * `endpoints`, `endpoint`, `endpointDatasets`, `endpointTemplates`
   * `testEndpoint`, `registerEndpoint`, `updateEndpoint`, `deleteEndpoint`, `triggerCollection`
   * Return structured GraphQL errors with `extensions.code`.
2. **Keycloak Enforcement** — Add role guards to resolvers and UI visibility.
3. **Temporal Hooks** — Wire `testEndpoint` and `triggerCollection` to existing workflows; skip re-impl if present.
4. **Dataset Association** — Ensure collection workers tag `MetadataRecord.labels += ['endpoint:<endpointId>']`;
   implement `endpointDatasets()` to query by that label.
5. **Designer UI**

   * Endpoint Catalog (cards, badges, runs, menus)
   * Register/Edit flow with test→save cycle
   * Detail view “Datasets” tab showing records
   * Capability-aware disable logic (`metadata`, `preview`, etc.)
   * Mask URL credentials in renders
6. **Testing**

   * Playwright smoke tests for AC#1–AC#9
   * API tests for role guards and error codes
   * Perf check `endpoints(first:50)` ≤ 300 ms (p95)

ENV / NOTES:

* Use local metadata Postgres (.env.example); no real secrets.
* Respect existing Prisma model names (`MetadataEndpoint`, etc.).
* If Temporal or Keycloak config ambiguous, pause and record QUESTIONS.md with repro snippet.

DONE WHEN:

* All ACCEPTANCE.md checks green.
* CI passes (< 8 min).
* sync/STATE.md updated with successful run timestamp.

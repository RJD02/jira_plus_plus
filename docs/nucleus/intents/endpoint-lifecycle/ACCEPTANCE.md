# Acceptance Criteria — Endpoint Lifecycle (API + UI)

1) Create requires passing “Test” (API + UI)
   - Type: integration + e2e
   - API: testEndpoint returns { ok: true } before register (GraphQL).
   - UI: After a passing test, the “Register” button is enabled; clicking it registers and navigates back to list without a full reload. New endpoint appears immediately in the list.

2) Edit requires re-test when connection fields change (API + UI)
   - Type: integration + e2e
   - API: updateEndpoint fails with E_CONN_TEST_REQUIRED if url/verb/authPolicy/config changed and no fresh test exists; succeeds after a passing test; updatedAt changes.
   - UI: When connection fields change, “Save” is disabled until a passing test is performed; tooltip or banner explains why.

3) Delete is guarded while a run is active (API + UI)
   - Type: integration + e2e
   - API: deleteEndpoint returns GraphQL error E_ENDPOINT_IN_USE when a RUNNING MetadataCollectionRun exists.
   - UI: Delete action is disabled or shows a banner while active run is present; once no active runs, delete succeeds and the row disappears from the list.

4) Role matrix enforced and reflected in controls (UI visibility)
   - Type: e2e + API
   - viewer: mutations rejected with E_ROLE_FORBIDDEN; create/edit/delete/trigger controls hidden or disabled.
   - editor: can register/update/trigger; delete is rejected/hidden.
   - admin: full access.

5) Capability-aware behavior (server and UI)
   - Type: e2e + API
   - With missing “preview” capability, preview/trigger UI controls are disabled; misuse returns E_CAPABILITY_MISSING.

6) Trigger shows run chips and progresses to terminal state (UI)
   - Type: e2e
   - triggerCollection returns a MetadataCollectionRun (status QUEUED); cards/detail page show live status until terminal; final status chip is visible.

7) Detail page lists datasets for this endpoint (UI)
   - Type: e2e + API
   - Records labeled endpoint:<endpointId> are returned by endpointDatasets and rendered in the “Datasets” tab; optional domain filter works.

8) Secrets masked everywhere (API + UI)
   - Type: integration + e2e
   - URLs or credentials are never shown in clear text in API responses, logs, or UI; masked form is rendered.

9) Performance guard (API + UI)
   - Type: perf smoke
   - API: endpoints(first:50) p95 ≤ 300 ms with ~100 endpoints (local).
   - UI: initial render of the endpoints list completes with no console errors; UI perf probe stays under agreed budget.

10) Contract guard (CI)
   - Type: CI job
   - A contract diff step compares /openapi.json (or GraphQL schema) with a stored baseline and fails on breaking changes (renames/removals).

1. **Create requires Test**

   * GIVEN valid endpoint input
   * WHEN `testEndpoint` is called
   * THEN it returns `{ ok: true }` and the UI enables “Register”.
   * WHEN `registerEndpoint` is called
   * THEN the endpoint appears in `endpoints(projectSlug: ...)` without a full page reload.

2. **Edit + Re-test on connection change**

   * GIVEN an endpoint
   * WHEN `url` or `verb` or `authPolicy` or `config` changes
   * THEN `updateEndpoint` without a fresh passing `testEndpoint` fails with `E_CONN_TEST_REQUIRED`.
   * WHEN re-tested and passed
   * THEN `updateEndpoint` succeeds and `updatedAt` changes.

3. **Delete guard on active run**

   * GIVEN a RUNNING `MetadataCollectionRun` for the endpoint
   * WHEN `deleteEndpoint` is called
   * THEN it returns GraphQL error `E_ENDPOINT_IN_USE` and UI shows a banner.
   * WHEN no active runs
   * THEN it returns `true` and the endpoint disappears from `endpoints`.

4. **Role enforcement**

   * `viewer`: mutations rejected with `E_ROLE_FORBIDDEN`; create/edit/delete/trigger controls hidden/disabled.
   * `editor`: can register/update/trigger; `deleteEndpoint` rejected.
   * `admin`: full access.

5. **Capability awareness**

   * GIVEN endpoint missing `preview`
   * THEN preview/trigger controls requiring it are disabled; mutation misuse returns `E_CAPABILITY_MISSING`.

6. **Trigger collection telemetry**

   * WHEN `triggerCollection` is called
   * THEN it returns a `MetadataCollectionRun` with status `QUEUED` and the card shows live status until terminal.

7. **Endpoint Detail shows datasets**

   * GIVEN records labeled with `endpoint:<endpointId>`
   * WHEN `endpointDatasets(endpointId: ...)` is queried
   * THEN records are returned (optionally filtered by `domain`), and the detail page renders a dataset list/table.

8. **Security & masking**

   * URLs with embedded credentials are masked in all GraphQL responses and error paths.

9. **Performance**

   * `endpoints(first:50)` p95 ≤ 300 ms with 100 endpoints; CI includes a smoke perf check.

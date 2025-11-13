## Problem

Complete the **endpoint lifecycle** in the Metadata Workspace using **end-to-end GraphQL**, aligned with the existing Prisma models. Also, the **Endpoint Detail** page must list datasets produced by that endpoint. (Spec formatted per schema.)

## Interfaces / Contracts

### GraphQL Schema (additive; names stable if already exist)

```graphql
# ---------- Types ----------
type MetadataEndpoint {
  id: ID!
  projectId: ID
  sourceId: String!
  name: String!
  description: String
  verb: String!
  url: String!
  authPolicy: String
  domain: String
  labels: [String!]!
  config: JSON
  detectedVersion: String
  versionHint: String
  capabilities: [String!]!
  runs(after: String, first: Int = 10): MetadataCollectionRunConnection!
  createdAt: DateTime!
  updatedAt: DateTime!
}

type MetadataCollectionRun {
  id: ID!
  endpointId: ID!
  status: MetadataCollectionStatus!
  requestedBy: String
  requestedAt: DateTime!
  startedAt: DateTime
  completedAt: DateTime
  workflowId: String
  temporalRunId: String
  error: String
  filters: JSON
  createdAt: DateTime!
  updatedAt: DateTime!
}

type MetadataRecord {
  id: ID!
  projectId: ID!
  domain: String!
  labels: [String!]!
  payload: JSON!
  createdAt: DateTime!
  updatedAt: DateTime!
}

type TestResult {
  ok: Boolean!
  diagnostics: [Diagnostic!]!
}
type Diagnostic { level: String!, code: String!, message: String!, hint: String, field: String }

# Connections (optional)
type MetadataCollectionRunConnection { edges: [MetadataCollectionRun!]!, pageInfo: PageInfo! }
type PageInfo { hasNextPage: Boolean!, endCursor: String }

# ---------- Queries ----------
type Query {
  endpoints(projectSlug: String, capability: String, search: String, first: Int = 50, after: String): [MetadataEndpoint!]!
  endpoint(id: ID!): MetadataEndpoint
  endpointBySourceId(sourceId: String!): MetadataEndpoint

  # Datasets for an endpoint = MetadataRecords whose labels include "endpoint:<endpointId>"
  endpointDatasets(endpointId: ID!, domain: String, first: Int = 100, after: String): [MetadataRecord!]!

  endpointTemplates(family: String): [MetadataEndpointTemplate!]!
}

# ---------- Mutations ----------
input EndpointInput {
  projectSlug: String!
  sourceId: String!
  name: String!
  description: String
  verb: String!        # For HTTP
  url: String!
  authPolicy: String
  domain: String
  labels: [String!]
  config: JSON
  capabilities: [String!]!
}

input EndpointPatch {
  name: String
  description: String
  verb: String
  url: String
  authPolicy: String
  domain: String
  labels: [String!]
  config: JSON
  capabilities: [String!]
}

input TestEndpointInput {
  templateId: String!       # e.g., "postgres"
  type: String!             # "jdbc" | "http" | "streaming"
  connection: JSON!         # driver-specific; never persisted directly
  capabilities: [String!]
}

type Mutation {
  testEndpoint(input: TestEndpointInput!): TestResult!                     # Temporal workflow-backed
  registerEndpoint(input: EndpointInput!): MetadataEndpoint!               # Requires prior successful test
  updateEndpoint(id: ID!, patch: EndpointPatch!): MetadataEndpoint!
  deleteEndpoint(id: ID!): Boolean!                                        # Guard if runs RUNNING
  triggerCollection(endpointId: ID!, filters: JSON, schemaOverride: [String!]): MetadataCollectionRun!  # Temporal-backed
}
```

### AuthZ (Keycloak)

* `viewer` → Query only.
* `editor` → + `registerEndpoint`, `updateEndpoint`, `triggerCollection`.
* `admin` → + `deleteEndpoint`.
  Enforce at the resolver level and reflect in UI control states.

### Error Codes (surface in `extensions.code`)

* `E_CONN_TEST_FAILED`, `E_CONN_TEST_REQUIRED`
* `E_CAPABILITY_MISSING`
* `E_ENDPOINT_IN_USE`
* `E_ROLE_FORBIDDEN`
* `E_DUPLICATE_SOURCE_ID`

### Temporal Workflows

> If already implemented, keep names/signatures; wire resolvers to them.

* `wf.endpoint.testConnection(input: TestEndpointInput) -> TestResult`
* `wf.collection.trigger({ endpointId, filters, schemaOverride }) -> { runId, status }`

## Data & State

**Prisma (existing models):**

* `MetadataEndpoint`, `MetadataCollectionRun`, `MetadataRecord`, `MetadataProject`, `MetadataEndpointTemplate`, `MetadataCollectionStatus` (as provided by you).

**Dataset association convention (no schema change):**

* Collection workers **must tag** all `MetadataRecord.labels` with `endpoint:<endpointId>` (and MAY add `source:<sourceId>`).
* `Query.endpointDatasets` filters `MetadataRecord` by `labels CONTAINS 'endpoint:<endpointId>'` (+ optional `domain`).

**Masking:**

* Never return credentials; mask sensitive URL fragments before returning fields like `url` if they contain secrets.

## Constraints

* Conform to **SPEC schema** for agent parsing.
* No breaking Prisma migrations.
* Delete is blocked if any `MetadataCollectionRun` for the endpoint is `RUNNING` (return `E_ENDPOINT_IN_USE`).
* Capability-aware checks on server; UI disables incompatible actions.

## Acceptance Mapping

* A1: `testEndpoint` must return `ok:true` before `registerEndpoint`.
* A2: After registration, `endpoints` includes the new endpoint.
* A3: `updateEndpoint` requires re-test when URL/verb/authPolicy/config change; otherwise `E_CONN_TEST_REQUIRED`.
* A4: `deleteEndpoint` blocked on active runs.
* A5: Keycloak role matrix enforced at resolvers and reflected in UI.
* A6: Capability misuse → `E_CAPABILITY_MISSING`.
* A7: `triggerCollection` returns a `MetadataCollectionRun` and updates list/detail cards.
* A8: `endpointDatasets(endpointId)` returns records labeled to that endpoint and the detail page renders them.

## Risks / Open Questions

* Records written historically without `endpoint:<id>` label will not appear in detail; add one-time backfill if needed.
* `sourceId` is unique globally—confirm whether uniqueness should be per-project; if yes, enforce `(projectId, sourceId)` in app logic.
* Some connectors expose secrets in `url`; normalize to `config` and display a masked derived URL in UI.

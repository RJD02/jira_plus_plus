# Endpoint Lifecycle Management (GraphQL)

* title: Endpoint Lifecycle Management (GraphQL)
* slug: endpoint-lifecycle
* type: feature
* context: Designer SPA (Metadata Workspace), GraphQL API, Prisma models (MetadataProject/Endpoint/Record/Run), Temporal workers, Keycloak roles
* why_now: Finish the Endpoints section with full CRUD, capability-aware actions, and dataset visibility on detail view
* scope_in:

  * List & filter endpoints; open Detail view
  * Register endpoint via template-driven form (JDBC/HTTP/Streaming)
  * **GraphQL** `testEndpoint` before create/update
  * Edit endpoint; re-test on connection changes
  * Delete endpoint with active-run guard
  * Trigger collections; show latest run state on cards
  * **Detail page lists datasets produced by the endpoint**
  * Capability-aware UI/guards (`metadata`, `preview`, `profiles`)
  * Keycloak role enforcement (`viewer`, `editor`, `admin`)
* scope_out:

  * Authoring new connector drivers
  * Advanced schedule UI (separate intent)
* acceptance:

  1. Create requires passing `testEndpoint`.
  2. New endpoint appears immediately in list.
  3. Edit persists; re-test required when connection fields change.
  4. Delete blocked while a collection is RUNNING.
  5. Role matrix enforced at API and UI.
  6. Capability misuse fails closed with error codes.
  7. Triggered collections surface run chips on cards/detail.
  8. Detail page shows datasets for the endpoint (records labeled `endpoint:<endpointId>`).
* constraints:

  * Artifacts must follow **INTENT** and **SPEC** schemas for agent parsing.
  * Secrets never echoed; URIs masked in UI
  * Zero-downtime migration; no model renames
* non_negotiables:

  * If `test/trigger` GraphQL mutations and Temporal wiring already work, leave them as-is and only bind UI.
  * Never log secrets; redact in diagnostics.
* refs:

  * SPEC & ACCEPTANCE in this folder
  * ADR for role → permission mapping (optional)
* status: ready

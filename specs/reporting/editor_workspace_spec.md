# Reporting Designer Workspace Spec

## Goals
- Unify conversational agent canvas and manual editor into one "active workspace" influenced by metadata.
- Provide DX-grade editing experience (syntax highlighting, completion, linting, inline help).
- Surface metadata + persona context inline (scopes, catalogs, active schema).
- Enable rapid downstream actions: ingestion, recon, reporting, monitoring.
- Serve as the canonical UI for the emerging metadata services, with “Report Designer” as one of multiple agentic skills (others: ingestion, reconciliation, monitoring, document search).

## Implementation Status
### Milestone B (delivered)
- ✅ Monaco editor with auto mode detection, SQL formatting, lint diagnostics, and metadata-driven completions/macros.
- ✅ Metadata scope chips, schema palette, and dataset snippet injection + ref assistant that map back to agent conversations.
- ✅ Inline agent annotations & overlays with Apply/Dismiss controls that link to the originating conversation thread.
- ✅ Command palette (⌘/Ctrl + K) plus toolbar actions for draft/run/publish, filters/notes, and schema shortcuts (⌘/Ctrl + Shift + S).
- ✅ Preview pane wired to live run payloads (table/grid, markdown, text/error) and run history inspector.
- ✅ Editor layout (theme, split ratio, mode) persisted per user via localStorage as spec’d.

### Milestone C (agent plan & metadata intelligence) – in progress
- 🔄 Dynamic agent plan state surfaced in UI (plan steps mutate per conversation turn).
- 🔄 Tool invocation scaffolding (catalog/doc lookups, preview probes) exposed to agent runtime.
- 🔄 Conversation UX upgrades: optimistic message send, status badges, plan/timeline panel, tool activity log.

## Key UX pillars
1. **Canvas-first Layout**
   - Left rail: icon launcher (collapsible), session thread drawer, metadata settings.
   - Center: Monaco-based editor with mode indicator, inline previews, contextual comments.
   - Right panel: results dashboard (runs, rendered markdown, data grids) + inline comments.

2. **Agentic Guidance + Editor Intelligence**
   - Modes: Auto, SQL, Python, Markdown, Plain text (user override) with auto dialect detection.
   - Metadata-powered completions + inline lint (SQL parser, Python AST) surfaced inside Monaco.
   - Formatting commands (SQL uppercasing/breaks, markdown tables, Python black-lite style).
   - Inline comment threads (agent hints, reviewer comments) via Monaco decorations.
   - **Dynamic Agent Plan:** conversation sidebar shows the agent’s live plan (steps, statuses, tool calls). Plan updates every response and references tool invocations (“Lookup catalog → jira_projects”, “Draft SQL”, “Run preview”).
   - **Tool visibility:** when the agent queries metadata or kicks off a preview, show lightweight activity badges (“Agent is fetching catalog metadata…”).

3. **Metadata-driven Context**
   - Scope chips from catalog, persona tags, compatibility warnings.
   - Schema popovers when typing `{{ ref(`, `table.column`, etc.
   - Metadata callouts for ingestion/recon templates; selecting a metadata node auto-stubs editor content.

4. **Action Toolbar**
   - Primary: Start draft, Run preview, Publish.
   - Overflow: Format, Save draft, Manage versions, Run history, Toggle filters/notes, Schema palette.
   - Command palette (Cmd+K) for quick actions.

5. **Results & Preview**
   - SQL: data grid with pagination, optional chart, explain plan.
   - Markdown: live render.
   - Python: stdout/errors.
   - Ingestion/recon workflows: status timeline + logs.

## Functional Requirements
### Editor Engine
- Integrate Monaco via `@monaco-editor/react` with lazy-loading.
- Support language switching (SQL, Python, Markdown, Plain).
- Provide completion providers per language, fed by metadata APIs.
- Support inline comments/annotations referencing agent conversation IDs.
- Provide formatting commands per language.
- Store editor state (mode, theme, layout) per user in localStorage.

### Metadata Hooks
- Add metadata context service exposing schema, dbt models, ingestion definitions.
- Provide hooks for editor to request metadata segments (e.g., `useMetadataScope`).
- Support injecting metadata references into conversation prompts and toolbar.
- Interim source of truth = `configs/reporting/catalog.json`; treat it as the metadata service stub until the real API is ready. Future metadata service must expose the same concepts (datasets, fields, docs, personas) plus richer lineage.
- Agent tools may prefetch metadata entries (datasets, docs, glossary); tool output feeds the plan state and conversation log.
- Metadata service will evolve to include:
  - Project-scoped metadata graph (Jira indexes, GitHub repos, ingestion pipelines, recon jobs, semantic doc embeddings, user/org info).
  - Endpoint registry describing how to query each asset (`/metadata/projects/:id/catalog`, `/metadata/projects/:id/docs/search`, `/metadata/projects/:id/ingestion/status`, etc.).
  - Write APIs so assistants can push new knowledge (e.g., agent conversation summaries, approved report definitions).
- Designer must treat metadata APIs as modular “skills” so new surfaces (ingestion assistant, recon assistant) can plug into the same UI shell without rework.
- **Metadata GraphQL contract (snapshot):**
  ```graphql
  type Project {
    id: ID!
    name: String!
    labels: [Label!]!
    domains: [Domain!]!
  }

  type Domain {
    key: String!
    title: String!
    description: String
    records(after: String, first: Int, filter: MetadataFilterInput): MetadataConnection!
    endpoints: [Endpoint!]!
  }

  interface MetadataRecord {
    id: ID!
    projectId: ID!
    domain: String!
    labels: [Label!]!
    raw: JSON!
    createdAt: DateTime!
    updatedAt: DateTime!
  }

  type DatasetRecord implements MetadataRecord {
    id: ID!
    projectId: ID!
    domain: String!
    labels: [Label!]!
    raw: JSON!
    createdAt: DateTime!
    updatedAt: DateTime!
    dataset: Dataset!
  }

  type Endpoint {
    id: ID!
    name: String!
    description: String
    verb: HttpVerb!
    url: String!
    authPolicy: String
  }
  ```
  - Projects partition metadata; labels/tags add secondary scopes.
  - Domains advertise what kinds of metadata exist (“documents”, “code”, “schemas”, “ingestionProgress”). Agents can introspect `domains` to learn available tools.
  - `Endpoint` nodes describe external actions (preview run, ingestion trigger). If an endpoint isn’t registered, agents instruct users to register it.
  - The service exposes GraphQL queries/mutations (`project(id)`, `searchDocuments`, `registerEndpoint`, `emitMetadataRecord`) and an SDK so other systems can emit semantic metadata (wrapping `MetadataRecord` into typed objects).

#### Metadata Direction
- **Active metadata graph**: model schemas, ingestion configs, recon rules, dashboards, agents, and workflows as nodes in a shared graph (think “functional lineage”). Each editor artifact references graph IDs so downstream services (ingestion/recon/monitoring) can trace provenance.
- **Unified metadata API**: expose a single service that describes assets (schema, persona access, freshness, lineage) and accepts updates from the workspace. The editor should never fetch catalog data ad hoc—always via this API so metadata stays consistent across products.
- **Persona-aware scoping**: metadata queries must accept persona/context filters (role, row-level permissions) so suggestions, completions, and schema palettes only expose assets the persona can touch.
- **Context injection**: selecting a metadata node (dataset, dbt model, ingestion job) injects references into both the prompt and the manual editor (inline comments, code stubs, config templates). This keeps the agent + manual flows aligned with the metadata source of truth.
- **Metadata-powered actions**: downstream workflows (ingestion, recon, transformation, monitoring) should be discoverable via metadata descriptors. The workspace triggers them by referencing metadata nodes, not bespoke APIs, so new metadata systems can plug in without reworking the UI.

### Result Panel
- `PreviewPane` component that renders based on last run payload: grid (Tabular), Markdown, JSON, error log.
- Provide run timeline (queued → running → succeeded/failed) with filters.
- Preview endpoints should be described by metadata service (which engine to hit, what credentials). Designer shells use endpoint descriptors (URI + payload contract) rather than hardcoded client logic.

### Agent Guidance & Planning
- Inline hints from agent suggestions (Monaco decoration) with Apply/Dismiss controls referencing the originating conversation turn.
- Dynamic plan object stored per reflection (`plan_state`), updated every assistant response with step status (PENDING, IN_PROGRESS, DONE, BLOCKED).
- Agent runtime may call “virtual tools” (catalog lookup, doc lookup, preview run); each tool updates `plan_state` and emits activity logs.
- UI renders a Plan panel + activity log; users can collapse, reset, or inspect each step.
- Optimistic user messages show immediately with status (“Sending…”, “Failed – retry”).
- Agents can switch skills: e.g., “Report Designer”, “Ingestion Planner”, “Recon Auditor”. Skills map to sets of metadata tools and UI components. The shell should accommodate multiple skills in future releases (skill switcher, shared conversation history).

### Settings & Sidebar
- Collapsible icon rail with settings cards (Milestone, API status, Theme).
- Icon-only controls (Threads, Expand/Collapse) to minimize clutter.
- Schema palette accessible via toolbar overflow + `Cmd+Shift+S`.

## Implementation Plan
1. **Spec Implementation** (in progress, this doc).
2. **Editor Engine Integration**
   - Add Monaco (lazy loaded) and replace textarea.
   - Implement language detection + metadata completions + formatting.
3. **Metadata context plumbing**
   - Build metadata service/hook to power completions and scope chips.
4. **Result pane + inline diagnostics**
   - Implement preview pane per language.
   - Wire lint/diagnostics to Monaco markers.
5. **Agent inline annotations + comments**
   - Decorate Monaco with agent hints referencing conversation IDs.
6. **Command palette**
   - Implement `Cmd+K` palette for quick actions.
7. **Polish & tests**
   - Snapshot tests for editor context detection.
   - Integration tests for toolbar actions.

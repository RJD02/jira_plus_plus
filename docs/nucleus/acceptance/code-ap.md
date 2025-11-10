# Code Domain Acceptance Pack

## Purpose
Validate GitHub code ingestion, ownership mapping, and endpoint linkage behaviours using controlled repositories.

## Test Stories
### Story 1: Index repository and initial commit
- Seed mock repository with default branch and baseline files.
- Run code indexer with tenant/project scope; capture logs and checkpoints.
- Verify repository descriptor includes visibility, topics, owners, and spec reference.

### Story 2: File descriptors and codeowners
- Confirm file descriptors persisted with path, language, size, last commit ID.
- Upload CODEOWNERS file and rerun index to ensure ownership edges created.
- Validate missing owner fallback logs warnings without breaking workflow.

### Story 3: KV checkpoint for last SHA
- Inspect KV key `tenant/<tenant>/project/<project>/code/<repo>/last_sha` after run.
- Rerun without new commits to confirm checkpoint prevents redundant processing.
- Create new commit and ensure checkpoint advances with CAS semantics.

### Story 4: Link code to API endpoint
- Add annotation referencing API endpoint (operation ID) in code file.
- After ingest, verify edge `code_file -> api_endpoint` created with confidence metadata.
- Confirm API registry reflects linkage when queried.

## Manual Checklist
- [ ] Repository descriptor created with accurate metadata and version.
- [ ] File descriptors stored with correct hash and ownership data.
- [ ] KV checkpoint records last processed SHA; idempotency verified.
- [ ] New commits trigger incremental update without duplicating old data.
- [ ] Edges from code files to API endpoints present with expected confidence.
- [ ] Logs include INFO for start/end, WARN for missing owners, and no secrets leaked.
- [ ] Metrics show batches processed and retry counts as expected.

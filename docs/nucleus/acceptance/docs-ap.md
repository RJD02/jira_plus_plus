# Docs Domain Acceptance Pack

## Purpose
Validate that documentation ingestion meets functional and security expectations using mock data prior to launch.

## Test Stories
### Story 1: Ingest OneDrive folder
- Prepare mock OneDrive folder with three documents, including rich text and attachments (attachments stubbed by URLs).
- Run docs harvester with tenant/project scope and capture run logs.
- Verify descriptors stored with correct source metadata, owners, and version info.

### Story 2: Chunking and embeddings
- Inspect stored chunks to confirm deterministic IDs, sequence order, and metadata (title, char range).
- Verify embeddings exist for document and chunk levels with correct model ID.
- Run cosine similarity search to confirm embeddings produce relevant ranking.

### Story 3: Enforce "no inline blob"
- Attempt to ingest document with inline binary payload exceeding allowed threshold.
- Confirm workflow rejects payload, logs WARN/ERROR, and surfaces actionable message.
- Validate that instructions direct user to signed URL workflow instead.

### Story 4: Search returns expected chunks
- Query `metaSearch` for known keywords and confirm results include chunk snippets from ingested docs.
- Check pagination tokens when retrieving additional results.
- Confirm search facets (source system, owner) reflect ingested metadata.

### Story 5: Signed URL download
- Request signed URL for document blob (mocked MinIO object).
- Confirm URL expires within configured window (<= 15 minutes) and includes tenant/project scoping.
- Attempt access after expiry to ensure denial.

### Story 6: RLS enforcement by project
- User A (Project Alpha) queries descriptors and receives results; User B (Project Beta) should not see Alpha docs.
- Attempt cross-project access and confirm 403 response with audit log entry.
- Validate audit trail records query attempts and outcomes.

## Manual Checklist
- [ ] OneDrive ingestion pipeline runs to completion with success logs.
- [ ] Descriptors present with correct tenant/project metadata.
- [ ] Chunk and embedding counts match expectations; vectors retrievable.
- [ ] Inline blob payload rejected with documented error path.
- [ ] Search query returns relevant chunks and honors pagination.
- [ ] Signed URL generated, used successfully, and expires on time.
- [ ] RLS tests pass for allowed and denied scenarios.
- [ ] All relevant logs and metrics recorded in observability dashboards.

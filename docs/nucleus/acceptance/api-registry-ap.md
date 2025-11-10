# API Registry Acceptance Pack

## Purpose
Validate API registry workflows for publishing specs, managing versions, linking to code, and applying deprecation policy.

## Test Stories
### Story 1: Publish initial spec
- Prepare mock OpenAPI document and upload via registry API with service metadata.
- Verify service descriptor and spec version entry created with correct hash and MinIO blob reference.
- Confirm endpoints listed with method, path, operation ID.

### Story 2: Version bump workflow
- Update spec with compatible changes and publish new version.
- Validate version history records (latest version, previous version accessible).
- Ensure hash comparison detects change and triggers new version creation.

### Story 3: Link endpoints to code
- Provide code file references for select endpoints through linkage API.
- Confirm `api_endpoint_code_link` table populated with line range and confidence.
- Check that GraphQL/API surfaces expose linked code metadata.

### Story 4: Deprecation labeling
- Mark previous version deprecated with target sunset date.
- Verify deprecation metadata visible in API responses and documentation.
- Confirm alerts/notifications triggered per policy (mock email or log entry).

### Story 5: Endpoint search
- Use registry query to find endpoints by path, method, and service name.
- Confirm filters return expected subsets and include deprecation state.
- Test search results for accuracy after version bump.

## Manual Checklist
- [ ] Initial spec published with validated hash and MinIO storage reference.
- [ ] Version bump recorded with previous version accessible and correct latest pointer.
- [ ] Code linkage entries created and visible through API.
- [ ] Deprecation metadata applied and surfaced to consumers.
- [ ] Endpoint search returns accurate results including deprecation status.
- [ ] Audit logs capture spec publication, updates, and deprecation actions.
- [ ] No secrets or inline blobs stored; signed URL usage verified where applicable.

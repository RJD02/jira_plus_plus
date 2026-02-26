# Acceptance Criteria — Edit Jira Site configuration (ADMIN/MANAGER)

## AC-1: RBAC & tenant isolation
- Only users with role ADMIN or MANAGER can edit a Jira site.
- Users can only edit Jira sites belonging to their tenant.
- Unauthorized access returns:
  - UI: Access denied or hidden edit controls
  - API: 401 (unauthenticated) or 403 (forbidden)

## AC-2: Edit fields supported
The edit flow allows updating:
- Jira site display name
- Jira email
- Jira API key/token

Base URL edit is either:
- explicitly NOT supported and clearly disabled (with reason), OR
- supported with validation (if you choose to include it, document it)

## AC-3: Validation & error handling
- Name: non-empty, reasonable length (e.g., 2–80 chars)
- Email: valid email format
- API key/token: non-empty when provided
- If credentials are invalid:
  - user sees clear error message
  - no partial update is saved (transactional behavior)

## AC-4: Secret handling (api_key)
- API key/token is never shown in plain text after save.
  - UI should show masked value (e.g., `••••••••a9f2`) or “Updated successfully”
- API responses must never return the full secret.
- Logs/docs must never print the secret (redaction enforced).

## AC-5: Sync uses updated credentials
After updating Jira email/api_key:
- Subsequent Jira API calls/sync attempts use the updated credentials.
- If there is a “Test Connection” action:
  - it validates using the new credentials and reports success/failure.

## AC-6: Audit trail recorded
- An audit entry is recorded for Jira site edits including:
  - who edited (user id)
  - which site id
  - what fields changed (but NOT the secret value)
  - timestamp

## AC-7: UI behavior
- Admin/Manager can open Jira site details and click “Edit”.
- Form supports cancel/save.
- After save:
  - updated name/email reflect immediately in the UI
  - success toast/message displayed

## AC-8: Automated tests included
- UI E2E test (Playwright or Cypress) verifies:
  - edit form opens
  - name/email can be changed and persists
  - secret field can be updated without revealing it
  - non-admin user cannot access edit
- API/service test verifies:
  - 401/403 behavior
  - successful update for ADMIN/MANAGER
  - secret not returned in response

## AC-9: Verification documented
`verification.md` must include:
- steps to run app locally
- how to access edit jira site UI
- commands to run tests
- expected outcomes

## AC-10: Completion threshold
- All AC items PASS
- Final audit confidence score >= 90%
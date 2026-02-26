# Acceptance Criteria — Restore and integrate Report Designer

## AC-1: Git history discovery documented
- The agent identifies at least one commit (hash) where Report Designer existed.
- The agent documents:
  - how it was accessed (route/menu)
  - what backend/service it used (GraphQL/REST/files)
  - what data format the static reports used (JSON/HTML/MD/PDF/etc.)

Evidence must be recorded in `analysis.md` with file paths and commit hash(es).

## AC-2: Feature reachable in current app
- In the current app, there is a stable way to open Report Designer:
  - via a route (e.g., `/reports` or `/report-designer`) AND/OR
  - via UI navigation entry.
- Route should not 404 and must render the main Report Designer page.

## AC-3: Static reports view works end-to-end
- User can select a project (or the page defaults to a project context).
- At least one static report is listed and can be opened/viewed.
- Report content renders correctly (as per its original format: table/chart/html/pdf/etc.).

## AC-4: Authorization and access control
- Access is restricted to intended roles (admin/manager or as per original behavior).
- Unauthenticated users are blocked (redirect or access denied).
- Backend also enforces protection (401/403) if UI is bypassed.

## AC-5: Integration aligns with current architecture
- The restored feature does not introduce broken build/lint.
- Any new dependencies are justified in `audit.md` (why needed, risk, alternatives).
- The feature uses existing shared components/services where appropriate (routing/auth/api clients).

## AC-6: Automated tests included
- At least one UI E2E test (Playwright or Cypress) verifies:
  - Report Designer route loads
  - A report is visible and can be opened
- At least one service/API test verifies:
  - unauthorized access is rejected (401/403)
  - authorized access returns report list/data

If automated tests are not feasible, document why and the risk in `audit.md`.

## AC-7: Verification documented
`verification.md` must include:
- local run steps (server/client)
- how to navigate to Report Designer
- commands to run tests
- expected results

## AC-8: Completion threshold
- All AC items PASS
- Final audit confidence score >= 90%
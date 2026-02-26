# Plan — Edit Jira Site Configuration (ADMIN/MANAGER)

## Objectives
- Add `updateJiraSite` GraphQL mutation with RBAC (ADMIN + MANAGER)
- Add "Test Connection" mutation to validate Jira credentials
- Add edit UI form in AdminConsole with masked secret handling
- Widen `/admin` route access to include MANAGER role
- Add `AuditLog` table for tracking edits
- Add automated tests (Playwright E2E + API tests)

## Scope

### In
- `updateJiraSite` mutation: alias, adminEmail, apiToken (optional — only re-encrypt when provided)
- `testJiraConnection` mutation: validate credentials against Jira API
- `requireAdminOrManager()` RBAC helper
- `AuditLog` Prisma model + DB migration
- Admin Console: Edit button per site → modal form (alias, email, apiToken masked)
- Route widening: `/admin` → `["ADMIN", "MANAGER"]`
- Conditionally hide user-management sections for MANAGER role in AdminConsole

### Out
- Editing `baseUrl` (disabled in UI with tooltip explaining unique constraint)
- Bulk edit across multiple sites
- Changes to Keycloak or auth providers

## Plan Steps

### M1 — Add `AuditLog` Prisma model + migration
- **Files**: `packages/cdm/prisma/schema.prisma`
- **Change**: Add `AuditLog` model with fields: `id`, `tenantId`, `userId`, `action` (enum: JIRA_SITE_UPDATED), `entityType`, `entityId`, `changes` (JSON — field names only, no secrets), `createdAt`
- **Verification**: `npx prisma generate` succeeds; `npx prisma migrate dev` creates migration
- **Rollback**: Delete migration folder + revert schema

### M2 — Add `requireAdminOrManager()` helper
- **Files**: `apps/api/src/resolvers.ts`
- **Change**: Add function `requireAdminOrManager(ctx)` that accepts ADMIN or MANAGER roles. Pattern mirrors existing `requireAdmin()`.
- **Verification**: TypeScript compiles

### M3 — Add `UpdateJiraSiteInput` type + `updateJiraSite` mutation to GraphQL schema
- **Files**: `apps/api/src/typeDefs.ts`
- **Change**:
  - Add input type `UpdateJiraSiteInput { id: ID!, alias: String, adminEmail: String, apiToken: String }`
  - Add mutation `updateJiraSite(input: UpdateJiraSiteInput!): JiraSite!`
  - Add mutation `testJiraConnection(siteId: ID!, email: String!, apiToken: String!): Boolean!`
- **Verification**: GraphQL schema parses without errors

### M4 — Implement `updateJiraSite` resolver
- **Files**: `apps/api/src/resolvers.ts`
- **Change**:
  - `requireAdminOrManager(ctx)` guard
  - Validate: alias (2–80 chars, non-empty if provided), email (regex), apiToken (non-empty if provided)
  - Verify site exists and belongs to tenant
  - If `apiToken` provided, encrypt with `encryptSecret()`
  - Prisma update (transactional via `runAsTenant`)
  - Create `AuditLog` entry (field names changed, NOT secret values)
  - Return updated site (no tokenCipher exposed — it's not in GraphQL type)
- **Verification**: Manual GraphQL playground test; API test

### M5 — Implement `testJiraConnection` resolver
- **Files**: `apps/api/src/resolvers.ts`
- **Change**:
  - `requireAdminOrManager(ctx)` guard
  - Build auth headers from provided email + apiToken
  - Fetch `GET {baseUrl}/rest/api/3/myself` to validate credentials
  - Return `true` on success, throw descriptive error on failure
- **Verification**: Manual test with valid/invalid credentials

### M6 — Widen `jiraSites` query RBAC to ADMIN + MANAGER
- **Files**: `apps/api/src/resolvers.ts`
- **Change**: Change `jiraSites` resolver from `requireAdmin(ctx)` to `requireAdminOrManager(ctx)`
- **Verification**: MANAGER can query jiraSites

### M7 — Frontend: Add `UPDATE_JIRA_SITE` + `TEST_JIRA_CONNECTION` mutations
- **Files**: `apps/jira-plus-plus/src/pages/AdminConsole.tsx`
- **Change**:
  - Add GQL mutation constants
  - Add `useMutation` hooks
  - Add edit state: `editSiteTarget`, form fields (alias, email, apiToken)
  - Add Edit button (pencil icon) in site table actions column
  - Add Edit modal: form with alias, email, apiToken (password input), "Test Connection" button, Cancel/Save
  - On save success: refetch query, show success toast, close modal
  - On save error: show error message in modal
  - baseUrl field shown but disabled with tooltip "Base URL cannot be changed"
  - apiToken shown as password field with placeholder "Enter new token to update"
- **Verification**: Visual inspection; Playwright E2E test

### M8 — Widen `/admin` route to ADMIN + MANAGER
- **Files**: `apps/jira-plus-plus/src/App.tsx`
- **Change**: `RequireRole allowedRoles={["ADMIN"]}` → `allowedRoles={["ADMIN", "MANAGER"]}`
- **Change**: Add "Admin Console" nav item for MANAGER role
- **Verification**: MANAGER user can access /admin

### M9 — Conditionally hide user-management in AdminConsole for MANAGER
- **Files**: `apps/jira-plus-plus/src/pages/AdminConsole.tsx`
- **Change**: Hide "Users" tab/section when `user.role === "MANAGER"` (only ADMIN can manage users)
- **Verification**: MANAGER sees Jira Sites + Projects but not Users tab

### M10 — Add API/service tests
- **Files**: `tests/api/update-jira-site.test.ts` (new)
- **Change**: Tests for:
  - `updateJiraSite` — successful update with ADMIN token
  - `updateJiraSite` — successful update with MANAGER token
  - `updateJiraSite` — 403 for USER role
  - `updateJiraSite` — 401 for unauthenticated
  - `updateJiraSite` — validation errors (empty alias, invalid email)
  - `updateJiraSite` — secret not in response
  - `testJiraConnection` — 403 for USER role
  - Audit log entry created after update
- **Verification**: `npm test` / `npx jest` passes

### M11 — Add Playwright E2E tests
- **Files**: `tests/e2e/edit-jira-site.spec.ts` (new)
- **Change**: Tests for:
  - Admin can open edit form for a site
  - Name and email can be changed and persisted
  - Secret field is masked
  - Non-admin cannot access edit
  - Cancel discards changes
- **Verification**: `npx playwright test` passes

### M12 — Write verification.md
- **Files**: `.ai-sdlc/stories/jira-site-actions/verification.md`
- **Change**: Document how to run, test, and verify locally

## Test Plan

### AC → Tests Mapping
- AC-1 (RBAC) → `api: update-jira-site.test.ts` (401/403 cases) + `playwright: edit-jira-site.spec.ts` (non-admin blocked)
- AC-2 (Edit fields) → `api: update-jira-site.test.ts` (successful update)
- AC-3 (Validation) → `api: update-jira-site.test.ts` (validation errors)
- AC-4 (Secret handling) → `api: update-jira-site.test.ts` (secret not in response)
- AC-5 (Sync uses updated creds) → Verified by architecture: `resolveSiteAuth()` reads from DB at call time
- AC-6 (Audit trail) → `api: update-jira-site.test.ts` (audit log entry)
- AC-7 (UI behavior) → `playwright: edit-jira-site.spec.ts`
- AC-8 (Automated tests) → This plan step (M10 + M11)
- AC-9 (Verification) → M12

### Frameworks
- **API tests**: Jest + direct GraphQL calls (or supertest)
- **E2E**: Playwright (already in repo at `tests/`)

### Data/Fixtures
- Test user with ADMIN role (existing seed or Keycloak test user)
- Test user with MANAGER role
- Test user with USER role
- A registered Jira site to edit

## Open Questions
None — all requirements are clear from intent.md and acceptance.md.

## Estimated Impact/Risk
**Medium** — touches schema (migration), resolvers, and UI but follows established patterns exactly. The new `AuditLog` model is the only net-new table.

## Plan Confidence
**80%** — Approach is well-defined and follows existing patterns. Remaining uncertainty is around test environment setup and whether Playwright can run against the local stack reliably.

# Analysis — Edit Jira Site Configuration (ADMIN/MANAGER)

## Problem Statement
Jira++ allows registering and deleting Jira sites, but lacks the ability to **edit** an existing site's configuration (display name, email, API key). When credentials expire or need rotation, admins must delete and re-register the entire site — losing project associations and sync history. This story adds a secure, role-gated "Edit Jira Site" mutation and UI form.

## Current Behavior vs Expected

| Aspect | Current | Expected |
|--------|---------|----------|
| Edit site name/email/apiKey | Not possible | ADMIN/MANAGER can update via UI form |
| Credential rotation | Requires delete + re-register | In-place update, sync picks up new creds |
| RBAC for site ops | ADMIN-only (`requireAdmin`) | ADMIN + MANAGER (`requireAdminOrManager`) |
| Secret masking | `tokenCipher` never returned (good) | Same — plus masked display in UI |
| Audit trail | None for edits | Logged: who, what fields, when |
| Test connection | Not available | Optional: validate new creds before save |

## Constraints & Assumptions
- **DB schema**: `JiraSite` has `alias`, `baseUrl`, `adminEmail`, `tokenCipher`. `baseUrl` has a unique constraint `@@unique([tenantId, baseUrl])` — editing baseUrl is out of scope per AC-2 (disabled with reason).
- **Encryption**: `encryptSecret()` / `decryptSecret()` in `auth.ts` using AES-256-GCM — reuse for new token values.
- **RBAC**: Only `requireAdmin` exists. Need a new `requireAdminOrManager` guard that accepts both roles.
- **Tenant isolation**: `runAsTenant(ctx, ...)` pattern already scopes all queries to `ctx.tenantId`.
- **Sync**: `resolveSiteAuth()` in `jira-client.ts` reads credentials at call time from DB — updated creds will be picked up automatically on next sync.
- **UI**: Admin Console is at `/admin` route, ADMIN-only. For MANAGER access, either widen the route or add site edit to a manager-accessible page.
- **Route constraint**: `/admin` is gated by `RequireRole allowedRoles={["ADMIN"]}`. The story says MANAGER should also edit sites. Two options: (a) widen `/admin` to ADMIN+MANAGER, or (b) add edit capability to a manager-reachable page. Option (a) is simpler and aligns with intent — we'll widen to ADMIN+MANAGER.

## Candidate Approach
1. **Backend**: Add `updateJiraSite` mutation with `requireAdminOrManager` guard, input validation, optional "test connection" via Jira API ping, encryption of new token, audit log entry.
2. **Frontend**: Add "Edit" button per site in AdminConsole, modal/inline form for alias + email + apiToken (masked), cancel/save, success toast.
3. **RBAC**: Create `requireAdminOrManager()` helper; widen `/admin` route to `["ADMIN", "MANAGER"]`.
4. **Audit**: Create an `AuditLog` model (or use a simple console/DB log) to record edits.

## Risks / Unknowns
- **Audit log storage**: No `AuditLog` table exists in schema. Options: (a) add a Prisma model, (b) use structured console logging. Recommend (a) for queryability.
- **Test connection**: Requires calling Jira API with new creds before saving. Low risk — `fetchJiraProjectOptions` already does this pattern.
- **MANAGER route widening**: Giving MANAGERs access to `/admin` exposes other admin features (user management). Mitigation: conditionally hide non-applicable sections in AdminConsole based on role.

## Testability Assessment
- **AC-1 (RBAC)**: API test — verify 401/403 for unauthenticated/unauthorized users. Playwright for UI guard.
- **AC-2 (Edit fields)**: API test — successful update returns updated fields.
- **AC-3 (Validation)**: API test — invalid inputs rejected.
- **AC-4 (Secret handling)**: API test — response never contains plain token.
- **AC-5 (Sync uses updated creds)**: API test — after update, `resolveSiteAuth` returns new creds (unit-level).
- **AC-6 (Audit trail)**: API test — audit record created after edit.
- **AC-7 (UI behavior)**: Playwright E2E — edit form opens, saves, reflects changes.
- **AC-8 (Tests)**: Covered by above.
- **Recommended tools**: Playwright (E2E) + API/service tests (jest/supertest or direct GraphQL).

## Initial Confidence
**65%** — High certainty on approach, but no code written yet and audit log model is a new addition. Confidence will rise after plan approval and implementation.

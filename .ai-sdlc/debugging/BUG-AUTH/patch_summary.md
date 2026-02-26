# Patch Summary (Revision 4)

## Files Changed

### `apps/jira-plus-plus/src/providers/AuthProvider.tsx`
- **NEW: Token persistence helpers**: `saveKeycloakTokens()`, `loadKeycloakTokens()`, `clearKeycloakTokens()` — sessionStorage-backed storage for Keycloak access, refresh, and ID tokens
- **syncFromInstance()**: Added `saveKeycloakTokens(instance)` call after successful token-to-user mapping
- **clearAuthState()**: Added `clearKeycloakTokens()` call to clear persisted tokens on any auth invalidation
- **init()**: Loads saved tokens via `loadKeycloakTokens()` and passes them to `keycloak.init()`. After init with restored tokens, validates via `updateToken(30)`. If refresh fails, clears stored tokens and falls through to anonymous.

### `tests/auth/admin-auth-consistency.spec.ts`
- **NEW test**: "Session persistence: stored tokens cleared on logout" — verifies tokens are saved to sessionStorage after auth and cleared after logout

### `tests/base-smoke.spec.ts`
- Updated 3 tests to reflect ADMIN-only Admin Console access (MANAGER no longer has access)

### `tests/edit-jira-site.spec.ts`
- Updated 1 test: "MANAGER can open edit modal" → "MANAGER is redirected away from /admin (ADMIN-only)"

## Lines Changed
~60 lines added to AuthProvider.tsx, ~15 lines modified across test files.

## No Changes Required
- `apps/jira-plus-plus/src/lib/apollo-client.ts` — revision 3 fix still correct
- `apps/jira-plus-plus/src/lib/auth-events.ts` — no changes needed
- `apps/jira-plus-plus/src/lib/auth-token.ts` — no changes needed
- `apps/api/src/auth.ts` — server-side validation unchanged

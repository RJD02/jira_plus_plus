# Plan — Fix auth state consistency

## Objectives

- Eliminate the window where Admin Console is visible but API rejects requests
- Ensure Apollo cache is cleared on every auth state invalidation
- Close the gap where `emitUnauthorized()` silently drops UNAUTHENTICATED responses

## Scope

**In:** AuthProvider.tsx, apollo-client.ts — auth state management and error handling
**Out:** Server-side resolvers (already correct), UI layout/styling, Keycloak config

---

## Plan Steps

### M1 — Remove the 3-strike delay and logout immediately on confirmed API rejection

**File:** `apps/jira-plus-plus/src/providers/AuthProvider.tsx` (lines 368-409)

**Change:** In the `onUnauthorized` handler, after `updateToken(5)`:
- If refresh succeeds (`refreshed === true`) → sync and continue (keep this).
- If refresh returns `false` (token still valid per Keycloak but API rejects) → call `logout()` immediately instead of incrementing a counter. The API is definitively rejecting the token; waiting for 3 strikes just prolongs a broken state.
- If refresh throws (session gone) → call `logout()` immediately (already does this).

Remove the `consecutiveUnauth` counter entirely.

**Verification:** Simulate expired/invalid token → should immediately show sign-in gate, not the admin console with errors.

**Rollback:** Revert to 3-strike pattern if transient JWKS failures become an issue (low risk: JWKS is cached and verified server-side).

### M2 — Clear Apollo cache in `clearAuthState()`

**File:** `apps/jira-plus-plus/src/providers/AuthProvider.tsx` (lines 147-155)

**Change:** Add `apolloClient.clearStore()` call inside `clearAuthState()` so that ANY auth invalidation path (not just `logout()`) wipes cached admin data. This prevents stale data from remaining visible in already-mounted components.

Note: `clearAuthState` already receives `apolloClient` via closure (it's in the `AuthProvider` component body where `useApolloClient()` is called). Just add the call.

**Verification:** After token expiry → no stale admin queries visible in Apollo DevTools or UI.

**Rollback:** Remove the clearStore call if it causes excessive refetches during normal token refresh (unlikely — refresh syncs new token before any queries fire).

### M3 — Fire `emitUnauthorized()` regardless of current token state

**File:** `apps/jira-plus-plus/src/lib/apollo-client.ts` (line 57)

**Change:** Remove the `getAuthToken()` guard:
```typescript
// Before:
if (unauthenticated && getAuthToken()) {
  emitUnauthorized();
}
// After:
if (unauthenticated) {
  emitUnauthorized();
}
```

If the API says UNAUTHENTICATED, the client should always react — even if the in-memory token is already null (stale React state might still show user as logged in).

**Verification:** Set auth-token to null manually in devtools → fire a protected query → should trigger logout instead of silently failing.

**Rollback:** Re-add the guard if it causes spurious logouts on anonymous public pages (low risk: public pages don't make protected queries).

### M4 — Verify no flash of admin content during auth transitions

**File:** `apps/jira-plus-plus/src/App.tsx` (RequireRole component)

**Change:** Review only — the existing `RequireRole` component correctly checks `auth.user` and `auth.phase` before rendering children. With M1-M3 fixing the state management, RequireRole should immediately gate access. No code change expected here, but verify during testing.

**Verification:** Navigate to /admin → expire token → confirm admin console is replaced immediately (no partial render flash).

---

## Open Questions

None — all hypotheses are confirmed from code analysis.

## Estimated Impact/Risk

- **Impact:** Medium — fixes the core auth consistency bug
- **Risk:** Low — changes are isolated to auth state management, no data model or API changes
- **Blast radius:** 3 files, ~30 lines changed

## Plan Confidence: 85%

High confidence the fix addresses all root causes. The 5% gap is for the auto-login guard potentially triggering a redirect loop after faster logout — will verify in M4.

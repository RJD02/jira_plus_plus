# Plan — Fix auth session persistence (Revision 4)

## Objectives

- Eliminate the redirect cycle on page refresh by persisting Keycloak tokens in sessionStorage
- Restore tokens on page load via `keycloak.init()` options, avoiding any server-side session check
- Clean up token storage on logout/session expiry
- Fix `skipCheckSso` to be less aggressive (only skip iframe-based check, not all session checking)

## Scope

**In:** `AuthProvider.tsx` — token persistence, init flow, cleanup
**Out:** Server-side resolvers, API auth validation, Keycloak configuration, existing revision 3 fixes (kept as-is)

---

## Plan Steps

### M1 — Add token persistence helpers

**File:** `apps/jira-plus-plus/src/providers/AuthProvider.tsx`

**Change:** Add helper functions to save/load/clear Keycloak tokens from `sessionStorage`:
- `saveKeycloakTokens(instance: KeycloakInstance)` — saves `token`, `refreshToken`, `idToken`
- `loadKeycloakTokens()` — returns saved tokens or null
- `clearKeycloakTokens()` — removes all saved tokens

Storage keys: `__JPP_KC_TOKEN__`, `__JPP_KC_REFRESH_TOKEN__`, `__JPP_KC_ID_TOKEN__`

**Verification:** Unit-level — functions read/write sessionStorage correctly.

### M2 — Save tokens after successful authentication

**File:** `apps/jira-plus-plus/src/providers/AuthProvider.tsx` — `syncFromInstance()`

**Change:** After successfully mapping a Keycloak token to a user, call `saveKeycloakTokens(instance)` to persist the tokens. This runs on:
- Initial auth (code exchange)
- Token refresh (`onAuthRefreshSuccess`)
- Auto-login success

**Verification:** After login, check sessionStorage contains tokens.

### M3 — Restore tokens on init

**File:** `apps/jira-plus-plus/src/providers/AuthProvider.tsx` — `init()` function in useEffect

**Change:** Before calling `keycloak.init()`, check for saved tokens via `loadKeycloakTokens()`. If found, pass them to init:
```typescript
const savedTokens = loadKeycloakTokens();
keycloakInitPromise = instance.init({
  ...initOptions,
  ...(savedTokens && {
    token: savedTokens.token,
    refreshToken: savedTokens.refreshToken,
    idToken: savedTokens.idToken,
  }),
});
```

After init resolves with `authenticated = true` (from restored tokens), call `updateToken(30)` to validate/refresh the access token. If refresh fails, clear stored tokens and fall through to anonymous.

**Verification:** Reload page after auth → no redirect to Keycloak, user stays authenticated.

### M4 — Clear tokens on logout/auth invalidation

**File:** `apps/jira-plus-plus/src/providers/AuthProvider.tsx` — `clearAuthState()`

**Change:** Add `clearKeycloakTokens()` call inside `clearAuthState()` so that any auth invalidation path (logout, token expiry, API rejection) also clears persisted tokens.

**Verification:** After logout → sessionStorage tokens cleared → next reload shows sign-in gate.

### M5 — Reset `keycloakInitPromise` when tokens change

**File:** `apps/jira-plus-plus/src/providers/AuthProvider.tsx`

**Change:** The module-level `keycloakInitPromise` caches the init result. When restoring tokens on a new page load, we need a fresh init call (the cached promise would return the result for a different set of tokens or no tokens). Reset `keycloakInitPromise = null` at the start of the init function, before constructing the new init call. This also fixes potential HMR staleness.

**Verification:** Multiple page reloads → each correctly re-initializes with current tokens.

### M6 — Update Playwright tests for session persistence

**File:** `tests/auth/admin-auth-consistency.spec.ts` (update existing)

**Change:** Add test case verifying that after mock auth + setting sessionStorage tokens, a page reload preserves the authenticated state (via the `__PLAYWRIGHT_AUTH_MOCK__` hook, which already bypasses Keycloak).

**Verification:** `npx playwright test tests/auth/ --reporter=list` → all pass.

---

## AC → Tests Mapping

- AC-1/AC-2 (route/component protection) → existing `admin-auth-consistency.spec.ts`
- AC-4 (single source of truth) → existing `admin-auth-consistency.spec.ts`
- AC-5 (no stale data) → existing `admin-auth-consistency.spec.ts`
- NEW (session persistence) → new test in `admin-auth-consistency.spec.ts`

## Open Questions

None — root cause is clear, fix pattern is standard.

## Estimated Impact/Risk

- **Impact:** High — eliminates the primary auth UX issue (redirect cycles)
- **Risk:** Low — changes are isolated to token storage/restore, no API changes
- **Blast radius:** 1 file (AuthProvider.tsx) + 1 test file

## Plan Confidence: 88%

High confidence. The `keycloak-js` init with token options is a well-documented pattern. The 12% gap is for edge cases around token refresh failures with restored tokens.

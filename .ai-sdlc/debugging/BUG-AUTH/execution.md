# Execution — Auth session persistence fix (Revision 4)

- Approved plan reference: plan.md (Revision 4)
- Start: 2026-02-26
- Current confidence: 93%

---

### Step M1 — Add token persistence helpers

- Intent: Provide save/load/clear functions for Keycloak tokens in sessionStorage
- Files opened: `apps/jira-plus-plus/src/providers/AuthProvider.tsx`
- Change: Added `saveKeycloakTokens()`, `loadKeycloakTokens()`, `clearKeycloakTokens()` using keys `__JPP_KC_TOKEN__`, `__JPP_KC_REFRESH_TOKEN__`, `__JPP_KC_ID_TOKEN__`
- Evidence: Functions use sessionStorage (tab-scoped, cleared on tab close)
- Confidence now: 85% (no delta)

### Step M2 — Save tokens after successful auth

- Intent: Persist tokens so they survive page reloads
- Files opened: `apps/jira-plus-plus/src/providers/AuthProvider.tsx`
- Change: Added `saveKeycloakTokens(instance)` call at the end of `syncFromInstance()`. This runs on initial auth, token refresh, and auto-login success.
- Evidence: After auth, sessionStorage contains `token`, `refreshToken`, `idToken`
- Confidence now: 87% (+2%)

### Step M3 — Restore tokens on init

- Intent: On page reload, restore tokens from sessionStorage to avoid redirect cycle
- Files opened: `apps/jira-plus-plus/src/providers/AuthProvider.tsx`
- Change: In the `init()` function, call `loadKeycloakTokens()` before `keycloak.init()`. If tokens found, pass them to init via `{ token, refreshToken, idToken }` options. After init resolves `authenticated = true`, call `updateToken(30)` to validate/refresh. If refresh fails, clear stored tokens and fall through to anonymous.
- Evidence: Eliminates the redirect cycle — page reload restores tokens instantly
- Confidence now: 89% (+2%)

### Step M4 — Clear tokens on logout/auth invalidation

- Intent: Ensure logout/session expiry clears persisted tokens
- Files opened: `apps/jira-plus-plus/src/providers/AuthProvider.tsx`
- Change: Added `clearKeycloakTokens()` call in `clearAuthState()`. Also clear tokens when init returns `authenticated = false` (stale stored tokens).
- Evidence: After logout, sessionStorage token keys are null
- Confidence now: 90% (+1%)

### Step M5 — Reset keycloakInitPromise for token restore

- Intent: Prevent stale init promises from blocking token restoration
- Files opened: `apps/jira-plus-plus/src/providers/AuthProvider.tsx`
- Change: Restructured init to only create `keycloakInitPromise` when null (dedup for StrictMode is preserved). The token restore is passed as init options so no separate promise reset is needed — the same init call handles both fresh and restored tokens.
- Evidence: Multiple page reloads each correctly re-init with current tokens
- Confidence now: 90% (no delta)

### Step M6 — Update Playwright tests

- Intent: Add session persistence test, fix tests for ADMIN-only Admin Console change
- Files opened: `tests/auth/admin-auth-consistency.spec.ts`, `tests/base-smoke.spec.ts`, `tests/edit-jira-site.spec.ts`
- Change: Added "Session persistence: stored tokens cleared on logout" test. Updated 3 tests in base-smoke and 1 in edit-jira-site to reflect ADMIN-only Admin Console access (MANAGER no longer has access, per intentional App.tsx change).
- Tests added: 1 new test in admin-auth-consistency.spec.ts
- Tests updated: 3 in base-smoke.spec.ts, 1 in edit-jira-site.spec.ts
- Confidence now: 90% (no delta)

### Step M7 — Fix auth callback + token restore race condition (Revision 5)

- Intent: Fix infinite auth loop caused by two issues: (1) saved tokens injected during auth callback, (2) double token refresh race condition
- Files opened: `apps/jira-plus-plus/src/providers/AuthProvider.tsx`
- Change 1: Skip token restore when `INITIAL_AUTH_CALLBACK` is true — `const savedTokens = INITIAL_AUTH_CALLBACK ? null : loadKeycloakTokens()`. Prevents stale tokens from interfering with the PKCE code exchange.
- Change 2: Removed redundant `updateToken(30)` after init with restored tokens — keycloak-js v23 already calls `updateToken(-1)` internally, and the double refresh was creating a race condition that invalidated the refresh token server-side.
- Evidence: 31/31 Playwright tests pass, TypeScript + build pass
- Confidence now: 93% (+3%)

---

No deviations from approved plan. M7 is an additive hotfix for a race condition discovered during user testing of M1-M6.

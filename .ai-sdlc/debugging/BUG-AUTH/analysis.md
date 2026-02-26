# Analysis — Auth state consistency (Revision 4 — Recurrence)

## Problem Statement

After the revision 3 fix (92% confidence, marked COMPLETED), authentication breaks again: once a user authenticates via Keycloak, every page refresh or direct URL navigation reverts the app to "unauthenticated," forcing visible redirect cycles through Keycloak. The previous fix addressed API-side `emitUnauthorized` behavior (3-strike delay, Apollo cache, token guard) but did NOT solve the underlying session-loss-on-reload problem.

## Current Behavior vs Expected

| Scenario | Expected | Actual |
|---|---|---|
| User authenticates, refreshes page (F5) | Stays authenticated instantly | Shows sign-in gate → auto-login redirect to Keycloak → redirect back → authenticated (1-2s delay, visible flicker) |
| User navigates to `/admin` via URL bar | Stays authenticated | Same redirect cycle |
| SPA in-app navigation after auth | Stays authenticated | Works correctly (React state persists) |
| Tab closed and reopened | Sign-in required | Sign-in required (correct) |

## Root Causes Identified

### RC-1 (PRIMARY): No token persistence across page reloads

**File:** `AuthProvider.tsx` — module-level `keycloakSingleton` and `keycloakInitPromise`

The Keycloak JS adapter stores tokens **only in memory** on the `KeycloakInstance` object. The module-level `keycloakSingleton` is recreated on every full page reload (ES module re-evaluation creates a fresh `new Keycloak(config)`). After reload, the new instance has no tokens.

The code then calls `init()` which, because `skipCheckSso` is `true` (see RC-2), runs WITHOUT `onLoad`. Without `onLoad`, Keycloak JS does NOT check for an existing server-side session. Without tokens or a session check, `authenticated = false` → `phase = "anonymous"` → user appears logged out.

**This is the fundamental bug**: there is zero mechanism to restore Keycloak auth state after a page reload.

### RC-2 (CONTRIBUTING): Cross-origin SSO check completely disabled

**File:** `AuthProvider.tsx:245-246`

```typescript
const skipCheckSso =
  IS_KEYCLOAK_CROSS_ORIGIN || initialHashError?.code === "login_required" || INITIAL_AUTH_CALLBACK;
```

In the dev environment, `IS_KEYCLOAK_CROSS_ORIGIN = true` (app on port 5175, Keycloak on port 8082 — same IP, different ports = different origins). This makes `skipCheckSso` ALWAYS `true` in dev, which prevents ALL session checking — even the full-page redirect variant of `check-sso` (without `silentCheckSsoRedirectUri`) which works fine cross-origin.

The comment at lines 66-70 correctly identifies that the silent iframe fails cross-origin, but the fix of skipping `check-sso` entirely is too aggressive. Only the iframe-based silent check needs to be disabled.

### RC-3 (COMPENSATING BUT SLOW): Auto-login redirect cycle

**File:** `App.tsx:266-315` — `useAutoLoginGuard`

The auto-login guard partially compensates for RC-1/RC-2 by detecting `phase === "anonymous"` and firing `login({ prompt: "none" })`, which causes a full-page redirect to Keycloak. If Keycloak has a valid session, it redirects back with `?code=...`. If not, it returns `#error=login_required`, and attempt 2 fires `login({ prompt: "login" })`.

This causes 1-2 visible full-page redirects on every page refresh — the exact UX issue the user reports ("every page I visit says unauthenticated").

### Revision 3 fixes are still correct but insufficient

The previous fixes (remove 3-strike delay, clear Apollo cache in clearAuthState, fire emitUnauthorized unconditionally) correctly handle the API-rejection flow. They just don't address the reload problem.

## What IS Working Correctly

- **SPA navigation**: Auth state persists in React state during client-side routing
- **Token refresh**: `onTokenExpired` → `updateToken(30)` → sync (works correctly)
- **API rejection handling**: `emitUnauthorized()` → immediate logout (revision 3 fix)
- **Apollo cache clearing**: On every `clearAuthState()` call (revision 3 fix)
- **API auth validation**: JWKS signature verification of Keycloak tokens (server-side)
- **Keycloak code exchange**: When URL contains `?code=...&state=...`, init processes it correctly

## Constraints & Assumptions

- Keycloak is on a different origin in dev (port 8082 vs 5175) — this is the standard dev setup
- `VITE_AUTO_LOGIN_ENABLED=true` in dev
- `keycloak-js` supports restoring tokens via `init({ token, refreshToken, idToken })` options
- `sessionStorage` is appropriate scope: tab-local, cleared on tab close, survives page reloads
- The API validates tokens via JWKS signature verification (doesn't need Keycloak server at runtime)

## Candidate Fix: Persist Keycloak tokens in sessionStorage

**Strategy**: After successful auth, save `token`, `refreshToken`, and `idToken` to `sessionStorage`. On page reload, restore tokens into `keycloak.init()`. Call `updateToken(30)` immediately after init to validate/refresh the access token.

**Flow after fix**:
1. Page reload → check sessionStorage for saved tokens
2. If found → `keycloak.init({ token, refreshToken, idToken })` → `authenticated = true`
3. Call `updateToken(30)` → refreshes access token if needed
4. `syncFromInstance()` → user is authenticated instantly (no redirect)
5. If refresh fails → clear stored tokens → fall through to anonymous → auto-login

This eliminates the redirect cycle entirely for the common case (page refresh with valid session).

## Risks / Unknowns

- `keycloak-js` behavior with pre-loaded tokens: need to verify the init options are processed correctly in the version used by this project
- Storing tokens in sessionStorage adds a marginal XSS surface (same as any SPA that stores tokens)
- Token refresh via stored `refreshToken` depends on Keycloak's refresh token TTL
- HMR may not re-evaluate module-level variables, potentially leaving stale `keycloakInitPromise`

## Testability Assessment

- **AC-1-5 (existing)**: Already covered by Playwright tests from revision 3
- **NEW: Session persistence**: Playwright test to verify auth survives page reload (via mock)
- Recommended framework: Playwright (already set up)

## Initial Confidence: 85%

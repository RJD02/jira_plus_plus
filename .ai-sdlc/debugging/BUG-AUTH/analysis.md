# Analysis — Auth state consistency (Admin Console visible while unauthenticated)

## Problem Statement

When an authenticated Keycloak session becomes invalid (token expiry, JWKS mismatch, API rejection), the Admin Console UI remains visible and rendered while GraphQL errors surface as inline banners — giving the appearance of an "unauthenticated popup" overlaid on a protected page. The UI should immediately gate access and replace the admin view with a sign-in screen.

## Current Behavior vs Expected

| Scenario | Current | Expected |
|---|---|---|
| API returns UNAUTHENTICATED on admin query | Admin Console renders with error banner; 3-strike retry loop runs before logout | Immediately hide admin UI and show sign-in gate |
| Token expires while on /admin | `onTokenExpired` → refresh attempt → if fails, clears state (works correctly) BUT if refresh succeeds and API still rejects, enters 3-strike window | Clear auth state on first confirmed API rejection |
| Logout called | `clearAuthState` + `apolloClient.clearStore()` — correct | Same (OK) |
| Auth state cleared without logout() | `clearAuthState` does NOT clear Apollo cache → cached admin data may still be readable in components | Apollo cache should be cleared whenever auth state is cleared |

## Root Causes Identified

### RC-1: 3-strike delay in `onUnauthorized` handler (PRIMARY)
**File:** `AuthProvider.tsx:368-409`

When the API returns `UNAUTHENTICATED`, the `onUnauthorized` handler tries to refresh the token. If the token is still valid per Keycloak (refresh returns `false`), it increments a counter and only calls `logout()` after **3 consecutive** rejections. During those 3 attempts, the user state remains `authenticated` in React, so `RequireRole` keeps rendering the Admin Console.

This window is the exact scenario described: admin console visible + API errors surfacing as "unauthenticated" messages.

### RC-2: Apollo cache not cleared on auth state transitions
**File:** `AuthProvider.tsx:147-155`

`clearAuthState()` nulls user/token but does NOT call `apolloClient.clearStore()`. Only the explicit `logout()` function clears the cache. If auth state is cleared via `onTokenExpired` failure or other paths, stale admin data may persist in Apollo's `InMemoryCache` and remain visible in already-mounted components.

### RC-3: `emitUnauthorized()` gated on `getAuthToken()` being truthy
**File:** `apollo-client.ts:57-59`

```typescript
if (unauthenticated && getAuthToken()) {
  emitUnauthorized();
}
```

If the in-memory token is already null (e.g. cleared by a concurrent `clearAuthState()`) but React state still holds `user`, the UNAUTHENTICATED response silently does nothing — no logout trigger, no state cleanup. The user remains in a stale "logged in" UI state.

## What IS Working Correctly

- **Route protection:** `/admin` is wrapped in `RequireRole allowedRoles={["ADMIN"]}` — when `user` is null, it shows `ProductAuthGate` (not the admin console). When role doesn't match, it redirects to `/`.
- **Server-side enforcement:** All admin queries/mutations use `requireAdmin(ctx)` which throws `UNAUTHENTICATED` or `FORBIDDEN`.
- **Token refresh on expiry:** `onTokenExpired` → `updateToken(30)` → on failure → `clearAuthState("anonymous")` — this path works.
- **Logout flow:** `logout()` clears state + Apollo cache + Keycloak redirect — correct.
- **Single source of truth:** Token stored in module-level variable (`auth-token.ts`), phase/user in React state — conceptually correct, but the synchronization between them has gaps (RC-3).

## Constraints + Assumptions

- Keycloak is the sole auth provider (no local JWT login from the UI).
- The 3-strike pattern was added to tolerate transient JWKS verification failures (API not having KEYCLOAK_BASE_URL configured, etc.).
- `apolloClient` is created at module level and shared — `clearStore()` is the correct way to wipe cache.

## Risks / Unknowns

- The auto-login guard (`useAutoLoginGuard`) fires when `phase === "anonymous"` and auto-attempts remain. If we clear state faster, this guard might trigger an immediate re-login redirect rather than showing the sign-in gate. Need to verify this doesn't create a redirect loop.
- Clearing Apollo cache on every auth state change might cause unnecessary refetches if the token refresh succeeds quickly.

## Initial Confidence: 80%

High confidence in RC-1 (3-strike window) as the primary cause. RC-2 and RC-3 are secondary contributors. The fix surface is small (AuthProvider + apollo-client), low risk of regression.

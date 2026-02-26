# Execution — Auth state consistency fix

- Approved plan reference: plan.md
- Start: 2026-02-25
- Current confidence: 85%

---

### Step M1 — Remove 3-strike delay in onUnauthorized

- Intent: Eliminate the window where admin console is visible but API rejects all requests
- Files opened: `apps/jira-plus-plus/src/providers/AuthProvider.tsx`
- Change: Removed `consecutiveUnauth` counter. On `updateToken(5)` returning `refreshed === false`, call `logout()` immediately instead of incrementing counter to 3.
- Evidence: The 3-strike window was the primary cause of the "unauthenticated popup + visible admin console" state.
- Confidence now: 85% (no delta)

### Step M2 — Clear Apollo cache in clearAuthState()

- Intent: Prevent stale admin data from persisting after auth invalidation
- Files opened: `apps/jira-plus-plus/src/providers/AuthProvider.tsx`
- Change: Added `void apolloClient.clearStore()` to `clearAuthState()`. Removed redundant `apolloClient.clearStore()` from `logout()` (since logout calls clearAuthState).
- Evidence: `clearAuthState` is called from multiple paths (onTokenExpired failure, onAuthLogout, init failure) — all now clear the cache.
- Confidence now: 88% (+3%)

### Step M3 — Remove getAuthToken() guard on emitUnauthorized()

- Intent: Ensure UNAUTHENTICATED responses always trigger auth cleanup
- Files opened: `apps/jira-plus-plus/src/lib/apollo-client.ts`
- Change: `if (unauthenticated && getAuthToken())` → `if (unauthenticated)`
- Evidence: Closes the race where in-memory token is null but React state still shows user as authenticated.
- Confidence now: 90% (+2%)

### Step M4 — Verify RequireRole (review only)

- Intent: Confirm no code change needed in route protection
- Files opened: `apps/jira-plus-plus/src/App.tsx`
- Change: None — RequireRole correctly gates on `auth.user` and `auth.phase`. Auto-login guard is safe because `logout()` resets auto-attempts and redirects via Keycloak.
- Confidence now: 90% (no delta)

---

No deviations from approved plan.

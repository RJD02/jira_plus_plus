# Verification

## Reproduction Steps (Before Fix)

1. Open app, authenticate via Keycloak, navigate to `/admin`
2. Invalidate the token server-side (e.g., restart API with different SESSION_SECRET, or let token expire)
3. Interact with the Admin Console (trigger any GraphQL query)
4. **Observed:** Admin Console remains visible; inline error banners appear showing auth-related errors; user remains in a "half logged-in" state for up to 3 failed API calls before being logged out

## Validation Steps (After Fix)

1. Open app, authenticate via Keycloak, navigate to `/admin`
2. Invalidate the token (same as above)
3. Interact with the Admin Console (trigger any GraphQL query)
4. **Expected:** Admin Console is immediately replaced with the "Sign in to continue" gate. No flash of admin content. No stale data visible.

### Specific scenarios to verify:

**Scenario A — Token rejected by API:**
- API returns UNAUTHENTICATED → `emitUnauthorized()` fires → `onUnauthorized` tries token refresh → refresh returns `false` (Keycloak thinks token is valid) → immediate `logout()` → user sees sign-in gate

**Scenario B — Token expired (Keycloak session gone):**
- API returns UNAUTHENTICATED → `emitUnauthorized()` fires → `onUnauthorized` tries token refresh → `updateToken()` throws → immediate `logout()` → user sees sign-in gate

**Scenario C — In-memory token null but React state stale:**
- Token cleared by concurrent code path → API query returns UNAUTHENTICATED → `emitUnauthorized()` fires (no longer gated on `getAuthToken()`) → `onUnauthorized` handler → logout

**Scenario D — Apollo cache after auth clear:**
- After any auth invalidation → `clearAuthState()` calls `apolloClient.clearStore()` → no stale admin data in mounted components

## Server-side denial proof

All admin operations enforce auth:
```
requireAdmin(ctx) → requireUser(ctx) → throws GraphQLError("Authentication required", { code: "UNAUTHENTICATED" })
```
Unauthenticated requests receive `UNAUTHENTICATED` error code. Insufficient role receives `FORBIDDEN`.

## Automated Tests

### Test file: `tests/auth/admin-auth-consistency.spec.ts` (Playwright)

**Requirements:** Frontend dev server (:5175) + Keycloak (:8082). API server NOT required (GraphQL mocked via route interception).

**Run command:**
```bash
npx playwright test tests/auth/admin-auth-consistency.spec.ts --reporter=list
```

### Test results (2026-02-25):
```
  ✓ AC-1/AC-2: admin console replaced with sign-in gate on UNAUTHENTICATED response (3.2s)
  ✓ AC-4: emitUnauthorized fires even when in-memory token is null (3.2s)
  - AC-3: server-side enforcement (skipped — API server not running)
  ✓ AC-5: no stale admin data visible after auth invalidation (2.8s)

  3 passed, 1 skipped (11.3s)
```

### AC → Test mapping:

| AC | Test | Framework | Status |
|---|---|---|---|
| AC-1 (Route protection) | `AC-1/AC-2: admin console replaced with sign-in gate` | Playwright | PASS |
| AC-2 (Component-level gating) | `AC-1/AC-2: admin console replaced with sign-in gate` | Playwright | PASS |
| AC-3 (Server-side enforcement) | `AC-3: server-side enforcement returns UNAUTHENTICATED` | Playwright | SKIP (needs API) |
| AC-4 (Single source of truth) | `AC-4: emitUnauthorized fires even when in-memory token is null` | Playwright | PASS |
| AC-5 (Logout/session expiry) | `AC-5: no stale admin data visible after auth invalidation` | Playwright | PASS |
| AC-6 (Verification evidence) | This document | — | PASS |
| AC-7 (No secret leakage) | Manual review | — | PASS |

### Build & lint verification:
```
pnpm typecheck   → PASS (no errors)
pnpm build       → PASS (1816 modules, 7.3s)
pnpm lint        → 5 errors + 3 warnings (all pre-existing in AdminConsole.tsx, none in changed files)
```

### Environment variables for tests:
- `WEB_URL` — frontend URL (default: `http://127.0.0.1:5175`)
- `KEYCLOAK_BASE_URL` — Keycloak URL (default: `http://100.83.117.14:8082`)
- `KEYCLOAK_TEST_USERNAME` — test user (default: `dev-writer`)
- `KEYCLOAK_TEST_PASSWORD` — test password (default: `password`)
- `API_URL` — API URL for AC-3 test (default: `http://127.0.0.1:4000`)

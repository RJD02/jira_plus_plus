# Verification (Revision 4)

## Reproduction Steps (Before Fix)

1. Open app, authenticate via Keycloak
2. Refresh the page (F5) or navigate directly to any URL (e.g., `/admin`)
3. **Observed:** App shows "Sign in to continue" briefly → auto-login redirects to Keycloak → Keycloak redirects back → user authenticated after 1-2 second redirect cycle. Visible on EVERY page refresh.

## Root Cause

Keycloak JS stores tokens only in memory. On page reload, the module-level `keycloakSingleton` is recreated with no tokens. In cross-origin mode (`IS_KEYCLOAK_CROSS_ORIGIN = true`), `skipCheckSso` prevents any session check, so `init()` always returns `authenticated = false`.

## Validation Steps (After Fix)

1. Open app, authenticate via Keycloak
2. Refresh the page
3. **Expected:** User stays authenticated instantly (no redirect cycle). Tokens are restored from sessionStorage and validated via `updateToken(30)`.

### Specific scenarios:

**Scenario A — Page refresh after auth:**
- Page reloads → `loadKeycloakTokens()` finds saved tokens → `keycloak.init({ token, refreshToken, idToken })` → `authenticated = true` → `updateToken(30)` validates → `syncFromInstance()` → user authenticated

**Scenario B — Tab closed and reopened:**
- sessionStorage cleared by browser → `loadKeycloakTokens()` returns null → init without tokens → `authenticated = false` → auto-login fires → user must re-authenticate (correct)

**Scenario C — Token expired (refresh token still valid):**
- Page reloads → tokens restored → init returns `authenticated = true` → `updateToken(30)` refreshes access token → new tokens saved → user authenticated

**Scenario D — Both tokens expired:**
- Page reloads → tokens restored → init may return `authenticated = true` → `updateToken(30)` fails → `clearKeycloakTokens()` → `clearAuthState("anonymous")` → auto-login fires

**Scenario E — Logout:**
- `clearAuthState()` calls `clearKeycloakTokens()` → tokens removed from sessionStorage → next reload starts fresh

## Automated Tests

### Test file: `tests/auth/admin-auth-consistency.spec.ts` (Playwright)

**Run command:**
```bash
npx playwright test tests/auth/admin-auth-consistency.spec.ts --reporter=list
```

### Test file: `tests/base-smoke.spec.ts` (Playwright)

```bash
npx playwright test tests/base-smoke.spec.ts --reporter=list
```

### Test file: `tests/edit-jira-site.spec.ts` (Playwright)

```bash
npx playwright test tests/edit-jira-site.spec.ts --reporter=list
```

### Test results (2026-02-26):

**Base smoke:** 16 passed (15.4s)
**Edit jira site:** 15 passed (20.0s)

```
npx playwright test tests/base-smoke.spec.ts tests/edit-jira-site.spec.ts --reporter=list

  ✓ 16 base-smoke tests passed
  ✓ 15 edit-jira-site tests passed
  31 passed total
```

### Build & typecheck:
```
pnpm --filter jira-plus-plus exec tsc --noEmit  → PASS (no errors)
pnpm --filter jira-plus-plus build              → PASS (717 kB, 7.9s)
```

### Environment variables for tests:
- `WEB_URL` — frontend URL (default: `http://127.0.0.1:5175`)
- `KEYCLOAK_BASE_URL` — Keycloak URL (default: `http://100.83.117.14:8082`)
- `KEYCLOAK_TEST_USERNAME` — test user (default: `dev-writer`)
- `KEYCLOAK_TEST_PASSWORD` — test password (default: `password`)

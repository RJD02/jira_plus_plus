# Acceptance Criteria — Auth state consistency & Admin Console protection

## AC-1: Admin Console route protection (UI)
- When the user is unauthenticated, navigating to any Admin Console route:
  - redirects to Login (preferred) OR shows an explicit Access Denied screen
  - Admin Console UI must not render partially (no “flash” of admin UI)

## AC-2: Component-level gating (UI)
- Any Admin Console root component must require valid auth state before rendering.
- If auth becomes invalid while already on Admin Console (token expiry / 401):
  - user is redirected away OR Admin Console is replaced with Access Denied
  - auth state is cleared consistently (no contradictory popup + access)

## AC-3: Server-side enforcement
- Protected admin operations (API endpoints / GraphQL queries/mutations) must return:
  - 401 Unauthorized (not logged in) OR 403 Forbidden (logged in but insufficient role)
- Client must not be able to fetch admin data without valid auth, even if UI gating is bypassed.

## AC-4: Single source of truth for auth
- The application uses one canonical auth signal (e.g., JWT bearer token OR session cookie).
- The UI derives `isAuthenticated` from that canonical source, not from cached UI-only state.
- On 401/403 responses, the canonical auth state is invalidated/updated.

## AC-5: Logout and session expiry correctness
- After logout:
  - protected routes cannot be accessed
  - cached admin data is cleared or hidden
- When session/token expires:
  - next protected call triggers consistent unauthenticated handling
  - user is not left in a “half logged-in” UI state

## AC-6: Verification evidence recorded
Verification must be documented in `verification.md` with:
- reproduction steps before fix
- steps after fix
- at least one automated check (unit/integration/e2e) OR documented reason it’s not feasible
- at least one proof of server-side denial (example 401/403 response)

## AC-7: No secret leakage
- No logs/docs contain full tokens/cookies/secrets (redaction enforced).
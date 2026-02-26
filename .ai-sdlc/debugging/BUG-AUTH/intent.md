# Intent — Debug authentication state consistency (Admin console visible while unauthenticated)

## Problem
The application shows an "unauthenticated" popup, yet the Admin Console UI is still visible/accessible. This indicates the authentication state is inconsistent across the app (UI gating, routing, API auth checks, or cached state).

## Goal
Make authentication state consistent end-to-end so that:
- Unauthenticated users cannot access or view Admin Console routes/components.
- Auth popups (if any) reflect the true state.
- Server-side authorization correctly blocks protected operations even if UI gating fails.

## Suspected Causes (Hypotheses)
- UI route guard is missing or not connected to auth state.
- Auth state is stored in multiple places (e.g., local storage + React state + Apollo cache) and gets out of sync.
- Token/cookie exists but is invalid/expired; UI still assumes logged-in.
- API returns 401, but client does not clear auth state or redirect.
- Admin Console rendering is not protected by permissions (role-based gating missing).
- Client-side caching shows old admin data even after logout/401.

## Scope (In)
- Frontend auth state management (initialization, persistence, updates on 401/403).
- Route/component access control for Admin Console.
- Backend authorization enforcement for protected endpoints/resolvers.
- Correct behavior for login/logout/session expiry flows.
- Logging/instrumentation needed to diagnose, then removed or behind a debug flag.

## Scope (Out)
- Redesigning UI or changing the visual Admin Console layout.
- Adding new identity providers (SSO) unless already part of the system.
- Large refactors unrelated to auth consistency.

## Constraints
- Minimal changes first; avoid broad refactors until root cause confirmed.
- No secrets/tokens should be logged (redact).
- If current auth mechanism is ambiguous (JWT vs cookie), agent must identify the current source-of-truth and standardize usage.

## Reproduction Notes
Observed behavior:
1. Open app.
2. A popup appears indicating "Unauthenticated".
3. Despite this, Admin Console is still visible or reachable.

## Definition of Done (High-level)
- UI access to Admin Console is blocked when unauthenticated.
- Server rejects protected operations when unauthenticated.
- Auth state updates reliably on 401/403 and on logout.
- No stale admin data remains visible after auth is lost.
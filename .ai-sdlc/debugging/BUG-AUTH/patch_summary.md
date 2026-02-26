# Patch Summary

## Files Changed

### `apps/jira-plus-plus/src/providers/AuthProvider.tsx`
- **clearAuthState()**: Added `void apolloClient.clearStore()` — cache is now wiped on every auth invalidation path, not just explicit logout.
- **logout()**: Removed redundant `apolloClient.clearStore()` (now handled by clearAuthState). Removed `apolloClient` from dependency array.
- **onUnauthorized handler**: Removed `consecutiveUnauth` counter. API rejection with a valid Keycloak token now triggers immediate `logout()` instead of waiting for 3 strikes.

### `apps/jira-plus-plus/src/lib/apollo-client.ts`
- **errorLink**: Removed `getAuthToken()` guard on `emitUnauthorized()`. UNAUTHENTICATED responses now always trigger the auth cleanup event regardless of in-memory token state.

## Lines Changed
~30 lines net (removed more than added due to counter removal).

## No Changes Required
- `apps/jira-plus-plus/src/App.tsx` — RequireRole already correct
- `apps/api/src/resolvers.ts` — server-side enforcement already correct
- `apps/api/src/auth.ts` — token validation already correct

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useApolloClient } from "@apollo/client";
import Keycloak, { type KeycloakConfig, type KeycloakInstance, type KeycloakLoginOptions, type KeycloakTokenParsed } from "keycloak-js";
import { onUnauthorized } from "../lib/auth-events";
import { setAuthToken } from "../lib/auth-token";

export type Role = "ADMIN" | "MANAGER" | "USER";
export type AuthPhase = "checking" | "authenticating" | "authenticated" | "anonymous" | "error";

export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
  role: Role;
  tenantId?: string | null;
  projectId?: string | null;
}

interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  hasKeycloak: boolean;
  phase: AuthPhase;
  error: string | null;
  autoAttempts: number;
  maxAutoAttempts: number;
  login: (options?: { prompt?: "login" | "none" }) => Promise<void>;
  logout: () => Promise<void>;
  registerAutoAttempt: () => void;
}

const MAX_AUTO_ATTEMPTS = 2;
const AUTO_ATTEMPT_STORAGE_KEY = "__JPP_AUTH_AUTO_ATTEMPTS__";

const AuthContext = createContext<AuthContextValue | undefined>(undefined);
const keycloakConfig = loadKeycloakConfig();
const KEYCLOAK_INIT_TIMEOUT_MS = Number(import.meta.env.VITE_KEYCLOAK_INIT_TIMEOUT_MS ?? 15000);
const KEYCLOAK_TIMEOUT_MESSAGE =
  "Keycloak session check timed out. Ensure the Keycloak dev server is running (pnpm keycloak:start).";
const DISABLE_AUTH_INIT = import.meta.env.VITE_DISABLE_RELOAD_LOOP === "true";

// Read the hash error at module evaluation time (once per page load), not inside a React
// render or useMemo — React 18 Strict Mode double-invokes component functions and memo
// factories, so an in-render call would clear the hash on the first invocation and return
// null on the second, causing initialHashError to always be null in development.
const INITIAL_HASH_ERROR = consumeAuthErrorFromHash();

// Detect if the current URL contains a Keycloak auth callback (?code=...&state=...).
// This must be read at module level (like INITIAL_HASH_ERROR) because:
//  - React 18 StrictMode double-invokes useEffect: first init() processes the code and
//    cleans the URL, then the second init() on a new instance no longer sees the code.
//  - Without this flag, the second init() runs check-sso, the iframe fails (cross-origin),
//    silentCheckSsoFallback triggers a full-page redirect, Keycloak returns a new code, and
//    the page reloads indefinitely.
// When true, we skip check-sso so Keycloak processes the code without a redirect fallback.
const INITIAL_AUTH_CALLBACK = hasAuthCallbackInUrl();

// Module-level Keycloak singleton — ensures the same instance (and its tokens/state)
// survives React 18 StrictMode's mount → unmount → remount cycle. Without this, StrictMode
// creates a NEW instance on remount that can't see the auth code already consumed by the
// first instance, leading to check-sso → silentCheckSsoFallback → redirect loop.
const keycloakSingleton = keycloakConfig ? new Keycloak(keycloakConfig) : null;
let keycloakInitPromise: Promise<boolean> | null = null;

// When Keycloak runs on a different origin (different port in dev), the silent check-sso
// iframe can never work: Keycloak sends X-Frame-Options: SAMEORIGIN, and the browser
// blocks the cross-origin iframe. With `silentCheckSsoFallback: true` (the default),
// Keycloak JS falls back to a full-page redirect that causes an infinite reload loop.
// Detect this at module level so we can skip check-sso entirely and rely on auto-login.
const IS_KEYCLOAK_CROSS_ORIGIN = isKeycloakCrossOrigin();

// ── Persistent debug log (survives page reloads) ──────────────────────────
// Check in devtools: JSON.parse(sessionStorage.getItem('__JPP_AUTH_LOG__'))
const AUTH_LOG_KEY = "__JPP_AUTH_LOG__";
function authLog(tag: string, data?: Record<string, unknown>) {
  if (typeof window === "undefined") return;
  const entry = { t: Date.now(), tag, ...data };
  // eslint-disable-next-line no-console
  console.info(`[Auth:${tag}]`, data ?? "");
  try {
    const prev = JSON.parse(window.sessionStorage.getItem(AUTH_LOG_KEY) ?? "[]") as unknown[];
    prev.push(entry);
    // Keep last 40 entries to avoid bloating storage
    if (prev.length > 40) prev.splice(0, prev.length - 40);
    window.sessionStorage.setItem(AUTH_LOG_KEY, JSON.stringify(prev));
  } catch { /* ignore */ }
}

// Log module-level state on every page load
authLog("module-init", {
  hasConfig: Boolean(keycloakConfig),
  hashError: INITIAL_HASH_ERROR?.code ?? null,
  authCallback: INITIAL_AUTH_CALLBACK,
  crossOrigin: IS_KEYCLOAK_CROSS_ORIGIN,
  url: typeof window !== "undefined" ? window.location.href : "",
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const apolloClient = useApolloClient();
  // Use the module-level constant so Strict Mode double-render doesn't re-evaluate it.
  const initialHashError = INITIAL_HASH_ERROR;
  const hasKeycloak = Boolean(keycloakConfig);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [phase, setPhase] = useState<AuthPhase>(() => {
    if (!hasKeycloak) {
      return "anonymous";
    }
    if (!initialHashError) {
      return "checking";
    }
    // "login_required" just means the user isn't authenticated. We still run init()
    // (without onLoad) to set up endpoints, so start in "checking" like a normal load.
    if (initialHashError.code === "login_required") {
      return "checking";
    }
    return "error";
  });
  const [authError, setAuthError] = useState<string | null>(
    initialHashError && initialHashError.code !== "login_required" ? initialHashError.message : null,
  );
  const [autoAttemptsState, setAutoAttemptsState] = useState<number>(() => {
    // Only max out attempts on real errors, not on "login_required" (which is a normal
    // unauthenticated state — the attempt counter increments when auto-login actually fires).
    if (initialHashError && initialHashError.code !== "login_required") {
      persistAutoAttempts(MAX_AUTO_ATTEMPTS);
      return MAX_AUTO_ATTEMPTS;
    }
    return readStoredAutoAttempts();
  });
  const keycloakRef = useRef<KeycloakInstance | null>(null);

  const autoAttempts = autoAttemptsState;

  const setAutoAttempts = useCallback(
    (value: number | ((prev: number) => number)) => {
      setAutoAttemptsState((prev) => {
        const next = typeof value === "function" ? (value as (prev: number) => number)(prev) : value;
        persistAutoAttempts(next);
        return next;
      });
    },
    [],
  );

  const clearAuthState = useCallback(
    (nextPhase: AuthPhase = hasKeycloak ? "anonymous" : "anonymous") => {
      setUser(null);
      setToken(null);
      setAuthToken(null);
      setPhase(nextPhase);
      void apolloClient.clearStore();
    },
    [apolloClient, hasKeycloak],
  );

  const syncFromInstance = useCallback(
    (instance: KeycloakInstance) => {
      if (!instance.token) {
        authLog("sync-noToken");
        clearAuthState("anonymous");
        return;
      }
      setAuthToken(instance.token);
      setToken(instance.token);
      const mapped = mapTokenToUser(instance.tokenParsed);
      if (!mapped) {
        authLog("sync-noUser", { hasParsed: Boolean(instance.tokenParsed) });
        clearAuthState("anonymous");
        return;
      }
      authLog("sync-authenticated", { id: mapped.id, email: mapped.email, role: mapped.role });
      setUser(mapped);
      setPhase("authenticated");
      setAuthError(null);
      setAutoAttempts(0);
    },
    [clearAuthState, setAutoAttempts],
  );

  const logout = useCallback(async () => {
    authLog("logout-called", { stack: new Error().stack?.split("\n").slice(1, 4).join(" | ") });
    clearAuthState("anonymous");
    setAutoAttempts(0);
    if (keycloakRef.current && typeof window !== "undefined") {
      authLog("logout-redirect", { to: window.location.origin });
      await keycloakRef.current.logout({ redirectUri: window.location.origin });
    }
  }, [clearAuthState, setAutoAttempts]);

  const login = useCallback(async (loginOpts?: { prompt?: "login" | "none" }) => {
    if (!keycloakRef.current) {
      // eslint-disable-next-line no-console
      console.warn("Keycloak is not configured; cannot initiate login.");
      return;
    }
    setPhase("authenticating");
    setAuthError(null);
    const options: KeycloakLoginOptions & { prompt?: "login" | "none" } = {
      redirectUri: window.location.href,
      prompt: loginOpts?.prompt ?? "login",
    };
    await keycloakRef.current.login(options);
  }, []);

  const registerAutoAttempt = useCallback(() => {
    setAutoAttempts((attempt) => attempt + 1);
  }, [setAutoAttempts]);

  useEffect(() => {
    if (!keycloakSingleton || typeof window === "undefined") {
      setPhase("anonymous");
      return;
    }
    // Reuse the module-level singleton so the same instance (and its token state)
    // survives React 18 StrictMode's mount → unmount → remount cycle.
    const instance = keycloakSingleton;
    keycloakRef.current = instance;
    // For real auth errors (not login_required), bail out completely.
    if (initialHashError && initialHashError.code !== "login_required") {
      return;
    }
    let cancelled = false;

    if (DISABLE_AUTH_INIT) {
      setPhase("anonymous");
      return;
    }

    // Test hook: allow Playwright/E2E tests to inject a mock user without Keycloak.
    const testMock = (window as any).__PLAYWRIGHT_AUTH_MOCK__;
    if (testMock?.token && testMock?.user) {
      setAuthToken(testMock.token);
      setToken(testMock.token);
      setUser(testMock.user);
      setPhase("authenticated");
      return;
    }

    // When login_required came from the check-sso redirect, we already know the user
    // isn't authenticated. Run init() WITHOUT onLoad so endpoints are set up (login()
    // needs them to construct the redirect URL), but skip the check-sso that would
    // cause another full-page redirect loop.
    const skipCheckSso =
      IS_KEYCLOAK_CROSS_ORIGIN || initialHashError?.code === "login_required" || INITIAL_AUTH_CALLBACK;

    const logInit = (authenticated: boolean) => {
      if (!import.meta.env.DEV || typeof window === "undefined") {
        return;
      }
      // eslint-disable-next-line no-console
      console.info("[Auth] Keycloak init result", {
        authenticated,
        tokenPresent: Boolean(instance.token),
        tokenParsedPresent: Boolean(instance.tokenParsed),
        skipCheckSso,
      });
      (window as typeof window & { __JPP_AUTH_LAST_INIT__?: unknown }).__JPP_AUTH_LAST_INIT__ = {
        authenticated,
        tokenPresent: Boolean(instance.token),
        tokenParsedPresent: Boolean(instance.tokenParsed),
        timestamp: Date.now(),
      };
    };

    const init = async () => {
      try {
        setPhase("checking");
        // Dedup: only call init() once. StrictMode's second mount reuses the same
        // promise so the auth code exchange isn't attempted twice.
        if (!keycloakInitPromise) {
          keycloakInitPromise = instance.init(
            skipCheckSso
              ? {
                  pkceMethod: "S256",
                  checkLoginIframe: false,
                  flow: "standard",
                }
              : {
                  onLoad: "check-sso",
                  pkceMethod: "S256",
                  silentCheckSsoRedirectUri: buildSilentCheckUri(),
                  checkLoginIframe: false,
                  flow: "standard",
                },
          );
        }
        const authenticated = await withTimeout(
          keycloakInitPromise,
          KEYCLOAK_INIT_TIMEOUT_MS,
          KEYCLOAK_TIMEOUT_MESSAGE,
        );
        logInit(authenticated);
        authLog("init-result", { authenticated, cancelled, skipCheckSso });
        if (cancelled) {
          return;
        }
        if (authenticated) {
          syncFromInstance(instance);
        } else {
          clearAuthState("anonymous");
        }
      } catch (error) {
        if (!cancelled) {
          // Keycloak JS throws plain objects (e.g. { error: "..." }), not Error
          // instances, so we must check both forms.
          const message =
            error instanceof Error
              ? error.message
              : typeof error === "object" && error !== null
                ? String((error as Record<string, unknown>).error ?? JSON.stringify(error))
                : String(error);
          authLog("init-error", { message, raw: String(error) });
          // Treat all non-fatal init failures as "not authenticated" so the
          // Sign In button is shown. This covers:
          //  - silent SSO iframe blocked by cross-origin (different ports)
          //  - our own withTimeout firing before Keycloak's internal timeout
          //  - network issues reaching Keycloak during init
          const isInitFailure =
            message.includes("3rd party check iframe") ||
            message.includes("Keycloak session check timed out") ||
            message.includes("Network request failed");
          if (isInitFailure) {
            clearAuthState("anonymous");
          } else {
            clearAuthState("error");
            setAuthError(message || "Keycloak initialization failed");
            // eslint-disable-next-line no-console
            console.error("[Auth] Failed to initialize Keycloak", error);
          }
        }
      }
    };

    void init();

    instance.onAuthSuccess = () => {
      if (!cancelled) {
        syncFromInstance(instance);
      }
    };

    instance.onAuthRefreshSuccess = () => {
      if (!cancelled) {
        syncFromInstance(instance);
      }
    };

    instance.onAuthLogout = () => {
      if (!cancelled) {
        clearAuthState("anonymous");
      }
    };

    instance.onTokenExpired = () => {
      instance
        .updateToken(30)
        .then((refreshed) => {
          if (!cancelled && refreshed) {
            syncFromInstance(instance);
          }
        })
        .catch(() => {
          if (!cancelled) {
            clearAuthState("anonymous");
          }
        });
    };

    return () => {
      cancelled = true;
      // Don't null keycloakRef — the singleton persists across StrictMode remounts
      // and logout()/onUnauthorized still need access to it.
    };
  }, [clearAuthState, initialHashError, syncFromInstance]);

  useEffect(() => {
    const unsubscribe = onUnauthorized(() => {
      authLog("onUnauthorized-fired", { hasRef: Boolean(keycloakRef.current) });
      if (!keycloakRef.current) {
        authLog("onUnauthorized-logout", { reason: "no keycloakRef" });
        void logout();
        return;
      }
      keycloakRef.current
        .updateToken(5)
        .then((refreshed) => {
          authLog("onUnauthorized-refreshResult", { refreshed });
          if (refreshed && keycloakRef.current) {
            syncFromInstance(keycloakRef.current);
          } else {
            // Token is still valid per Keycloak but the API rejected it.
            // Logout immediately so the user sees the sign-in gate instead
            // of a broken admin console with error banners.
            authLog("onUnauthorized-logout", { reason: "api-rejected-valid-token" });
            void logout();
          }
        })
        .catch((err) => {
          authLog("onUnauthorized-refreshError", { error: String(err) });
          void logout();
        });
    });
    return unsubscribe;
  }, [logout, syncFromInstance]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      token,
      hasKeycloak,
      phase,
      error: authError,
      autoAttempts,
      maxAutoAttempts: MAX_AUTO_ATTEMPTS,
      login,
      logout,
      registerAutoAttempt,
    }),
    [authError, autoAttempts, hasKeycloak, login, logout, phase, registerAutoAttempt, token, user],
  );

  useEffect(() => {
    if (typeof window === "undefined" || !import.meta.env.DEV) {
      return;
    }
    (window as typeof window & { __JPP_AUTH_DEBUG__?: unknown }).__JPP_AUTH_DEBUG__ = {
      hasKeycloak,
      phase,
      userPresent: Boolean(user),
      autoAttempts,
      error: authError,
    };
  }, [authError, autoAttempts, hasKeycloak, phase, user]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}

function loadKeycloakConfig(): KeycloakConfig | null {
  const url = stringEnv(import.meta.env.VITE_KEYCLOAK_BASE_URL);
  const realm = stringEnv(import.meta.env.VITE_KEYCLOAK_REALM);
  const clientId = stringEnv(import.meta.env.VITE_KEYCLOAK_CLIENT_ID);
  if (!url || !realm || !clientId) {
    return null;
  }
  return { url, realm, clientId };
}

function stringEnv(value: unknown): string | null {
  if (typeof value === "string" && value.trim().length > 0) {
    return value;
  }
  return null;
}

function buildSilentCheckUri() {
  if (typeof window === "undefined") {
    return undefined;
  }
  return new URL("/silent-check-sso.html", window.location.origin).toString();
}

function mapTokenToUser(parsed?: KeycloakTokenParsed): AuthUser | null {
  if (!parsed) {
    return null;
  }
  const id = stringClaim(parsed.sub) ?? "anonymous";
  const email = stringClaim(parsed.email) ?? `${stringClaim(parsed.preferred_username) ?? id}@example.com`;
  const displayName = stringClaim(parsed.name) ?? stringClaim(parsed.preferred_username) ?? email ?? id;
  const tenantId = stringClaim((parsed as Record<string, unknown>)["tenant_id"]);
  const projectId = stringClaim((parsed as Record<string, unknown>)["project_id"]);
  return {
    id,
    email,
    displayName,
    role: deriveRole(parsed),
    tenantId,
    projectId,
  };
}

function stringClaim(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function deriveRole(parsed: KeycloakTokenParsed): Role {
  const collected = new Set<string>();
  const direct = parsed.roles;
  if (Array.isArray(direct)) {
    direct.forEach((entry) => collected.add(String(entry).toLowerCase()));
  }
  const realmRoles = (parsed.realm_access as { roles?: unknown } | undefined)?.roles;
  if (Array.isArray(realmRoles)) {
    realmRoles.forEach((role) => collected.add(String(role).toLowerCase()));
  }
  const resourceAccess = parsed.resource_access as Record<string, { roles?: unknown }> | undefined;
  if (resourceAccess) {
    Object.values(resourceAccess).forEach((resource) => {
      if (Array.isArray(resource.roles)) {
        resource.roles.forEach((role) => collected.add(String(role).toLowerCase()));
      }
    });
  }
  if (collected.has("admin")) {
    return "ADMIN";
  }
  if (collected.has("manager")) {
    return "MANAGER";
  }
  return "USER";
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(message));
    }, ms);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) {
      clearTimeout(timer);
    }
  });
}

function readStoredAutoAttempts(): number {
  if (typeof window === "undefined") {
    return 0;
  }
  const raw = window.sessionStorage.getItem(AUTO_ATTEMPT_STORAGE_KEY);
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function persistAutoAttempts(value: number) {
  if (typeof window === "undefined") {
    return;
  }
  window.sessionStorage.setItem(AUTO_ATTEMPT_STORAGE_KEY, String(value));
}

function consumeAuthErrorFromHash(): { code: string; message: string } | null {
  if (typeof window === "undefined") {
    return null;
  }
  const hash = window.location.hash.startsWith("#") ? window.location.hash.slice(1) : "";
  if (!hash) {
    return null;
  }
  const params = new URLSearchParams(hash);
  const error = params.get("error");
  if (!error) {
    return null;
  }
  if (error === "login_required" && DISABLE_AUTH_INIT) {
    window.history.replaceState(null, document.title, window.location.pathname + window.location.search);
    return null;
  }
  const description = params.get("error_description");
  const message = describeAuthError(error, description);
  window.history.replaceState(null, document.title, window.location.pathname + window.location.search);
  return { code: error, message };
}

function describeAuthError(code: string, description?: string | null): string {
  if (description && description.trim().length > 0) {
    return description;
  }
  if (code === "login_required") {
    return "Your session expired. Sign in again to continue.";
  }
  return code;
}

function isKeycloakCrossOrigin(): boolean {
  if (!keycloakConfig?.url || typeof window === "undefined") {
    return false;
  }
  try {
    return new URL(keycloakConfig.url).origin !== window.location.origin;
  } catch {
    return true;
  }
}

function hasAuthCallbackInUrl(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  // Check query string (responseMode: "query")
  const searchParams = new URLSearchParams(window.location.search);
  if (searchParams.has("code") && searchParams.has("state")) {
    return true;
  }
  // Check hash fragment (Keycloak default response_mode is "fragment")
  const hash = window.location.hash.startsWith("#") ? window.location.hash.slice(1) : "";
  if (!hash) {
    return false;
  }
  const hashParams = new URLSearchParams(hash);
  return hashParams.has("code") && hashParams.has("state");
}

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
  login: () => Promise<void>;
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

export function AuthProvider({ children }: { children: ReactNode }) {
  const apolloClient = useApolloClient();
  const initialHashError = useMemo(() => consumeAuthErrorFromHash(), []);
  const hasKeycloak = Boolean(keycloakConfig);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [phase, setPhase] = useState<AuthPhase>(() => {
    if (!hasKeycloak) {
      return "anonymous";
    }
    return initialHashError ? "error" : "checking";
  });
  const [authError, setAuthError] = useState<string | null>(initialHashError?.message ?? null);
  const [autoAttemptsState, setAutoAttemptsState] = useState<number>(() => {
    if (initialHashError) {
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
    },
    [hasKeycloak],
  );

  const syncFromInstance = useCallback(
    (instance: KeycloakInstance) => {
      if (!instance.token) {
        clearAuthState("anonymous");
        return;
      }
      setAuthToken(instance.token);
      setToken(instance.token);
      const mapped = mapTokenToUser(instance.tokenParsed);
      if (!mapped) {
        clearAuthState("anonymous");
        return;
      }
      setUser(mapped);
      setPhase("authenticated");
      setAuthError(null);
      setAutoAttempts(0);
    },
    [clearAuthState, setAutoAttempts],
  );

  const logout = useCallback(async () => {
    clearAuthState("anonymous");
    setAutoAttempts(0);
    await apolloClient.clearStore();
    if (keycloakRef.current && typeof window !== "undefined") {
      await keycloakRef.current.logout({ redirectUri: window.location.origin });
    }
  }, [apolloClient, clearAuthState, setAutoAttempts]);

  const login = useCallback(async () => {
    if (!keycloakRef.current) {
      // eslint-disable-next-line no-console
      console.warn("Keycloak is not configured; cannot initiate login.");
      return;
    }
    setPhase("authenticating");
    setAuthError(null);
    const options: KeycloakLoginOptions & { responseMode?: "fragment" | "query"; prompt?: "login" | "none" } = {
      redirectUri: window.location.href,
      responseMode: "query",
      prompt: "login",
    };
    await keycloakRef.current.login(options);
  }, []);

  const registerAutoAttempt = useCallback(() => {
    setAutoAttempts((attempt) => attempt + 1);
  }, [setAutoAttempts]);

  useEffect(() => {
    if (!keycloakConfig || typeof window === "undefined") {
      setPhase("anonymous");
      return;
    }
    if (initialHashError) {
      return;
    }
    const instance = new Keycloak(keycloakConfig);
    keycloakRef.current = instance;
    let cancelled = false;

    const logInit = (authenticated: boolean) => {
      if (!import.meta.env.DEV || typeof window === "undefined") {
        return;
      }
      // eslint-disable-next-line no-console
      console.info("[Auth] Keycloak init result", {
        authenticated,
        tokenPresent: Boolean(instance.token),
        tokenParsedPresent: Boolean(instance.tokenParsed),
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
        const authenticated = await withTimeout(
          instance.init({
            onLoad: "check-sso",
            pkceMethod: "S256",
            silentCheckSsoRedirectUri: buildSilentCheckUri(),
            flow: "standard",
          }),
          KEYCLOAK_INIT_TIMEOUT_MS,
          KEYCLOAK_TIMEOUT_MESSAGE,
        );
        logInit(authenticated);
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
          clearAuthState("error");
          setAuthError(error instanceof Error ? error.message : "Keycloak initialization failed");
          // eslint-disable-next-line no-console
          console.error("[Auth] Failed to initialize Keycloak", error);
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
      keycloakRef.current = null;
    };
  }, [clearAuthState, initialHashError, syncFromInstance]);

  useEffect(() => {
    const unsubscribe = onUnauthorized(() => {
      if (!keycloakRef.current) {
        void logout();
        return;
      }
      keycloakRef.current
        .updateToken(5)
        .then((refreshed) => {
          if (refreshed && keycloakRef.current) {
            syncFromInstance(keycloakRef.current);
          } else {
            void logout();
          }
        })
        .catch(() => {
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

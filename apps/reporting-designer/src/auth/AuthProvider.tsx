import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { KeycloakInstance, KeycloakTokenParsed } from "keycloak-js";
import {
  kc,
  MAX_AUTO_ATTEMPTS,
  captureKeycloakFragmentError,
  getAutoAttempts,
  getLastAuthError,
  initKeycloak,
  maybeAutoLogin,
  resetAutoAttempts,
  setLastAuthError,
  type StoredAuthError,
} from "./keycloak";

export type Role = "ADMIN" | "MANAGER" | "USER";
export type AuthPhase = "boot" | "checking" | "authenticating" | "authenticated" | "anonymous" | "error";
export type AuthErrorState = StoredAuthError;

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
  keycloak: KeycloakInstance | null;
  phase: AuthPhase;
  error: AuthErrorState | null;
  autoAttempts: number;
  maxAutoAttempts: number;
  login: () => void;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);
const hasKeycloak = Boolean(kc);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [phase, setPhase] = useState<AuthPhase>(() => (hasKeycloak ? "boot" : "anonymous"));
  const [authError, setAuthError] = useState<AuthErrorState | null>(() => (typeof window === "undefined" ? null : getLastAuthError()));
  const [autoAttempts, setAutoAttempts] = useState<number>(() => (typeof window === "undefined" ? 0 : getAutoAttempts()));
  const lastLoggedError = useRef<number | null>(null);
  const autoSuppressedReason = useRef<string | null>(null);
  const initLogged = useRef(false);

  const syncAutoAttempts = useCallback(() => {
    setAutoAttempts(typeof window === "undefined" ? 0 : getAutoAttempts());
  }, []);

  const handleAuthError = useCallback(
    (details: AuthErrorState, context: string) => {
      setAuthError(details);
      setLastAuthError(details);
      if (lastLoggedError.current !== details.timestamp) {
        lastLoggedError.current = details.timestamp;
        logAuthEvent(
          "auth:error",
          {
            message: details.message,
            code: details.code ?? null,
            context,
            timestamp: details.timestamp,
          },
          "error",
        );
      }
    },
    [],
  );

  const syncFromKeycloak = useCallback(
    (instance: KeycloakInstance) => {
      if (!instance.token) {
        setUser(null);
        setToken(null);
        setPhase("anonymous");
        return;
      }
      const mapped = mapTokenToUser(instance.tokenParsed);
      if (!mapped) {
        setUser(null);
        setToken(null);
        setPhase("anonymous");
        return;
      }
      setToken(instance.token);
      setUser(mapped);
      setPhase("authenticated");
      setAuthError(null);
      setLastAuthError(null);
      resetAutoAttempts();
      syncAutoAttempts();
      logAuthEvent("auth:success", {
        subject: mapped.id,
        tenantId: mapped.tenantId ?? null,
        projectId: mapped.projectId ?? null,
      });
    },
    [syncAutoAttempts],
  );

  useEffect(() => {
    const fragmentError = captureKeycloakFragmentError();
    if (fragmentError) {
      handleAuthError(fragmentError, "fragment");
    }
    if (!initLogged.current) {
      initLogged.current = true;
      logAuthEvent("auth:init", { phase: hasKeycloak ? "checking" : "anonymous", keycloak: hasKeycloak });
    }
    if (!kc || typeof window === "undefined") {
      setPhase("anonymous");
      return;
    }
    const keycloak = kc as KeycloakInstance;
    let cancelled = false;
    setPhase("checking");
    initKeycloak()
      .then(({ authenticated }) => {
        if (cancelled) {
          return;
        }
        if (authenticated) {
          syncFromKeycloak(keycloak);
        } else {
          const stored = getLastAuthError();
          if (stored) {
            handleAuthError(stored, "stored");
            setPhase("error");
          } else {
            setPhase("anonymous");
          }
        }
        syncAutoAttempts();
      })
      .catch((error) => {
        if (!cancelled) {
          const message = error instanceof Error ? error.message : "Keycloak initialization failed";
          handleAuthError(
            {
              message,
              code: "init_failed",
              timestamp: Date.now(),
            },
            "init",
          );
          setPhase("error");
          syncAutoAttempts();
        }
      });

    keycloak.onAuthSuccess = () => {
      if (!cancelled) {
        syncFromKeycloak(keycloak);
      }
    };
    keycloak.onAuthRefreshSuccess = () => {
      if (!cancelled) {
        syncFromKeycloak(keycloak);
      }
    };
    keycloak.onAuthLogout = () => {
      if (!cancelled) {
        setUser(null);
        setToken(null);
        setPhase("anonymous");
      }
    };
    keycloak.onTokenExpired = () => {
      keycloak.updateToken(30).catch(() => {
        if (!cancelled) {
          const errorDetails: AuthErrorState = {
            message: "Session expired. Sign in again to continue.",
            code: "token_refresh_failed",
            timestamp: Date.now(),
          };
          handleAuthError(errorDetails, "refresh");
          resetAutoAttempts();
          syncAutoAttempts();
          setUser(null);
          setToken(null);
          setPhase("error");
        }
      });
    };

    return () => {
      cancelled = true;
    };
  }, [handleAuthError, syncAutoAttempts, syncFromKeycloak]);

  useEffect(() => {
    if (!kc || typeof window === "undefined") {
      return;
    }
    if (authError) {
      if (autoSuppressedReason.current !== "error_blocked") {
        autoSuppressedReason.current = "error_blocked";
        logAuthEvent("auth:auto_suppressed", {
          reason: "error_blocked",
          message: authError.message,
        });
      }
      return;
    }
    if (phase !== "anonymous") {
      autoSuppressedReason.current = null;
      return;
    }
    if (getAutoAttempts() >= MAX_AUTO_ATTEMPTS) {
      if (autoSuppressedReason.current !== "exceeded_attempts") {
        autoSuppressedReason.current = "exceeded_attempts";
        logAuthEvent("auth:auto_suppressed", {
          reason: "exceeded_attempts",
          autoAttempts: getAutoAttempts(),
        });
      }
      syncAutoAttempts();
      return;
    }
    autoSuppressedReason.current = null;
    const attemptNumber = maybeAutoLogin();
    if (attemptNumber !== null) {
      logAuthEvent("auth:auto_attempt", {
        attempt: attemptNumber,
        route: currentRoute(),
        mode: "auto",
      });
      setPhase("authenticating");
      syncAutoAttempts();
    }
  }, [authError, phase, syncAutoAttempts]);

  const login = useCallback(() => {
    if (!kc || typeof window === "undefined") {
      logAuthEvent("auth:auto_suppressed", { reason: "missing_keycloak" });
      return;
    }
    setAuthError(null);
    setLastAuthError(null);
    resetAutoAttempts();
    syncAutoAttempts();
    const attemptNumber = maybeAutoLogin();
    if (attemptNumber !== null) {
      logAuthEvent("auth:auto_attempt", {
        attempt: attemptNumber,
        route: currentRoute(),
        mode: "manual",
      });
      setPhase("authenticating");
      syncAutoAttempts();
    } else {
      const stored = getLastAuthError();
      if (stored) {
        handleAuthError(stored, "manual");
        setPhase("error");
      }
    }
  }, [handleAuthError, syncAutoAttempts]);

  const logout = useCallback(async () => {
    if (!kc || typeof window === "undefined") {
      return;
    }
    resetAutoAttempts();
    setLastAuthError(null);
    syncAutoAttempts();
    setAuthError(null);
    setUser(null);
    setToken(null);
    setPhase("anonymous");
    try {
      await kc.logout({ redirectUri: window.location.origin });
    } catch {
      // ignore logout errors
    }
  }, [syncAutoAttempts]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      token,
      hasKeycloak,
      keycloak: kc,
      phase,
      error: authError,
      autoAttempts,
      maxAutoAttempts: MAX_AUTO_ATTEMPTS,
      login,
      logout,
    }),
    [authError, autoAttempts, login, logout, phase, token, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}

function currentRoute(): string {
  if (typeof window === "undefined") {
    return "/";
  }
  return window.location.pathname || "/";
}

function logAuthEvent(event: string, payload: Record<string, unknown>, level: "info" | "error" = "info") {
  const entry = { event, ...payload };
  if (typeof window !== "undefined") {
    const debugQueue = (window as typeof window & { __authDebug?: Array<Record<string, unknown>> }).__authDebug;
    debugQueue?.push(entry);
  }
  const label = `[AuthLoop] ${event}`;
  if (level === "error") {
    // eslint-disable-next-line no-console
    console.error(label, payload);
  } else {
    // eslint-disable-next-line no-console
    console.info(label, payload);
  }
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

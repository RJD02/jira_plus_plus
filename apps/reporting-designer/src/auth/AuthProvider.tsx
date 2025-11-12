import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { KeycloakInstance, KeycloakTokenParsed } from "keycloak-js";
import {
  kc,
  MAX_AUTO_ATTEMPTS,
  captureKeycloakFragmentError,
  getLastAuthError,
  incrementAutoAttempts,
  initKeycloak,
  maybeAutoLogin,
  resetAutoAttempts,
  setLastAuthError,
  getAutoAttempts,
} from "./keycloak";

export type Role = "ADMIN" | "MANAGER" | "USER";
export type AuthPhase = "boot" | "checking" | "authenticating" | "authenticated" | "anonymous" | "error";

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
  error: string | null;
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
  const [authError, setAuthError] = useState<string | null>(() => (typeof window === "undefined" ? null : getLastAuthError()));
  const [autoAttempts, setAutoAttempts] = useState<number>(() => (typeof window === "undefined" ? 0 : getAutoAttempts()));

  const syncAutoAttempts = useCallback(() => {
    setAutoAttempts(typeof window === "undefined" ? 0 : getAutoAttempts());
  }, []);

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
    },
    [syncAutoAttempts],
  );

  useEffect(() => {
    const fragmentError = captureKeycloakFragmentError();
    if (fragmentError) {
      setAuthError(fragmentError);
    }
    if (!kc || typeof window === "undefined") {
      setPhase("anonymous");
      return;
    }
    let cancelled = false;
    setPhase("checking");
    initKeycloak()
      .then(({ authenticated }) => {
        if (cancelled) {
          return;
        }
        if (authenticated) {
          syncFromKeycloak(kc);
        } else if (getLastAuthError()) {
          setAuthError(getLastAuthError());
          setPhase("error");
        } else {
          setPhase("anonymous");
        }
        syncAutoAttempts();
      })
      .catch((error) => {
        if (!cancelled) {
          const message = error instanceof Error ? error.message : "Keycloak initialization failed";
          setAuthError(message);
          setLastAuthError(message);
          setPhase("error");
          syncAutoAttempts();
        }
      });

    kc.onAuthSuccess = () => {
      if (!cancelled) {
        syncFromKeycloak(kc);
      }
    };
    kc.onAuthRefreshSuccess = () => {
      if (!cancelled) {
        syncFromKeycloak(kc);
      }
    };
    kc.onAuthLogout = () => {
      if (!cancelled) {
        setUser(null);
        setToken(null);
        setPhase("anonymous");
      }
    };
    kc.onTokenExpired = () => {
      kc.updateToken(30).catch(() => {
        if (!cancelled) {
          resetAutoAttempts();
          syncAutoAttempts();
          setUser(null);
          setToken(null);
          setPhase("anonymous");
        }
      });
    };

    return () => {
      cancelled = true;
    };
  }, [syncAutoAttempts, syncFromKeycloak]);

  useEffect(() => {
    if (!kc || typeof window === "undefined") {
      return;
    }
    if (authError) {
      return;
    }
    if (phase !== "anonymous") {
      return;
    }
    if (getAutoAttempts() >= MAX_AUTO_ATTEMPTS) {
      syncAutoAttempts();
      return;
    }
    const started = maybeAutoLogin();
    if (started) {
      setPhase("authenticating");
      syncAutoAttempts();
    }
  }, [authError, phase, syncAutoAttempts]);

  const login = useCallback(() => {
    if (!kc || typeof window === "undefined") {
      return;
    }
    setAuthError(null);
    setLastAuthError(null);
    resetAutoAttempts();
    syncAutoAttempts();
    const started = maybeAutoLogin();
    if (started) {
      setPhase("authenticating");
      syncAutoAttempts();
    } else if (getLastAuthError()) {
      setAuthError(getLastAuthError());
      setPhase("error");
    }
  }, [syncAutoAttempts]);

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

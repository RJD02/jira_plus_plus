import Keycloak, { type KeycloakConfig, type KeycloakInstance, type KeycloakLoginOptions } from "keycloak-js";

const AUTO_ATTEMPTS_KEY = "kc:autoAttempts";
const LAST_ERROR_KEY = "kc:lastError";

const resolvedConfig = resolveKeycloakConfig();
const keycloakInitOptions = {
  onLoad: "check-sso" as const,
  pkceMethod: "S256" as const,
  responseMode: "fragment" as const,
  promiseType: "native" as const,
  flow: "standard" as const,
};

export const kc: KeycloakInstance | null = resolvedConfig ? new Keycloak(resolvedConfig) : null;
export const MAX_AUTO_ATTEMPTS = Number(import.meta.env.VITE_KC_MAX_AUTO_ATTEMPTS ?? 1);
let initPromise: Promise<boolean> | null = null;

export function getAutoAttempts(): number {
  return readSessionNumber(AUTO_ATTEMPTS_KEY);
}

export function resetAutoAttempts(): void {
  if (typeof window === "undefined") {
    return;
  }
  window.sessionStorage.removeItem(AUTO_ATTEMPTS_KEY);
}

export function incrementAutoAttempts(): number {
  if (typeof window === "undefined") {
    return 0;
  }
  const next = getAutoAttempts() + 1;
  window.sessionStorage.setItem(AUTO_ATTEMPTS_KEY, String(next));
  return next;
}

export function getLastAuthError(): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  return window.sessionStorage.getItem(LAST_ERROR_KEY);
}

export function setLastAuthError(message: string | null): void {
  if (typeof window === "undefined") {
    return;
  }
  if (!message) {
    window.sessionStorage.removeItem(LAST_ERROR_KEY);
    return;
  }
  window.sessionStorage.setItem(LAST_ERROR_KEY, message);
}

export function captureKeycloakFragmentError(): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  const hash = window.location.hash;
  if (!hash || !hash.startsWith("#")) {
    return null;
  }
  const params = new URLSearchParams(hash.slice(1));
  const error = params.get("error");
  if (!error) {
    return null;
  }
  const description = params.get("error_description");
  const message = describeAuthError(error, description);
  setLastAuthError(message);
  stripHash();
  return message;
}

export async function initKeycloak(): Promise<{ authenticated: boolean }> {
  if (!kc || typeof window === "undefined") {
    return { authenticated: false };
  }
  if (!initPromise) {
    initPromise = kc
      .init({
        ...keycloakInitOptions,
        silentCheckSsoRedirectUri: buildSilentCheckUri(),
      } as KeycloakLoginOptions & { promiseType: "native" })
      .catch((error) => {
        initPromise = null;
        throw error;
      });
  }
  const authenticated = await initPromise;
  if (authenticated) {
    resetAutoAttempts();
    setLastAuthError(null);
  }
  stripAuthCodeFragment();
  return { authenticated };
}

export function maybeAutoLogin(): boolean {
  if (!kc || typeof window === "undefined") {
    return false;
  }
  if (getLastAuthError()) {
    return false;
  }
  if (getAutoAttempts() >= MAX_AUTO_ATTEMPTS) {
    return false;
  }
  incrementAutoAttempts();
  const redirectUri = buildRedirectUri();
  const options: KeycloakLoginOptions & { responseMode?: "fragment" } = {
    redirectUri,
    prompt: "login",
    responseMode: "fragment",
  };
  kc.login(options);
  return true;
}

function buildSilentCheckUri(): string | undefined {
  if (typeof window === "undefined") {
    return undefined;
  }
  return new URL("/silent-check-sso.html", window.location.origin).toString();
}

function buildRedirectUri(): string {
  if (typeof window === "undefined") {
    return "";
  }
  const { origin, pathname, search } = window.location;
  return `${origin}${pathname}${search}`;
}

function stripAuthCodeFragment() {
  if (typeof window === "undefined") {
    return;
  }
  const hash = window.location.hash;
  if (!hash || !hash.includes("code=")) {
    return;
  }
  stripHash();
}

function stripHash() {
  if (typeof window === "undefined") {
    return;
  }
  if (!window.location.hash) {
    return;
  }
  window.history.replaceState(null, document.title, window.location.pathname + window.location.search);
}

function describeAuthError(code: string, description?: string | null): string {
  if (description && description.trim().length > 0) {
    return decodeURIComponent(description.replace(/\+/g, " "));
  }
  if (code === "login_required") {
    return "Your session expired. Sign in again to continue.";
  }
  if (code === "access_denied") {
    return "Access was denied. Try signing in again or contact an administrator.";
  }
  return code;
}

function readSessionNumber(key: string): number {
  if (typeof window === "undefined") {
    return 0;
  }
  const raw = window.sessionStorage.getItem(key);
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function resolveKeycloakConfig(): KeycloakConfig | null {
  const url = stringEnv(import.meta.env.VITE_KC_URL) ?? stringEnv(import.meta.env.VITE_KEYCLOAK_BASE_URL);
  const realm = stringEnv(import.meta.env.VITE_KC_REALM) ?? stringEnv(import.meta.env.VITE_KEYCLOAK_REALM);
  const clientId = stringEnv(import.meta.env.VITE_KC_CLIENT) ?? stringEnv(import.meta.env.VITE_KEYCLOAK_CLIENT_ID);
  if (!url || !realm || !clientId) {
    return null;
  }
  return { url, realm, clientId };
}

function stringEnv(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

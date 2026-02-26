import { emitUnauthorized } from "./auth-events";
import { getAuthToken } from "./auth-token";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

const DEFAULT_GRAPHQL_ENDPOINT =
  typeof window !== "undefined" && LOCAL_HOSTS.has(window.location.hostname)
    ? "http://localhost:4000/graphql"
    : "https://api.jira-plus-plus.in/graphql";

function deriveBaseUrlFromGraphql(endpoint: string): string {
  try {
    const url = new URL(endpoint);
    if (url.pathname.endsWith("/graphql")) {
      url.pathname = url.pathname.replace(/\/graphql$/, "");
    }
    url.search = "";
    url.hash = "";
    const normalized = url.toString();
    return normalized.endsWith("/") ? normalized.slice(0, -1) : normalized;
  } catch {
    return LOCAL_HOSTS.has(typeof window !== "undefined" ? window.location.hostname : "")
      ? "http://localhost:4000"
      : "https://api.jira-plus-plus.in";
  }
}

export function getApiBaseUrl(): string {
  const configured = import.meta.env.VITE_API_BASE_URL;
  if (configured && typeof configured === "string") {
    return configured.endsWith("/") ? configured.slice(0, -1) : configured;
  }
  const graphqlEndpoint =
    (typeof import.meta.env.VITE_GRAPHQL_ENDPOINT === "string" && import.meta.env.VITE_GRAPHQL_ENDPOINT.trim()) ||
    DEFAULT_GRAPHQL_ENDPOINT;
  return deriveBaseUrlFromGraphql(graphqlEndpoint);
}

export async function apiFetch<T>(
  path: string,
  init: RequestInit & { token?: string } = {},
): Promise<T> {
  const baseUrl = getApiBaseUrl();
  const url = `${baseUrl}${path.startsWith("/") ? path : `/${path}`}`;
  const headers = new Headers(init.headers ?? {});
  if (init.token) {
    headers.set("Authorization", `Bearer ${init.token}`);
  }
  if (!headers.has("Content-Type") && init.body) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(url, {
    ...init,
    headers,
  });

  const text = await response.text();
  const payload = text ? (JSON.parse(text) as unknown) : null;

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      const tokenPresent = Boolean(init.token ?? getAuthToken());
      if (tokenPresent) {
        emitUnauthorized();
      }
    }
    const errorMessage =
      (payload && typeof payload === "object" && payload && "error" in (payload as Record<string, unknown>))
        ? String((payload as Record<string, unknown>).error)
        : response.statusText;
    const error = new Error(errorMessage || "Request failed");
    (error as Error & { status?: number }).status = response.status;
    throw error;
  }

  return payload as T;
}

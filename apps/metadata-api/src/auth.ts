import { createRemoteJWKSet, jwtVerify } from "jose";

export type AuthContext = {
  tenantId: string;
  projectId: string;
  roles: string[];
  subject: string;
};

const jwksUrl = process.env.KEYCLOAK_JWKS_URL;
const expectedIssuer = process.env.KEYCLOAK_EXPECTED_ISSUER;
const expectedAudience = process.env.KEYCLOAK_AUDIENCE;

const jwks = jwksUrl ? createRemoteJWKSet(new URL(jwksUrl)) : null;

export async function authenticateRequest(authorizationHeader?: string | null): Promise<AuthContext> {
  if (!jwks || !authorizationHeader) {
    return buildAnonymousContext();
  }
  const [scheme, token] = authorizationHeader.split(" ");
  if ((scheme ?? "").toLowerCase() !== "bearer" || !token) {
    return buildAnonymousContext();
  }
  try {
    const result = await jwtVerify(token, jwks, {
      issuer: expectedIssuer,
      audience: expectedAudience,
    });
    const payload = result.payload as Record<string, unknown>;
    const tenantId = stringClaim(payload["tenant_id"]) ?? process.env.TENANT_ID ?? "dev";
    const projectId = stringClaim(payload["project_id"]) ?? process.env.METADATA_DEFAULT_PROJECT ?? "global";
    const roles = deriveRoles(payload);
    const subject = stringClaim(payload["sub"]) ?? "anonymous";
    return { tenantId, projectId, roles, subject };
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn("Token verification failed", error);
    return buildAnonymousContext();
  }
}

function buildAnonymousContext(): AuthContext {
  return {
    tenantId: process.env.TENANT_ID ?? "dev",
    projectId: process.env.METADATA_DEFAULT_PROJECT ?? "global",
    roles: [],
    subject: "anonymous",
  };
}

function stringClaim(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function arrayClaim(value: unknown): string[] | null {
  if (!value) {
    return null;
  }
  if (Array.isArray(value)) {
    return value.map((entry) => String(entry));
  }
  if (typeof value === "string") {
    return value.split(",").map((entry) => entry.trim()).filter(Boolean);
  }
  return null;
}

function deriveRoles(payload: Record<string, unknown>): string[] {
  const directRoles = arrayClaim(payload["roles"]) ?? [];
  const realmAccess = payload["realm_access"];
  const realmRoles = arrayClaim((realmAccess as Record<string, unknown> | undefined)?.roles) ?? [];
  const resourceAccess = payload["resource_access"];
  const resourceRoles: string[] = [];
  if (resourceAccess && typeof resourceAccess === "object") {
    Object.values(resourceAccess as Record<string, { roles?: unknown }>).forEach((entry) => {
      const roles = arrayClaim(entry?.roles);
      if (roles) {
        resourceRoles.push(...roles);
      }
    });
  }
  const combined = [...directRoles, ...realmRoles, ...resourceRoles];
  return Array.from(new Set(combined.map((role) => role.toLowerCase())));
}

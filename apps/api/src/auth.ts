import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import type { IncomingMessage } from "http";
import { CredentialType, type Role, type User } from "@platform/cdm";
import { withTenant } from "@platform/clients";
import { prisma } from "./prisma.js";
import { getEnv } from "./env.js";
import type { AuthenticatedUser } from "./context.js";

const TOKEN_EXPIRES_IN = "12h";
const BCRYPT_ROUNDS = 12;
const PASSWORD_ALPHABET =
  "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz0123456789!@#$%&*?";

interface JwtPayload extends jwt.JwtPayload {
  sub: string;
  email: string;
  role: Role;
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function createAuthToken(user: AuthenticatedUser): string {
  const env = getEnv();
  return jwt.sign(
    {
      sub: user.id,
      email: user.email,
      role: user.role,
    },
    env.SESSION_SECRET,
    { expiresIn: TOKEN_EXPIRES_IN },
  );
}

export function verifyAuthToken(token: string): JwtPayload | null {
  const env = getEnv();

  try {
    return jwt.verify(token, env.SESSION_SECRET) as JwtPayload;
  } catch (error) {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Keycloak token validation via JWKS (signature verification)
// ---------------------------------------------------------------------------

interface KeycloakUserCache {
  user: AuthenticatedUser;
  expiresAt: number;
}

interface JwkKey {
  kid: string;
  kty: string;
  use?: string;
  alg?: string;
  n: string;
  e: string;
}

const keycloakCache = new Map<string, KeycloakUserCache>();
const KEYCLOAK_CACHE_TTL_MS = 60_000; // 1 minute

// JWKS cache: keyed by `${KEYCLOAK_BASE_URL}/realms/${KEYCLOAK_REALM}`
let jwksCache: { keys: Map<string, crypto.KeyObject>; fetchedAt: number } | null = null;
const JWKS_CACHE_TTL_MS = 600_000; // 10 minutes

async function getKeycloakPublicKeys(): Promise<Map<string, crypto.KeyObject>> {
  const env = getEnv();
  if (!env.KEYCLOAK_BASE_URL) return new Map();

  const now = Date.now();
  if (jwksCache && now - jwksCache.fetchedAt < JWKS_CACHE_TTL_MS) {
    return jwksCache.keys;
  }

  const url = `${env.KEYCLOAK_BASE_URL}/realms/${env.KEYCLOAK_REALM}/protocol/openid-connect/certs`;
  const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
  if (!response.ok) return new Map();

  const jwkSet = (await response.json()) as { keys: JwkKey[] };
  const keys = new Map<string, crypto.KeyObject>();

  for (const jwk of jwkSet.keys) {
    if (jwk.kty === "RSA" && jwk.use !== "enc") {
      // Node 16+ supports importing JWK directly via JsonWebKeyInput
      const keyObject = crypto.createPublicKey({
        key: jwk as unknown as crypto.JsonWebKeyInput["key"],
        format: "jwk",
      } as crypto.JsonWebKeyInput);
      keys.set(jwk.kid, keyObject);
    }
  }

  jwksCache = { keys, fetchedAt: now };
  return keys;
}

async function resolveKeycloakUser(token: string): Promise<AuthenticatedUser | null> {
  const env = getEnv();
  if (!env.KEYCLOAK_BASE_URL) return null;

  // Return cached entry if still valid
  const cached = keycloakCache.get(token);
  if (cached && cached.expiresAt > Date.now()) return cached.user;

  try {
    // Decode JWT header (without verification) to get kid
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const header = JSON.parse(
      Buffer.from(parts[0], "base64url").toString("utf8"),
    ) as { kid?: string; alg?: string };
    if (!header.kid) return null;

    // Fetch JWKS keys (cached)
    let keys = await getKeycloakPublicKeys();
    let publicKey = keys.get(header.kid);

    // If key not found, force a JWKS refresh (key rotation)
    if (!publicKey) {
      jwksCache = null;
      keys = await getKeycloakPublicKeys();
      publicKey = keys.get(header.kid);
    }

    if (!publicKey) return null;

    // Verify token signature (jsonwebtoken accepts KeyObject in newer versions)
    // Export as PEM since jsonwebtoken v9 requires string/Buffer
    const pem = publicKey.export({ type: "spki", format: "pem" }) as string;
    const claims = jwt.verify(token, pem, {
      algorithms: ["RS256"],
      // Do NOT check issuer — the token may be issued via any hostname
      // (localhost, Tailscale IP, etc.) depending on how the browser accessed Keycloak
    }) as jwt.JwtPayload;

    const email =
      (claims["email"] as string | undefined) ??
      (claims["preferred_username"] as string | undefined);
    if (!email) return null;

    // Derive role from Keycloak token claims (same logic as the frontend's deriveRole)
    const keycloakRole = deriveRoleFromClaims(claims);

    const user = await findOrProvisionKeycloakUser(email, keycloakRole);
    if (!user) return null;

    // Cache until token expiry (or our TTL, whichever is sooner)
    const tokenTtlMs = claims.exp ? claims.exp * 1000 - Date.now() : KEYCLOAK_CACHE_TTL_MS;
    keycloakCache.set(token, { user, expiresAt: Date.now() + Math.min(tokenTtlMs, KEYCLOAK_CACHE_TTL_MS) });

    // Evict stale entries when cache grows large
    if (keycloakCache.size > 500) {
      const now = Date.now();
      for (const [k, v] of keycloakCache) {
        if (v.expiresAt <= now) keycloakCache.delete(k);
      }
    }

    return user;
  } catch {
    return null;
  }
}

async function findOrProvisionKeycloakUser(
  email: string,
  keycloakRole: Role,
): Promise<AuthenticatedUser | null> {
  const env = getEnv();
  const tenantId = env.TENANT_ID;

  return withTenant(prisma, tenantId, async (tx) => {
    const existing = await tx.user.findUnique({
      where: { tenantId_email: { tenantId, email } },
    });

    if (existing) {
      // Sync role from Keycloak so that role changes (e.g. revoking admin)
      // propagate immediately instead of staying stale in the local record.
      if (existing.role !== keycloakRole) {
        const updated = await tx.user.update({
          where: { id: existing.id },
          data: { role: keycloakRole },
        });
        return { id: updated.id, email: updated.email, role: updated.role };
      }
      return { id: existing.id, email: existing.email, role: existing.role };
    }

    // Auto-provision: create the user using the role from their Keycloak token
    const displayName = email.split("@")[0] ?? email;
    const newUser = await tx.user.create({
      data: { tenantId, email, displayName, role: keycloakRole },
    });

    return { id: newUser.id, email: newUser.email, role: newUser.role };
  });
}

function deriveRoleFromClaims(claims: jwt.JwtPayload): Role {
  const collected = new Set<string>();

  const directRoles = claims["roles"];
  if (Array.isArray(directRoles)) {
    directRoles.forEach((r: unknown) => collected.add(String(r).toLowerCase()));
  }

  const realmRoles = (claims["realm_access"] as { roles?: unknown } | undefined)?.roles;
  if (Array.isArray(realmRoles)) {
    realmRoles.forEach((r: unknown) => collected.add(String(r).toLowerCase()));
  }

  const resourceAccess = claims["resource_access"] as Record<string, { roles?: unknown }> | undefined;
  if (resourceAccess) {
    Object.values(resourceAccess).forEach((resource) => {
      if (Array.isArray(resource.roles)) {
        resource.roles.forEach((r: unknown) => collected.add(String(r).toLowerCase()));
      }
    });
  }

  if (collected.has("admin")) return "ADMIN";
  if (collected.has("manager")) return "MANAGER";
  return "USER";
}

function deriveEncryptionKey(secret: string): Buffer {
  return crypto.createHash("sha256").update(secret).digest();
}

export function generateTemporaryPassword(length = 16): string {
  if (length <= 0) {
    throw new Error("Password length must be positive");
  }

  const bytes = crypto.randomBytes(length);
  let password = "";
  for (let index = 0; index < length; index += 1) {
    const charIndex = bytes[index] % PASSWORD_ALPHABET.length;
    password += PASSWORD_ALPHABET.charAt(charIndex);
  }
  return password;
}

export function encryptSecret(value: string): string {
  const env = getEnv();
  const iv = crypto.randomBytes(12);
  const key = deriveEncryptionKey(env.ENCRYPTION_SECRET);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  const payload = {
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    data: encrypted.toString("base64"),
  };

  return Buffer.from(JSON.stringify(payload)).toString("base64");
}

export function decryptSecret(cipherText: string): string {
  const env = getEnv();
  const decoded = Buffer.from(cipherText, "base64").toString("utf8");
  const payload = JSON.parse(decoded) as { iv: string; tag: string; data: string };
  const key = deriveEncryptionKey(env.ENCRYPTION_SECRET);

  const iv = Buffer.from(payload.iv, "base64");
  const tag = Buffer.from(payload.tag, "base64");
  const data = Buffer.from(payload.data, "base64");

  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);

  const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
  return decrypted.toString("utf8");
}

export async function resolveUserFromRequest(
  req?: IncomingMessage,
): Promise<AuthenticatedUser | null> {
  if (!req?.headers.authorization) {
    return null;
  }

  const token = req.headers.authorization.replace("Bearer ", "").trim();
  if (!token) {
    return null;
  }

  // 1. Try local JWT (issued by this API via createAuthToken)
  const payload = verifyAuthToken(token);
  if (payload?.sub) {
    const env = getEnv();
    const user = await withTenant(prisma, env.TENANT_ID, (tx) =>
      tx.user.findUnique({ where: { id: payload.sub } }),
    );
    if (user) {
      return { id: user.id, email: user.email, role: user.role };
    }
  }

  // 2. Fall back to Keycloak token validation via /userinfo
  return resolveKeycloakUser(token);
}

export async function seedAdminUser(): Promise<User> {
  const env = getEnv();
  const tenantId = env.TENANT_ID;

  return withTenant(prisma, tenantId, async (tx) => {
    const existing = await tx.user.findUnique({
      where: { tenantId_email: { tenantId, email: env.ADMIN_EMAIL } },
      include: { credential: true },
    });

    const passwordHash = await hashPassword(env.ADMIN_PASSWORD);

    if (!existing) {
      return tx.user.create({
        data: {
          tenantId,
          email: env.ADMIN_EMAIL,
          displayName: env.ADMIN_DISPLAY_NAME,
          role: "ADMIN",
          credential: {
            create: {
              tenantId,
              type: CredentialType.LOCAL,
              secretHash: passwordHash,
            },
          },
        },
      });
    }

    const updates: Partial<User> = {};

    if (existing.role !== "ADMIN") {
      updates.role = "ADMIN";
    }

    if (Object.keys(updates).length > 0) {
      await tx.user.update({
        where: { id: existing.id },
        data: updates,
      });
    }

    if (existing.credential) {
      const isSamePassword = await verifyPassword(env.ADMIN_PASSWORD, existing.credential.secretHash);
      if (!isSamePassword) {
        await tx.credential.update({
          where: { id: existing.credential.id },
          data: { secretHash: passwordHash },
        });
      }
    } else {
      await tx.credential.create({
        data: {
          tenantId,
          type: CredentialType.LOCAL,
          secretHash: passwordHash,
          userId: existing.id,
        },
      });
    }

    return tx.user.findUniqueOrThrow({
      where: { id: existing.id },
    });
  });
}

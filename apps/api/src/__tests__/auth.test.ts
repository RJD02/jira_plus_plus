import { vi, describe, it, expect, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks — must be declared before any import that touches these modules
// ---------------------------------------------------------------------------

const MOCK_ENV = {
  SESSION_SECRET: "test-secret-key-for-jwt-signing-minimum-32-chars",
  KEYCLOAK_BASE_URL: "http://localhost:8080",
  KEYCLOAK_REALM: "jira-plus-plus",
  KEYCLOAK_CLIENT_ID: "jira-plus-plus",
  TENANT_ID: "test-tenant",
  ENCRYPTION_SECRET: "encryption-secret-at-least-32-characters-long!!",
  ADMIN_EMAIL: "admin@test.com",
  ADMIN_PASSWORD: "admin-password",
  ADMIN_DISPLAY_NAME: "Admin",
};

vi.mock("../env.js", () => ({
  getEnv: vi.fn(() => ({ ...MOCK_ENV })),
}));

vi.mock("../prisma.js", () => ({ prisma: {} }));

vi.mock("@platform/clients", () => ({
  withTenant: vi.fn((_prisma: unknown, _tenantId: string, fn: Function) => fn(_prisma)),
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import {
  verifyAuthToken,
  createAuthToken,
  hashPassword,
  verifyPassword,
  encryptSecret,
  decryptSecret,
  generateTemporaryPassword,
} from "../auth.js";

// We need the internal deriveRoleFromClaims — it's not exported, so we test
// it indirectly through the public API. For direct testing, we'd need to
// export it or use a test-only re-export. Instead we test the exported functions
// that exercise these code paths.

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("auth module", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // JWT token creation & verification
  // -------------------------------------------------------------------------

  describe("createAuthToken / verifyAuthToken", () => {
    it("creates a valid JWT that can be verified", () => {
      const user = { id: "user-1", email: "alice@test.com", role: "ADMIN" as const };
      const token = createAuthToken(user);

      expect(typeof token).toBe("string");
      expect(token.split(".")).toHaveLength(3); // JWT has 3 parts

      const payload = verifyAuthToken(token);
      expect(payload).not.toBeNull();
      expect(payload!.sub).toBe("user-1");
      expect(payload!.email).toBe("alice@test.com");
      expect(payload!.role).toBe("ADMIN");
    });

    it("returns null for an invalid token", () => {
      expect(verifyAuthToken("not-a-jwt")).toBeNull();
    });

    it("returns null for a token signed with a different secret", async () => {
      const jwtMod = await import("jsonwebtoken");
      const token = jwtMod.default.sign({ sub: "user-1" }, "wrong-secret");
      expect(verifyAuthToken(token)).toBeNull();
    });

    it("returns null for an expired token", async () => {
      const jwtMod = await import("jsonwebtoken");
      const token = jwtMod.default.sign(
        { sub: "user-1", email: "a@b.com", role: "USER" },
        MOCK_ENV.SESSION_SECRET,
        { expiresIn: "0s" },
      );
      // Token is already expired
      expect(verifyAuthToken(token)).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // Password hashing
  // -------------------------------------------------------------------------

  describe("hashPassword / verifyPassword", () => {
    it("hashes a password and verifies it", async () => {
      const hash = await hashPassword("my-password");
      expect(hash).not.toBe("my-password");
      expect(await verifyPassword("my-password", hash)).toBe(true);
    });

    it("rejects a wrong password", async () => {
      const hash = await hashPassword("correct-password");
      expect(await verifyPassword("wrong-password", hash)).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Encryption / decryption
  // -------------------------------------------------------------------------

  describe("encryptSecret / decryptSecret", () => {
    it("encrypts and decrypts a secret round-trip", () => {
      const secret = "my-jira-api-token-12345";
      const encrypted = encryptSecret(secret);

      expect(encrypted).not.toContain(secret); // Should be base64, not plaintext
      expect(decryptSecret(encrypted)).toBe(secret);
    });

    it("produces different ciphertexts for the same input (random IV)", () => {
      const secret = "same-secret";
      const a = encryptSecret(secret);
      const b = encryptSecret(secret);
      expect(a).not.toBe(b);
      // But both decrypt to the same value
      expect(decryptSecret(a)).toBe(secret);
      expect(decryptSecret(b)).toBe(secret);
    });
  });

  // -------------------------------------------------------------------------
  // Temporary password generation
  // -------------------------------------------------------------------------

  describe("generateTemporaryPassword", () => {
    it("generates a password of the requested length", () => {
      const pw = generateTemporaryPassword(20);
      expect(pw).toHaveLength(20);
    });

    it("defaults to length 16", () => {
      const pw = generateTemporaryPassword();
      expect(pw).toHaveLength(16);
    });

    it("throws for non-positive length", () => {
      expect(() => generateTemporaryPassword(0)).toThrow("Password length must be positive");
      expect(() => generateTemporaryPassword(-1)).toThrow("Password length must be positive");
    });

    it("only uses characters from the allowed alphabet", () => {
      const alphabet =
        "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz0123456789!@#$%&*?";
      const pw = generateTemporaryPassword(100);
      for (const ch of pw) {
        expect(alphabet).toContain(ch);
      }
    });
  });
});

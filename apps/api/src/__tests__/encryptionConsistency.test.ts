import { vi, describe, it, expect } from "vitest";

// ---------------------------------------------------------------------------
// Mocks — must be declared before any import that touches these modules
// ---------------------------------------------------------------------------

let currentEncryptionSecret = "secret-alpha-at-least-32-characters-long";

vi.mock("../env.js", () => ({
  getEnv: vi.fn(() => ({
    ENCRYPTION_SECRET: currentEncryptionSecret,
  })),
}));

vi.mock("../prisma.js", () => ({ prisma: {} }));

vi.mock("@platform/clients", () => ({
  withTenant: vi.fn((_prisma: unknown, _tenantId: string, fn: Function) => fn(_prisma)),
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import {
  encryptSecret,
  decryptSecret,
} from "../auth.js";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Encryption secret consistency", () => {
  it("round-trips when the same secret is used for encrypt and decrypt", () => {
    currentEncryptionSecret = "alpha-secret-must-be-at-least-32chars!!";
    const plaintext = "ATATT3xFfGF0axSY_test-jira-api-token";
    const ciphertext = encryptSecret(plaintext);

    expect(ciphertext).not.toContain(plaintext);
    expect(decryptSecret(ciphertext)).toBe(plaintext);
  });

  it("fails decryption when a different secret is used (reproduces root cause)", () => {
    // Encrypt with secret A
    currentEncryptionSecret = "please-change-this-encryption-secret-32";
    const plaintext = "ATATT3xFfGF0axSY_test-jira-api-token";
    const ciphertext = encryptSecret(plaintext);

    // Attempt decrypt with secret B
    currentEncryptionSecret = "replace-with-random-string-at-least-32-chars";
    expect(() => decryptSecret(ciphertext)).toThrow(
      /Unsupported state or unable to authenticate data/,
    );
  });

  it("succeeds when switching back to the original secret", () => {
    // Encrypt with secret A
    currentEncryptionSecret = "please-change-this-encryption-secret-32";
    const plaintext = "my-sensitive-token-value";
    const ciphertext = encryptSecret(plaintext);

    // Decrypt with secret A (same key)
    expect(decryptSecret(ciphertext)).toBe(plaintext);
  });
});

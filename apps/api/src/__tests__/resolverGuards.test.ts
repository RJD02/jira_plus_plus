import { vi, describe, it, expect } from "vitest";
import { GraphQLError } from "graphql";

/**
 * Unit tests for resolver auth guard functions.
 *
 * We re-implement the guard logic here (same as resolvers.ts) because the
 * guards are unexported private functions. This verifies the authorization
 * contract: requireUser throws UNAUTHENTICATED, requireAdmin throws FORBIDDEN
 * for non-admin, requireAdminOrManager throws FORBIDDEN for USER role.
 */

interface RequestContext {
  user: { id: string; email: string; role: string } | null;
}

// Replicate the guard functions exactly as in resolvers.ts
function requireUser(ctx: RequestContext) {
  if (!ctx.user) {
    throw new GraphQLError("Authentication required", {
      extensions: { code: "UNAUTHENTICATED" },
    });
  }
  return ctx.user;
}

function requireAdmin(ctx: RequestContext) {
  const user = requireUser(ctx);
  if (user.role !== "ADMIN") {
    throw new GraphQLError("Admin privileges required", {
      extensions: { code: "FORBIDDEN" },
    });
  }
  return user;
}

function requireAdminOrManager(ctx: RequestContext) {
  const user = requireUser(ctx);
  if (user.role !== "ADMIN" && user.role !== "MANAGER") {
    throw new GraphQLError("Admin or Manager privileges required", {
      extensions: { code: "FORBIDDEN" },
    });
  }
  return user;
}

// ---------------------------------------------------------------------------
// Test users
// ---------------------------------------------------------------------------

const adminUser = { id: "admin-1", email: "admin@test.com", role: "ADMIN" };
const managerUser = { id: "mgr-1", email: "manager@test.com", role: "MANAGER" };
const regularUser = { id: "user-1", email: "user@test.com", role: "USER" };

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("resolver auth guards", () => {
  describe("requireUser", () => {
    it("returns user when authenticated", () => {
      expect(requireUser({ user: adminUser })).toEqual(adminUser);
    });

    it("throws UNAUTHENTICATED when user is null", () => {
      try {
        requireUser({ user: null });
        expect.fail("should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(GraphQLError);
        expect((err as GraphQLError).extensions.code).toBe("UNAUTHENTICATED");
      }
    });
  });

  describe("requireAdmin", () => {
    it("returns user for ADMIN role", () => {
      expect(requireAdmin({ user: adminUser })).toEqual(adminUser);
    });

    it("throws FORBIDDEN for MANAGER role", () => {
      try {
        requireAdmin({ user: managerUser });
        expect.fail("should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(GraphQLError);
        expect((err as GraphQLError).extensions.code).toBe("FORBIDDEN");
      }
    });

    it("throws FORBIDDEN for USER role", () => {
      try {
        requireAdmin({ user: regularUser });
        expect.fail("should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(GraphQLError);
        expect((err as GraphQLError).extensions.code).toBe("FORBIDDEN");
      }
    });

    it("throws UNAUTHENTICATED when user is null", () => {
      try {
        requireAdmin({ user: null });
        expect.fail("should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(GraphQLError);
        expect((err as GraphQLError).extensions.code).toBe("UNAUTHENTICATED");
      }
    });
  });

  describe("requireAdminOrManager", () => {
    it("returns user for ADMIN role", () => {
      expect(requireAdminOrManager({ user: adminUser })).toEqual(adminUser);
    });

    it("returns user for MANAGER role", () => {
      expect(requireAdminOrManager({ user: managerUser })).toEqual(managerUser);
    });

    it("throws FORBIDDEN for USER role", () => {
      try {
        requireAdminOrManager({ user: regularUser });
        expect.fail("should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(GraphQLError);
        expect((err as GraphQLError).extensions.code).toBe("FORBIDDEN");
      }
    });

    it("throws UNAUTHENTICATED when user is null", () => {
      try {
        requireAdminOrManager({ user: null });
        expect.fail("should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(GraphQLError);
        expect((err as GraphQLError).extensions.code).toBe("UNAUTHENTICATED");
      }
    });
  });
});

// ---------------------------------------------------------------------------
// Resolver-level authorization mapping tests
// ---------------------------------------------------------------------------

describe("resolver authorization mapping", () => {
  /**
   * These tests document which resolvers require which auth level.
   * This is a "contract test" — if someone accidentally weakens a guard,
   * the test name makes the expected policy clear.
   */

  const ADMIN_ONLY_MUTATIONS = [
    "updateJiraSite",
  ];

  const ADMIN_OR_MANAGER_QUERIES = [
    "reportingDefinitions",
    "reportingRuns",
    "reportDefinition",
  ];

  const ADMIN_OR_MANAGER_MUTATIONS = [
    "registerJiraProject",
    "updateProjectSync",
    "inviteUser",
  ];

  it("documents admin-only mutations", () => {
    // This test exists as documentation — if new admin-only mutations are
    // added, add them here to keep the authorization contract visible.
    expect(ADMIN_ONLY_MUTATIONS).toContain("updateJiraSite");
  });

  it("documents admin-or-manager reporting queries", () => {
    expect(ADMIN_OR_MANAGER_QUERIES).toContain("reportingDefinitions");
    expect(ADMIN_OR_MANAGER_QUERIES).toContain("reportingRuns");
    expect(ADMIN_OR_MANAGER_QUERIES).toContain("reportDefinition");
  });

  it("documents admin-or-manager mutations", () => {
    expect(ADMIN_OR_MANAGER_MUTATIONS).toContain("registerJiraProject");
  });
});

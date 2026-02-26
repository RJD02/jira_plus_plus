/**
 * Base Smoke Test Suite
 *
 * Run after every story/debug work to ensure core app functionality is intact.
 * These tests use mocked GraphQL — no live backend required.
 *
 * Convention: prefix with `_` so it sorts first in Cypress runner.
 */

const TOKEN_STORAGE_KEY = "jira-plus-plus/token";
const USER_STORAGE_KEY = "jira-plus-plus/user";

const users = {
  admin: {
    id: "smoke-admin",
    email: "admin@smoke.test",
    displayName: "Smoke Admin",
    role: "ADMIN" as const,
  },
  manager: {
    id: "smoke-manager",
    email: "manager@smoke.test",
    displayName: "Smoke Manager",
    role: "MANAGER" as const,
  },
  user: {
    id: "smoke-user",
    email: "user@smoke.test",
    displayName: "Smoke User",
    role: "USER" as const,
  },
};

function setLocalAuth(win: Cypress.AUTWindow, user: (typeof users)[keyof typeof users]) {
  win.localStorage.setItem(TOKEN_STORAGE_KEY, `${user.role.toLowerCase()}-token`);
  win.localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
}

function visitAs(user: (typeof users)[keyof typeof users], path = "/") {
  cy.visit(path, {
    onBeforeLoad(win) {
      setLocalAuth(win, user);
    },
  });
}

const minimalAdminData = {
  AdminConsoleData: () => ({
    data: {
      users: [
        { id: users.admin.id, email: users.admin.email, displayName: users.admin.displayName, phone: null, role: "ADMIN", createdAt: new Date().toISOString() },
      ],
      jiraSites: [],
    },
  }),
};

describe("Base Smoke Tests", () => {
  describe("S1 — App shell renders", () => {
    it("loads the home page without errors", () => {
      cy.mockGraphql({});
      cy.visit("/");
      cy.get("header").should("be.visible");
      cy.contains("Sign in").should("be.visible");
    });

    it("displays the app brand name", () => {
      cy.mockGraphql({});
      cy.visit("/");
      cy.get("header h1").should("exist");
    });
  });

  describe("S2 — Navigation & routing", () => {
    it("shows all nav items for ADMIN", () => {
      cy.mockGraphql({});
      visitAs(users.admin);
      cy.contains("a", "Overview").should("be.visible");
      cy.contains("a", "Daily Scrum").should("be.visible");
      cy.contains("a", "Developer Focus").should("be.visible");
      cy.contains("a", "Manager Summary").should("be.visible");
      cy.contains("a", "Admin Console").should("be.visible");
    });

    it("shows all nav items for MANAGER", () => {
      cy.mockGraphql({});
      visitAs(users.manager);
      cy.contains("a", "Overview").should("be.visible");
      cy.contains("a", "Daily Scrum").should("be.visible");
      cy.contains("a", "Developer Focus").should("be.visible");
      cy.contains("a", "Manager Summary").should("be.visible");
      cy.contains("a", "Admin Console").should("be.visible");
    });

    it("hides admin/manager nav items for USER role", () => {
      cy.mockGraphql({});
      visitAs(users.user);
      cy.contains("a", "Overview").should("be.visible");
      cy.contains("a", "Daily Scrum").should("be.visible");
      cy.contains("a", "Developer Focus").should("be.visible");
      cy.contains("a", "Manager Summary").should("not.exist");
      cy.contains("a", "Admin Console").should("not.exist");
    });

    it("redirects USER away from /admin", () => {
      cy.mockGraphql({});
      visitAs(users.user, "/admin");
      cy.location("pathname").should("eq", "/");
    });

    it("redirects USER away from /manager", () => {
      cy.mockGraphql({});
      visitAs(users.user, "/manager");
      cy.location("pathname").should("eq", "/");
    });

    it("redirects unknown routes to /", () => {
      cy.mockGraphql({});
      visitAs(users.admin, "/nonexistent-route");
      cy.location("pathname").should("eq", "/");
    });
  });

  describe("S3 — RBAC: Admin Console access", () => {
    it("ADMIN can access /admin", () => {
      cy.mockGraphql(minimalAdminData);
      visitAs(users.admin, "/admin");
      cy.contains("Jira sites").should("be.visible");
    });

    it("MANAGER can access /admin", () => {
      cy.mockGraphql(minimalAdminData);
      visitAs(users.manager, "/admin");
      cy.contains("Jira sites").should("be.visible");
    });

    it("ADMIN sees Directory/Users section", () => {
      cy.mockGraphql(minimalAdminData);
      visitAs(users.admin, "/admin");
      cy.get("section#users").should("exist");
      cy.contains("Directory").should("be.visible");
    });

    it("MANAGER does NOT see Directory/Users section", () => {
      cy.mockGraphql(minimalAdminData);
      visitAs(users.manager, "/admin");
      cy.get("section#users").should("not.exist");
    });
  });

  describe("S4 — Theme toggle", () => {
    it("theme toggle button is present", () => {
      cy.mockGraphql({});
      cy.visit("/");
      cy.get("header").find("button").should("have.length.gte", 1);
    });
  });

  describe("S5 — Admin Console: Jira Sites table structure", () => {
    const siteData = {
      AdminConsoleData: () => ({
        data: {
          users: [],
          jiraSites: [
            {
              id: "site-smoke-1",
              alias: "Smoke Site",
              baseUrl: "https://smoke.atlassian.net",
              adminEmail: "admin@smoke.atlassian.net",
              createdAt: new Date().toISOString(),
              projects: [],
            },
          ],
        },
      }),
    };

    it("renders the Jira sites table with all columns including Actions", () => {
      cy.mockGraphql(siteData);
      visitAs(users.admin, "/admin");
      cy.wait("@gqlAdminConsoleData");
      const expectedHeaders = ["Alias", "Base URL", "Admin email", "Projects", "Registered", "Actions"];
      expectedHeaders.forEach((header) => {
        cy.contains("th", header).should("be.visible");
      });
    });

    it("shows edit and delete action buttons for each site", () => {
      cy.mockGraphql(siteData);
      visitAs(users.admin, "/admin");
      cy.wait("@gqlAdminConsoleData");
      cy.contains("td", "Smoke Site").parent("tr").within(() => {
        cy.get("button[title='Edit site']").should("be.visible");
        cy.get("button[title='Delete site']").should("be.visible");
      });
    });

    it("shows empty state when no sites registered", () => {
      cy.mockGraphql(minimalAdminData);
      visitAs(users.admin, "/admin");
      cy.wait("@gqlAdminConsoleData");
      cy.contains("No Jira sites registered yet").should("be.visible");
    });
  });
});

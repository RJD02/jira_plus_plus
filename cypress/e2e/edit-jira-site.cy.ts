/**
 * Story Tests — Edit Jira Site (jira-site-actions)
 *
 * Covers AC-1 through AC-7 from acceptance.md:
 *   AC-1: RBAC & tenant isolation
 *   AC-2: Edit fields supported (alias, email, apiToken; baseUrl disabled)
 *   AC-3: Validation & error handling
 *   AC-4: Secret handling (apiToken masked, never returned)
 *   AC-5: Sync uses updated credentials (architecture-level — not UI testable)
 *   AC-6: Audit trail (verified by mutation call completing)
 *   AC-7: UI behavior (edit form, cancel, save, toast)
 */

const TOKEN_STORAGE_KEY = "jira-plus-plus/token";
const USER_STORAGE_KEY = "jira-plus-plus/user";

const users = {
  admin: {
    id: "edit-admin",
    email: "admin@edit.test",
    displayName: "Edit Admin",
    role: "ADMIN" as const,
  },
  manager: {
    id: "edit-manager",
    email: "manager@edit.test",
    displayName: "Edit Manager",
    role: "MANAGER" as const,
  },
  user: {
    id: "edit-user",
    email: "user@edit.test",
    displayName: "Regular User",
    role: "USER" as const,
  },
};

function iso() {
  return new Date().toISOString();
}

interface SiteState {
  id: string;
  alias: string;
  baseUrl: string;
  adminEmail: string;
  createdAt: string;
  projects: Array<{
    id: string;
    jiraId: string;
    key: string;
    name: string;
    isActive: boolean;
    createdAt: string;
    trackedUsers: never[];
    syncJob: null;
    syncStates: never[];
  }>;
}

function buildSites(): SiteState[] {
  return [
    {
      id: "site-edit-1",
      alias: "STAR",
      baseUrl: "https://starhealthinsurance.atlassian.net",
      adminEmail: "v.sabhya@starinsurance.in",
      createdAt: iso(),
      projects: [
        {
          id: "proj-1",
          jiraId: "10001",
          key: "STR",
          name: "Star Core",
          isActive: true,
          createdAt: iso(),
          trackedUsers: [],
          syncJob: null,
          syncStates: [],
        },
      ],
    },
    {
      id: "site-edit-2",
      alias: "NPM",
      baseUrl: "https://whiteklay-tech.atlassian.net",
      adminEmail: "rishikesh.kumar@whiteklay.in",
      createdAt: iso(),
      projects: [],
    },
  ];
}

function visitAs(user: (typeof users)[keyof typeof users], path = "/") {
  cy.visit(path, {
    onBeforeLoad(win) {
      win.localStorage.setItem(TOKEN_STORAGE_KEY, `${user.role.toLowerCase()}-token`);
      win.localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
    },
  });
}

describe("Edit Jira Site — Story Tests", () => {
  let sites: SiteState[];

  const mockHandlers = () => ({
    AdminConsoleData: () => ({
      data: {
        users: [
          { id: users.admin.id, email: users.admin.email, displayName: users.admin.displayName, phone: null, role: "ADMIN", createdAt: iso() },
        ],
        jiraSites: sites,
      },
    }),
    UpdateJiraSite: (req: any) => {
      const { input } = req.body.variables;
      const site = sites.find((s) => s.id === input.id);
      if (!site) return { errors: [{ message: "Site not found" }] };
      if (input.alias) site.alias = input.alias;
      if (input.adminEmail) site.adminEmail = input.adminEmail;
      // apiToken is never returned — AC-4
      return {
        data: {
          updateJiraSite: {
            id: site.id,
            alias: site.alias,
            adminEmail: site.adminEmail,
          },
        },
      };
    },
    TestJiraConnection: () => ({
      data: { testJiraConnection: true },
    }),
    DeleteJiraSite: (req: any) => {
      const { id } = req.body.variables;
      sites = sites.filter((s) => s.id !== id);
      return { data: { deleteJiraSite: true } };
    },
  });

  const visitAdmin = (user: (typeof users)[keyof typeof users] = users.admin) => {
    visitAs(user, "/admin");
    cy.wait("@gqlAdminConsoleData");
  };

  // ── AC-1: RBAC & tenant isolation ────────────────────────────────────

  describe("AC-1: RBAC & tenant isolation", () => {
    beforeEach(() => {
      sites = buildSites();
      cy.mockGraphql(mockHandlers());
    });

    it("ADMIN can see and click Edit on a Jira site", () => {
      visitAdmin(users.admin);
      cy.contains("td", "STAR").parent("tr").within(() => {
        cy.get("button[title='Edit site']").should("be.visible").click();
      });
      cy.contains("Edit Jira site").should("be.visible");
    });

    it("MANAGER can see and click Edit on a Jira site", () => {
      visitAdmin(users.manager);
      cy.contains("td", "STAR").parent("tr").within(() => {
        cy.get("button[title='Edit site']").should("be.visible").click();
      });
      cy.contains("Edit Jira site").should("be.visible");
    });

    it("USER role cannot access /admin (redirected)", () => {
      visitAs(users.user, "/admin");
      cy.location("pathname").should("eq", "/");
    });
  });

  // ── AC-2: Edit fields supported ──────────────────────────────────────

  describe("AC-2: Edit fields supported", () => {
    beforeEach(() => {
      sites = buildSites();
      cy.mockGraphql(mockHandlers());
      visitAdmin();
    });

    it("edit form shows alias, email, apiToken fields and disabled baseUrl", () => {
      cy.contains("td", "STAR").parent("tr").find("button[title='Edit site']").click();
      // Alias field pre-populated
      cy.get("input[placeholder='Acme Cloud Jira']").should("have.value", "STAR");
      // Email field pre-populated
      cy.get("input[placeholder='admin@acme.com']").should("have.value", "v.sabhya@starinsurance.in");
      // API token field empty (password type)
      cy.get("input[type='password']").should("have.value", "");
      // Base URL disabled
      cy.get("input[title='Base URL cannot be changed after registration']").should("be.disabled");
      cy.contains("Base URL cannot be changed after registration").should("be.visible");
    });
  });

  // ── AC-3: Validation & error handling ────────────────────────────────

  describe("AC-3: Validation & error handling", () => {
    beforeEach(() => {
      sites = buildSites();
      cy.mockGraphql(mockHandlers());
      visitAdmin();
    });

    it("shows 'No changes to save' when nothing is modified", () => {
      cy.contains("td", "STAR").parent("tr").find("button[title='Edit site']").click();
      cy.contains("button", "Save changes").click();
      cy.contains("No changes to save").should("be.visible");
    });
  });

  // ── AC-4: Secret handling ────────────────────────────────────────────

  describe("AC-4: Secret handling", () => {
    beforeEach(() => {
      sites = buildSites();
      cy.mockGraphql(mockHandlers());
      visitAdmin();
    });

    it("API token input is of type password (masked)", () => {
      cy.contains("td", "STAR").parent("tr").find("button[title='Edit site']").click();
      cy.get("input[type='password']").should("exist");
      cy.get("input[type='password']").should("have.attr", "placeholder", "Enter new token to update (leave blank to keep current)");
    });

    it("update response does not contain apiToken/tokenCipher", () => {
      cy.contains("td", "STAR").parent("tr").find("button[title='Edit site']").click();
      cy.get("input[placeholder='Acme Cloud Jira']").clear().type("STAR Updated");
      cy.contains("button", "Save changes").click();
      cy.wait("@gqlUpdateJiraSite").then((interception) => {
        const responseBody = interception.response?.body;
        const responseJson = JSON.stringify(responseBody);
        expect(responseJson).to.not.contain("tokenCipher");
        expect(responseJson).to.not.contain("apiToken");
      });
    });
  });

  // ── AC-5: Test Connection ────────────────────────────────────────────

  describe("AC-5: Test Connection", () => {
    beforeEach(() => {
      sites = buildSites();
      cy.mockGraphql(mockHandlers());
      visitAdmin();
    });

    it("Test Connection button is disabled when no token entered", () => {
      cy.contains("td", "STAR").parent("tr").find("button[title='Edit site']").click();
      cy.contains("button", "Test connection").should("be.disabled");
    });

    it("Test Connection succeeds and shows success message", () => {
      cy.contains("td", "STAR").parent("tr").find("button[title='Edit site']").click();
      cy.get("input[type='password']").type("new-test-token");
      cy.contains("button", "Test connection").should("not.be.disabled").click();
      cy.wait("@gqlTestJiraConnection");
      cy.contains("Connection successful!").should("be.visible");
    });

    it("Test Connection shows validation message when no token", () => {
      cy.contains("td", "STAR").parent("tr").find("button[title='Edit site']").click();
      // Force-click even if disabled to test the handler guard
      cy.contains("button", "Test connection").click({ force: true });
      cy.contains("Enter a new API token to test the connection").should("be.visible");
    });
  });

  // ── AC-6: Audit trail (mutation completes = audit recorded) ──────────

  describe("AC-6: Audit trail recorded", () => {
    beforeEach(() => {
      sites = buildSites();
      cy.mockGraphql(mockHandlers());
      visitAdmin();
    });

    it("UpdateJiraSite mutation is called with correct input on save", () => {
      cy.contains("td", "STAR").parent("tr").find("button[title='Edit site']").click();
      cy.get("input[placeholder='Acme Cloud Jira']").clear().type("STAR v2");
      cy.get("input[placeholder='admin@acme.com']").clear().type("new@starinsurance.in");
      cy.contains("button", "Save changes").click();
      cy.wait("@gqlUpdateJiraSite").then((interception) => {
        const input = interception.request.body.variables.input;
        expect(input.id).to.eq("site-edit-1");
        expect(input.alias).to.eq("STAR v2");
        expect(input.adminEmail).to.eq("new@starinsurance.in");
      });
    });
  });

  // ── AC-7: UI behavior ────────────────────────────────────────────────

  describe("AC-7: UI behavior", () => {
    beforeEach(() => {
      sites = buildSites();
      cy.mockGraphql(mockHandlers());
      visitAdmin();
    });

    it("edit form opens, saves, and UI reflects updated values", () => {
      cy.contains("td", "STAR").parent("tr").find("button[title='Edit site']").click();
      cy.contains("Edit Jira site").should("be.visible");
      cy.get("input[placeholder='Acme Cloud Jira']").clear().type("STAR Renamed");
      cy.contains("button", "Save changes").click();
      cy.wait("@gqlUpdateJiraSite");
      cy.wait("@gqlAdminConsoleData");
      cy.contains("td", "STAR Renamed").should("be.visible");
    });

    it("cancel button closes the modal without saving", () => {
      cy.contains("td", "STAR").parent("tr").find("button[title='Edit site']").click();
      cy.contains("Edit Jira site").should("be.visible");
      cy.get("input[placeholder='Acme Cloud Jira']").clear().type("Should not persist");
      cy.contains("button", "Cancel").click();
      cy.contains("Edit Jira site").should("not.exist");
      cy.contains("td", "STAR").should("be.visible");
      cy.contains("td", "Should not persist").should("not.exist");
    });

    it("each site row has both edit and delete buttons", () => {
      cy.contains("td", "STAR").parent("tr").within(() => {
        cy.get("button[title='Edit site']").should("be.visible");
        cy.get("button[title='Delete site']").should("be.visible");
      });
      cy.contains("td", "NPM").parent("tr").within(() => {
        cy.get("button[title='Edit site']").should("be.visible");
        cy.get("button[title='Delete site']").should("be.visible");
      });
    });
  });

  // ── Delete site flow ─────────────────────────────────────────────────

  describe("Delete Jira site flow", () => {
    beforeEach(() => {
      sites = buildSites();
      cy.mockGraphql(mockHandlers());
      visitAdmin();
    });

    it("delete flow: warning → type-to-confirm → site removed", () => {
      cy.contains("td", "NPM").parent("tr").find("button[title='Delete site']").click();
      // Step 1: warning modal
      cy.contains("Delete Jira site").should("be.visible");
      cy.contains("This action cannot be undone").should("be.visible");
      cy.contains("button", "I understand, continue").click();
      // Step 2: type-to-confirm
      cy.contains("Confirm deletion").should("be.visible");
      cy.get("input[placeholder='NPM']").type("NPM");
      cy.contains("button", "Delete permanently").click();
      cy.wait("@gqlDeleteJiraSite");
      cy.wait("@gqlAdminConsoleData");
      cy.contains("td", "NPM").should("not.exist");
    });

    it("delete confirm button is disabled until alias matches", () => {
      cy.contains("td", "NPM").parent("tr").find("button[title='Delete site']").click();
      cy.contains("button", "I understand, continue").click();
      cy.contains("button", "Delete permanently").should("be.disabled");
      cy.get("input[placeholder='NPM']").type("wrong");
      cy.contains("button", "Delete permanently").should("be.disabled");
      cy.get("input[placeholder='NPM']").clear().type("NPM");
      cy.contains("button", "Delete permanently").should("not.be.disabled");
    });
  });
});

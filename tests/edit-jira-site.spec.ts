/**
 * Story Tests — Edit Jira Site (Playwright)
 *
 * Covers AC-1 through AC-7 from acceptance.md.
 */
import { test, expect, type Page } from "@playwright/test";
import { setupMockAuth, mockGraphql, testUsers, type TestUser } from "./helpers/mockAuth";

interface SiteState {
  id: string;
  alias: string;
  baseUrl: string;
  adminEmail: string;
  createdAt: string;
  projects: any[];
}

function buildSites(): SiteState[] {
  return [
    {
      id: "site-edit-1",
      alias: "STAR",
      baseUrl: "https://starhealthinsurance.atlassian.net",
      adminEmail: "v.sabhya@starinsurance.in",
      createdAt: new Date().toISOString(),
      projects: [{ id: "proj-1", jiraId: "10001", key: "STR", name: "Star Core", isActive: true, createdAt: new Date().toISOString(), trackedUsers: [], syncJob: null, syncStates: [] }],
    },
    {
      id: "site-edit-2",
      alias: "NPM",
      baseUrl: "https://whiteklay-tech.atlassian.net",
      adminEmail: "rishikesh.kumar@whiteklay.in",
      createdAt: new Date().toISOString(),
      projects: [],
    },
  ];
}

function buildHandlers(sites: SiteState[]): Record<string, (body: any) => any> {
  return {
    AdminConsoleData: () => ({
      data: {
        users: [{ id: testUsers.admin.id, email: testUsers.admin.email, displayName: testUsers.admin.displayName, phone: null, role: "ADMIN", createdAt: new Date().toISOString() }],
        jiraSites: sites,
      },
    }),
    UpdateJiraSite: (body: any) => {
      const { input } = body.variables;
      const site = sites.find((s) => s.id === input.id);
      if (!site) return { errors: [{ message: "Site not found" }] };
      if (input.alias) site.alias = input.alias;
      if (input.adminEmail) site.adminEmail = input.adminEmail;
      return { data: { updateJiraSite: { id: site.id, alias: site.alias, adminEmail: site.adminEmail } } };
    },
    TestJiraConnection: () => ({ data: { testJiraConnection: true } }),
    DeleteJiraSite: (body: any) => {
      const { id } = body.variables;
      const idx = sites.findIndex((s) => s.id === id);
      if (idx !== -1) sites.splice(idx, 1);
      return { data: { deleteJiraSite: true } };
    },
  };
}

async function setupAndVisitAdmin(page: Page, user: TestUser = testUsers.admin) {
  const sites = buildSites();
  await mockGraphql(page, buildHandlers(sites));
  await setupMockAuth(page, user);
  await page.goto("/admin");
  await expect(page.locator("text=Jira sites")).toBeVisible();
  return sites;
}

async function openEditModal(page: Page, alias: string) {
  const row = page.locator("tr", { has: page.locator(`td:has-text("${alias}")`) });
  await row.locator('button[title="Edit site"]').click();
  await expect(page.locator("text=Edit Jira site")).toBeVisible();
}

// ── AC-1: RBAC ─────────────────────────────────────────────────────────

test.describe("AC-1: RBAC & tenant isolation", () => {
  test("ADMIN can open edit modal", async ({ page }) => {
    await setupAndVisitAdmin(page, testUsers.admin);
    await openEditModal(page, "STAR");
  });

  test("MANAGER can open edit modal", async ({ page }) => {
    await setupAndVisitAdmin(page, testUsers.manager);
    await openEditModal(page, "STAR");
  });

  test("USER is redirected away from /admin", async ({ page }) => {
    const sites = buildSites();
    await mockGraphql(page, buildHandlers(sites));
    await setupMockAuth(page, testUsers.user);
    await page.goto("/admin");
    await expect(page).toHaveURL("/");
  });
});

// ── AC-2: Edit fields ──────────────────────────────────────────────────

test.describe("AC-2: Edit fields supported", () => {
  test("form shows alias, email, apiToken and disabled baseUrl", async ({ page }) => {
    await setupAndVisitAdmin(page);
    await openEditModal(page, "STAR");
    await expect(page.locator("input[placeholder='Acme Cloud Jira']")).toHaveValue("STAR");
    await expect(page.locator("input[placeholder='admin@acme.com']")).toHaveValue("v.sabhya@starinsurance.in");
    await expect(page.locator("input[type='password']")).toHaveValue("");
    await expect(page.locator("input[title='Base URL cannot be changed after registration']")).toBeDisabled();
    await expect(page.locator("text=Base URL cannot be changed after registration")).toBeVisible();
  });
});

// ── AC-3: Validation ───────────────────────────────────────────────────

test.describe("AC-3: Validation & error handling", () => {
  test("no-changes message when nothing modified", async ({ page }) => {
    await setupAndVisitAdmin(page);
    await openEditModal(page, "STAR");
    await page.locator("button:has-text('Save changes')").click();
    await expect(page.locator("text=No changes to save")).toBeVisible();
  });
});

// ── AC-4: Secret handling ──────────────────────────────────────────────

test.describe("AC-4: Secret handling", () => {
  test("token input is password type with correct placeholder", async ({ page }) => {
    await setupAndVisitAdmin(page);
    await openEditModal(page, "STAR");
    const tokenInput = page.locator("input[type='password']");
    await expect(tokenInput).toBeVisible();
    await expect(tokenInput).toHaveAttribute("placeholder", "Enter new token to update (leave blank to keep current)");
  });

  test("update response does not contain secret fields", async ({ page }) => {
    await setupAndVisitAdmin(page);

    const responsePromise = new Promise<any>((resolve) => {
      page.on("response", async (response) => {
        if (response.url().includes("graphql")) {
          try {
            const json = await response.json();
            if (json?.data?.updateJiraSite) resolve(json);
          } catch { /* not json */ }
        }
      });
    });

    await openEditModal(page, "STAR");
    await page.locator("input[placeholder='Acme Cloud Jira']").fill("STAR Updated");
    await page.locator("button:has-text('Save changes')").click();

    const response = await responsePromise;
    const str = JSON.stringify(response);
    expect(str).not.toContain("tokenCipher");
    expect(str).not.toContain("apiToken");
  });
});

// ── AC-5: Test Connection ──────────────────────────────────────────────

test.describe("AC-5: Test Connection", () => {
  test("disabled when no token entered", async ({ page }) => {
    await setupAndVisitAdmin(page);
    await openEditModal(page, "STAR");
    await expect(page.locator("button:has-text('Test connection')")).toBeDisabled();
  });

  test("succeeds and shows success message", async ({ page }) => {
    await setupAndVisitAdmin(page);
    await openEditModal(page, "STAR");
    await page.locator("input[type='password']").fill("new-token");
    await page.locator("button:has-text('Test connection')").click();
    await expect(page.locator("text=Connection successful!")).toBeVisible();
  });
});

// ── AC-6: Audit trail ──────────────────────────────────────────────────

test.describe("AC-6: Audit trail recorded", () => {
  test("mutation called with correct input", async ({ page }) => {
    const sites = buildSites();
    let savedInput: any = null;
    const handlers = buildHandlers(sites);
    const origUpdate = handlers.UpdateJiraSite;
    handlers.UpdateJiraSite = (body: any) => {
      savedInput = body.variables.input;
      return origUpdate(body);
    };

    await mockGraphql(page, handlers);
    await setupMockAuth(page, testUsers.admin);
    await page.goto("/admin");
    await expect(page.locator("text=Jira sites")).toBeVisible();

    await openEditModal(page, "STAR");
    await page.locator("input[placeholder='Acme Cloud Jira']").fill("STAR v2");
    await page.locator("input[placeholder='admin@acme.com']").fill("new@star.in");
    await page.locator("button:has-text('Save changes')").click();

    await page.waitForResponse((r) => r.url().includes("graphql"));
    expect(savedInput).toBeTruthy();
    expect(savedInput.id).toBe("site-edit-1");
    expect(savedInput.alias).toBe("STAR v2");
    expect(savedInput.adminEmail).toBe("new@star.in");
  });
});

// ── AC-7: UI behavior ──────────────────────────────────────────────────

test.describe("AC-7: UI behavior", () => {
  test("save updates reflected in table", async ({ page }) => {
    await setupAndVisitAdmin(page);
    await openEditModal(page, "STAR");
    await page.locator("input[placeholder='Acme Cloud Jira']").fill("STAR Renamed");
    await page.locator("button:has-text('Save changes')").click();
    await expect(page.locator("td:has-text('STAR Renamed')")).toBeVisible();
  });

  test("cancel discards changes", async ({ page }) => {
    await setupAndVisitAdmin(page);
    await openEditModal(page, "STAR");
    await page.locator("input[placeholder='Acme Cloud Jira']").fill("Should not persist");
    await page.locator("button:has-text('Cancel')").click();
    await expect(page.locator("text=Edit Jira site")).toHaveCount(0);
    await expect(page.locator("td:has-text('STAR')")).toBeVisible();
    await expect(page.locator("td:has-text('Should not persist')")).toHaveCount(0);
  });

  test("both edit and delete buttons on each row", async ({ page }) => {
    await setupAndVisitAdmin(page);
    for (const alias of ["STAR", "NPM"]) {
      const row = page.locator("tr", { has: page.locator(`td:has-text("${alias}")`) });
      await expect(row.locator('button[title="Edit site"]')).toBeVisible();
      await expect(row.locator('button[title="Delete site"]')).toBeVisible();
    }
  });
});

// ── Delete flow ────────────────────────────────────────────────────────

test.describe("Delete Jira site flow", () => {
  test("warning → confirm → site removed", async ({ page }) => {
    await setupAndVisitAdmin(page);
    const row = page.locator("tr", { has: page.locator('td:has-text("NPM")') });
    await row.locator('button[title="Delete site"]').click();

    await expect(page.locator("text=Delete Jira site")).toBeVisible();
    await expect(page.locator("text=This action cannot be undone")).toBeVisible();
    await page.locator("button:has-text('I understand, continue')").click();

    await expect(page.locator("text=Confirm deletion")).toBeVisible();
    await page.locator("input[placeholder='NPM']").fill("NPM");
    await page.locator("button:has-text('Delete permanently')").click();

    await expect(page.locator("td:has-text('NPM')")).toHaveCount(0);
  });

  test("confirm button disabled until alias matches", async ({ page }) => {
    await setupAndVisitAdmin(page);
    const row = page.locator("tr", { has: page.locator('td:has-text("NPM")') });
    await row.locator('button[title="Delete site"]').click();
    await page.locator("button:has-text('I understand, continue')").click();

    await expect(page.locator("button:has-text('Delete permanently')")).toBeDisabled();
    await page.locator("input[placeholder='NPM']").fill("wrong");
    await expect(page.locator("button:has-text('Delete permanently')")).toBeDisabled();
    await page.locator("input[placeholder='NPM']").fill("NPM");
    await expect(page.locator("button:has-text('Delete permanently')")).toBeEnabled();
  });
});

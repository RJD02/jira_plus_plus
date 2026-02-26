/**
 * Base Smoke Test Suite (Playwright)
 *
 * Run after every story/debug work to ensure core app functionality is intact.
 * Uses route interception to mock GraphQL + __PLAYWRIGHT_AUTH_MOCK__ for auth.
 */
import { test, expect } from "@playwright/test";
import { setupMockAuth, mockGraphql, testUsers } from "./helpers/mockAuth";

const minimalAdminData: Record<string, (body: any) => any> = {
  AdminConsoleData: () => ({
    data: {
      users: [{ id: testUsers.admin.id, email: testUsers.admin.email, displayName: testUsers.admin.displayName, phone: null, role: "ADMIN", createdAt: new Date().toISOString() }],
      jiraSites: [],
    },
  }),
};

const siteData: Record<string, (body: any) => any> = {
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

test.describe("S1 — App shell renders", () => {
  test("loads the home page without errors", async ({ page }) => {
    await mockGraphql(page, {});
    await page.goto("/");
    await expect(page.locator("header")).toBeVisible();
  });

  test("displays the app brand name in header", async ({ page }) => {
    await mockGraphql(page, {});
    await page.goto("/");
    await expect(page.locator("header h1")).toBeVisible();
  });
});

test.describe("S2 — Navigation & routing", () => {
  test("shows all nav items for ADMIN", async ({ page }) => {
    await mockGraphql(page, {});
    await setupMockAuth(page, testUsers.admin);
    await page.goto("/");
    for (const label of ["Overview", "Daily Scrum", "Developer Focus", "Manager Summary", "Admin Console"]) {
      await expect(page.locator(`a:has-text("${label}")`).first()).toBeVisible();
    }
  });

  test("shows all nav items for MANAGER", async ({ page }) => {
    await mockGraphql(page, {});
    await setupMockAuth(page, testUsers.manager);
    await page.goto("/");
    for (const label of ["Overview", "Daily Scrum", "Developer Focus", "Manager Summary", "Admin Console"]) {
      await expect(page.locator(`a:has-text("${label}")`).first()).toBeVisible();
    }
  });

  test("hides admin/manager nav items for USER role", async ({ page }) => {
    await mockGraphql(page, {});
    await setupMockAuth(page, testUsers.user);
    await page.goto("/");
    await expect(page.locator('a:has-text("Overview")').first()).toBeVisible();
    await expect(page.locator('a:has-text("Daily Scrum")').first()).toBeVisible();
    await expect(page.locator('a:has-text("Manager Summary")')).toHaveCount(0);
    await expect(page.locator('a:has-text("Admin Console")')).toHaveCount(0);
  });

  test("redirects USER away from /admin", async ({ page }) => {
    await mockGraphql(page, {});
    await setupMockAuth(page, testUsers.user);
    await page.goto("/admin");
    await expect(page).toHaveURL("/");
  });

  test("redirects USER away from /manager", async ({ page }) => {
    await mockGraphql(page, {});
    await setupMockAuth(page, testUsers.user);
    await page.goto("/manager");
    await expect(page).toHaveURL("/");
  });

  test("redirects unknown routes to /", async ({ page }) => {
    await mockGraphql(page, {});
    await setupMockAuth(page, testUsers.admin);
    await page.goto("/nonexistent-route");
    await expect(page).toHaveURL("/");
  });
});

test.describe("S3 — RBAC: Admin Console access", () => {
  test("ADMIN can access /admin and sees Jira sites section", async ({ page }) => {
    await mockGraphql(page, minimalAdminData);
    await setupMockAuth(page, testUsers.admin);
    await page.goto("/admin");
    await expect(page.locator("text=Jira sites")).toBeVisible();
  });

  test("MANAGER can access /admin and sees Jira sites section", async ({ page }) => {
    await mockGraphql(page, minimalAdminData);
    await setupMockAuth(page, testUsers.manager);
    await page.goto("/admin");
    await expect(page.locator("text=Jira sites")).toBeVisible();
  });

  test("ADMIN sees Directory/Users section", async ({ page }) => {
    await mockGraphql(page, minimalAdminData);
    await setupMockAuth(page, testUsers.admin);
    await page.goto("/admin");
    await expect(page.locator("section#users")).toBeVisible();
    await expect(page.locator("text=Directory")).toBeVisible();
  });

  test("MANAGER does NOT see Directory/Users section", async ({ page }) => {
    await mockGraphql(page, minimalAdminData);
    await setupMockAuth(page, testUsers.manager);
    await page.goto("/admin");
    await expect(page.locator("text=Jira sites")).toBeVisible();
    await expect(page.locator("section#users")).toHaveCount(0);
  });
});

test.describe("S4 — Theme toggle", () => {
  test("theme toggle button is present in header", async ({ page }) => {
    await mockGraphql(page, {});
    await page.goto("/");
    await expect(page.locator("header button").first()).toBeVisible();
  });
});

test.describe("S5 — Admin Console: Jira Sites table structure", () => {
  test("renders table with all columns including Actions", async ({ page }) => {
    await mockGraphql(page, siteData);
    await setupMockAuth(page, testUsers.admin);
    await page.goto("/admin");
    for (const header of ["Alias", "Base URL", "Admin email", "Projects", "Registered", "Actions"]) {
      await expect(page.locator(`th:has-text("${header}")`)).toBeVisible();
    }
  });

  test("shows edit and delete buttons for each site", async ({ page }) => {
    await mockGraphql(page, siteData);
    await setupMockAuth(page, testUsers.admin);
    await page.goto("/admin");
    const row = page.locator("tr", { has: page.locator('td:has-text("Smoke Site")') });
    await expect(row.locator('button[title="Edit site"]')).toBeVisible();
    await expect(row.locator('button[title="Delete site"]')).toBeVisible();
  });

  test("shows empty state when no sites registered", async ({ page }) => {
    await mockGraphql(page, minimalAdminData);
    await setupMockAuth(page, testUsers.admin);
    await page.goto("/admin");
    await expect(page.locator("text=No Jira sites registered yet")).toBeVisible();
  });
});

import { test, expect } from "@playwright/test";

/**
 * Report Designer: Restore Report Designer story tests
 *
 * Validates:
 *   AC-2 — /reports route is reachable for authenticated ADMIN/MANAGER users
 *   AC-3 — Static reports are listed and viewable E2E
 *   AC-4 — Authorization: unauthenticated users are blocked
 *   AC-6 — Automated test coverage
 *
 * Requirements:
 *   - Frontend dev server running (VITE at :5175)
 *   - Keycloak running (:8082) with test user "dev-writer" / "password"
 *   - API server NOT required (GraphQL is mocked via route interception)
 */

const webBase = (process.env.WEB_URL ?? "http://127.0.0.1:5175").replace(
  /\/+$/,
  "",
);
const keycloakBase = (
  process.env.KEYCLOAK_BASE_URL ?? "http://100.83.117.14:8082"
).replace(/\/+$/, "");
const username = process.env.KEYCLOAK_TEST_USERNAME ?? "dev-writer";
const password = process.env.KEYCLOAK_TEST_PASSWORD ?? "password";

// Mock data matching the seeded report definitions
const REPORT_DEFINITIONS_RESPONSE = {
  data: {
    reportingDefinitions: [
      {
        id: "rpt-001",
        slug: "jira-issues-summary",
        name: "Jira Issues Summary",
        type: "QUERY",
        personaTags: ["manager", "admin"],
        currentVersion: { id: "ver-001", status: "PUBLISHED", publishedAt: "2026-02-25T12:00:00Z" },
      },
      {
        id: "rpt-002",
        slug: "sprint-velocity",
        name: "Sprint Velocity Report",
        type: "QUERY",
        personaTags: ["manager", "admin"],
        currentVersion: { id: "ver-002", status: "PUBLISHED", publishedAt: "2026-02-25T12:00:00Z" },
      },
    ],
  },
};

const REPORT_DETAIL_RESPONSE = {
  data: {
    reportDefinition: {
      id: "rpt-001",
      slug: "jira-issues-summary",
      name: "Jira Issues Summary",
      description: "Overview of all Jira issues across projects.",
      type: "QUERY",
      personaTags: ["manager", "admin"],
      versions: [
        { id: "ver-001", status: "PUBLISHED", notes: "Initial version", publishedAt: "2026-02-25T12:00:00Z", createdAt: "2026-02-25T12:00:00Z" },
      ],
      runs: [
        {
          id: "run-001",
          reportVersionId: "ver-001",
          status: "COMPLETED",
          executedAt: "2026-02-25T12:00:00Z",
          durationMs: 342,
          cacheHit: false,
          payload: {
            table: {
              columns: ["Key", "Summary", "Status", "Priority", "Assignee"],
              rows: [
                ["JPP-101", "Implement user authentication flow", "In Progress", "High", "Alice Chen"],
                ["JPP-102", "Fix dashboard loading performance", "Done", "Medium", "Bob Park"],
                ["JPP-103", "Add dark mode support", "To Do", "Low", "Carol Wu"],
              ],
            },
            metadata: { generatedAt: "2026-02-25T12:00:00Z", mode: "static-report" },
          },
          error: null,
        },
      ],
    },
  },
};

/**
 * Helper: intercept GraphQL and serve mock data based on operationName.
 */
function mockGraphQL(page: import("@playwright/test").Page) {
  return page.route("**/graphql", async (route) => {
    let body: Record<string, unknown> = {};
    try {
      body = route.request().postDataJSON() ?? {};
    } catch {
      // non-JSON body
    }
    const query = (body.query as string) ?? "";
    const operationName = (body.operationName as string) ?? "";

    // ReportDefinitions list query
    if (operationName === "ReportDefinitions" || query.includes("reportingDefinitions")) {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(REPORT_DEFINITIONS_RESPONSE) });
    }

    // ReportDefinition detail query
    if (operationName === "ReportDefinition" || query.includes("reportDefinition(")) {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(REPORT_DETAIL_RESPONSE) });
    }

    // Default: pass through or return empty
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: {} }),
    });
  });
}

/**
 * Helper: Log in via Keycloak, handling auto-login guard.
 */
async function loginViaKeycloak(page: import("@playwright/test").Page) {
  // Pre-exhaust auto-login attempts to prevent redirect loop
  await page.addInitScript(() => {
    window.sessionStorage.setItem("__JPP_AUTH_AUTO_ATTEMPTS__", "2");
  });

  await page.goto(`${webBase}/reports`, { waitUntil: "domcontentloaded" });

  // We might land on Keycloak login or sign-in gate
  const keycloakLogin = page.locator("#username");
  const signInGate = page.getByText("Sign in to continue");
  const reportsHeading = page.getByRole("heading", { name: "Reports" });

  const firstVisible = await Promise.race([
    keycloakLogin.waitFor({ state: "visible", timeout: 15000 }).then(() => "keycloak" as const),
    signInGate.waitFor({ state: "visible", timeout: 15000 }).then(() => "signin" as const),
    reportsHeading.waitFor({ state: "visible", timeout: 15000 }).then(() => "reports" as const),
  ]);

  if (firstVisible === "reports") {
    return; // already authenticated
  }

  if (firstVisible === "signin") {
    // Click "Continue with Keycloak" on the sign-in gate
    await page.getByRole("button", { name: /Continue with Keycloak/i }).click();
    // Wait for Keycloak login form
    await keycloakLogin.waitFor({ state: "visible", timeout: 15000 });
  }

  // Fill Keycloak credentials (whether we came from signin gate or directly)
  if (await keycloakLogin.isVisible()) {
    await keycloakLogin.fill(username);
    await page.locator("#password").fill(password);
    await page.locator("#kc-login").click();
    await page.waitForURL((url) => url.href.startsWith(webBase), { timeout: 15000 });
  }

  // Navigate to /reports after login
  if (!page.url().includes("/reports")) {
    await page.goto(`${webBase}/reports`, { waitUntil: "domcontentloaded" });
  }
}

test.describe("Report Designer — Route & Auth (AC-2, AC-4)", () => {
  test("AC-2: /reports route loads for authenticated user and shows heading", async ({ page }) => {
    await mockGraphQL(page);
    await loginViaKeycloak(page);

    const heading = page.getByRole("heading", { name: "Reports" });
    await expect(heading).toBeVisible({ timeout: 10000 });
  });

  test("AC-4: unauthenticated GraphQL request returns UNAUTHENTICATED", async ({ page }) => {
    // Direct API test — no browser login, just verify the API rejects
    const apiBase = process.env.API_URL ?? "http://localhost:4050";
    const response = await page.request.post(`${apiBase}/graphql`, {
      data: { query: "{ reportingDefinitions { id } }" },
      headers: { "Content-Type": "application/json" },
    });

    const json = await response.json();
    expect(json.errors).toBeDefined();
    expect(json.errors[0].extensions.code).toBe("UNAUTHENTICATED");
  });
});

test.describe("Report Designer — Static Reports (AC-3)", () => {
  test("AC-3: report definitions are listed with name and status", async ({ page }) => {
    await mockGraphQL(page);
    await loginViaKeycloak(page);

    await expect(page.getByRole("heading", { name: "Reports" })).toBeVisible({ timeout: 10000 });

    // Both reports should be listed
    await expect(page.getByText("Jira Issues Summary")).toBeVisible({ timeout: 5000 });
    await expect(page.getByText("Sprint Velocity Report")).toBeVisible({ timeout: 5000 });

    // Published badges should appear
    const publishedBadges = page.getByText("Published");
    await expect(publishedBadges.first()).toBeVisible();
  });

  test("AC-3: clicking a report shows table data", async ({ page }) => {
    await mockGraphQL(page);
    await loginViaKeycloak(page);

    await expect(page.getByRole("heading", { name: "Reports" })).toBeVisible({ timeout: 10000 });

    // Click the first report
    await page.getByText("Jira Issues Summary").first().click();

    // Verify table is visible with data
    const table = page.locator("table");
    await expect(table).toBeVisible({ timeout: 5000 });

    // Verify data rows are present
    await expect(table.getByRole("cell", { name: "JPP-101" })).toBeVisible({ timeout: 5000 });
    await expect(table.getByRole("cell", { name: "Alice Chen" })).toBeVisible({ timeout: 5000 });
    await expect(table.getByRole("cell", { name: "High" }).first()).toBeVisible();
  });
});

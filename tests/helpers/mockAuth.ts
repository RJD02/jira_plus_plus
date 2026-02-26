/**
 * Playwright test helpers for mocking auth and GraphQL.
 *
 * Strategy: Use __PLAYWRIGHT_AUTH_MOCK__ window global to inject a test user
 * into the AuthProvider, bypassing Keycloak entirely. The AuthProvider checks
 * for this global during initialization.
 */
import type { Page } from "@playwright/test";

export interface TestUser {
  id: string;
  email: string;
  displayName: string;
  role: "ADMIN" | "MANAGER" | "USER";
}

export const testUsers = {
  admin: { id: "test-admin", email: "admin@test.local", displayName: "Test Admin", role: "ADMIN" as const },
  manager: { id: "test-manager", email: "manager@test.local", displayName: "Test Manager", role: "MANAGER" as const },
  user: { id: "test-user", email: "user@test.local", displayName: "Test User", role: "USER" as const },
};

/**
 * Set up mock auth for a Playwright page. Call BEFORE page.goto().
 *
 * Injects __PLAYWRIGHT_AUTH_MOCK__ global which the AuthProvider reads
 * during initialization to skip Keycloak and set the user directly.
 */
export async function setupMockAuth(page: Page, user: TestUser) {
  // Block Keycloak requests to avoid any redirect attempts
  await page.route("**/realms/**", (route) => route.abort());

  await page.addInitScript(({ userJson, token }) => {
    (window as any).__PLAYWRIGHT_AUTH_MOCK__ = {
      token,
      user: JSON.parse(userJson),
    };
  }, {
    userJson: JSON.stringify(user),
    token: `mock-${user.role.toLowerCase()}-token`,
  });
}

/**
 * Mock all GraphQL requests for the page. Call BEFORE page.goto().
 */
export async function mockGraphql(page: Page, handlers: Record<string, (body: any) => any>) {
  await page.route("**/graphql", async (route) => {
    const body = route.request().postDataJSON();
    const opName = body?.operationName
      ?? body?.query?.match(/(?:query|mutation)\s+(\w+)/)?.[1]
      ?? "Unknown";
    const handler = handlers[opName];
    if (handler) {
      await route.fulfill({ json: handler(body) });
    } else {
      await route.fulfill({ json: { data: {} } });
    }
  });
}

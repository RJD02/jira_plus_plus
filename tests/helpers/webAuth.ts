/**
 * Playwright helpers for real-Keycloak auth flows (metadata app).
 *
 * Used by tests/auth/keycloak_redirect.spec.ts.
 * These helpers interact with actual Keycloak (no mocking).
 */
import type { Page } from "@playwright/test";

export const metadataBase = (
  process.env.METADATA_APP_URL ?? "http://127.0.0.1:5176"
).replace(/\/+$/, "");

const keycloakBase = (
  process.env.KEYCLOAK_BASE_URL ?? "http://100.83.117.14:8082"
).replace(/\/+$/, "");
const username = process.env.KEYCLOAK_TEST_USERNAME ?? "dev-writer";
const password = process.env.KEYCLOAK_TEST_PASSWORD ?? "password";

/** Capture console logs matching auth-related events. */
export function captureAuthLogs(page: Page): string[] {
  const logs: string[] = [];
  page.on("console", (msg) => {
    const text = msg.text();
    if (
      text.includes("[Auth:") ||
      text.includes("auth:auto") ||
      text.includes("auth:suppressed") ||
      text.includes("[AuthLoop]")
    ) {
      logs.push(text);
    }
  });
  return logs;
}

/** Wait for Keycloak auth redirect to settle (login page or back to app). */
export async function waitForKeycloakAuth(page: Page) {
  // Wait for either the Keycloak login form or the app to load
  const loginForm = page.locator("input[name='username']");
  const appContent = page.locator("[data-testid='app-root'], #root, #app");
  const troubleshooting = page.getByText("Troubleshooting");

  await loginForm.or(appContent).or(troubleshooting).waitFor({ timeout: 30_000 });
}

/** Perform a full Keycloak login and return to the app. */
export async function loginViaKeycloak(page: Page) {
  await page.goto(`${metadataBase}/`, { waitUntil: "commit" });

  // Wait for Keycloak login page
  await page.waitForURL(
    (url) =>
      url.href.startsWith(`${keycloakBase}/realms/`) &&
      url.href.includes("/protocol/openid-connect/auth"),
    { timeout: 90_000 },
  );

  await page.fill("input[name='username']", username);
  await page.fill("input[name='password']", password);
  await page.getByRole("button", { name: "Sign In" }).click();

  // Wait for redirect back to the app
  await page.waitForURL((url) => url.href.startsWith(metadataBase), {
    timeout: 30_000,
  });
}

/** Read a value from sessionStorage. */
export async function readSessionValue(
  page: Page,
  key: string,
): Promise<string | null> {
  return page.evaluate((k) => window.sessionStorage.getItem(k), key);
}

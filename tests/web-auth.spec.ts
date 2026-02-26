import { test, expect } from "@playwright/test";

const webBase = (process.env.WEB_URL ?? "http://127.0.0.1:5175").replace(/\/+$/, "");
const protectedPath = "/scrum";
const targetUrl = `${webBase}${protectedPath}`;
const keycloakBase = (process.env.KEYCLOAK_BASE_URL ?? "http://100.83.117.14:8082").replace(/\/+$/, "");
const username = process.env.KEYCLOAK_TEST_USERNAME ?? "dev-writer";
const password = process.env.KEYCLOAK_TEST_PASSWORD ?? "password";

async function submitKeycloakCredentials(page: import("@playwright/test").Page, username: string, password: string) {
  await page.fill("input[name='username']", username);
  await page.fill("input[name='password']", password);
  await page.getByRole("button", { name: "Sign In" }).click();
}

async function ensureKeycloakLogin(page: import("@playwright/test").Page, username: string, password: string) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await submitKeycloakCredentials(page, username, password);
    try {
      await page.waitForURL((url) => url.href.startsWith(targetUrl), { timeout: 15_000 });
      return;
    } catch (error) {
      const reauthBanner = page.getByText("Please re-authenticate", { exact: false });
      if (!(await reauthBanner.isVisible())) {
        throw error;
      }
      // loop and try again
    }
  }
  throw new Error("Keycloak login did not complete after multiple attempts");
}

test("protected route requires Keycloak login and returns to the console", async ({ page }) => {
  const autoLoginLogs: string[] = [];
  page.on("console", (msg) => {
    // eslint-disable-next-line no-console
    console.log(`[browser:${msg.type()}] ${msg.text()}`);
    if (msg.text().includes("[AuthLoop] auto login attempt")) {
      autoLoginLogs.push(msg.text());
    }
  });
  // Use "commit" so goto returns as soon as the server responds, without blocking on
  // DOMContentLoaded. The actual React load + Keycloak init + auto-login redirect can
  // take a while on a cold Vite dev server (all modules are fetched fresh every test run).
  await page.goto(targetUrl, { waitUntil: "commit" });
  await page.waitForURL(
    (url) => url.href.startsWith(`${keycloakBase}/realms/`) && url.href.includes("/protocol/openid-connect/auth"),
    { timeout: 90_000 },
  );

  await ensureKeycloakLogin(page, username, password);
  await expect(page).toHaveURL(/^http:\/\/127\.0\.0\.1:5175\/scrum/);
  expect(autoLoginLogs.length).toBeLessThanOrEqual(2);
});

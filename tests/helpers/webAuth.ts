import { expect, type Page } from "@playwright/test";

export const metadataBase = (process.env.METADATA_WEB_URL ?? "http://127.0.0.1:5176").replace(/\/+$/, "");
export const keycloakBase = (process.env.KEYCLOAK_BASE_URL ?? "http://localhost:8081").replace(/\/+$/, "");
const username = process.env.KEYCLOAK_TEST_USERNAME ?? "dev-writer";
const password = process.env.KEYCLOAK_TEST_PASSWORD ?? "password";

export async function waitForKeycloakAuth(page: Page) {
  await page.waitForURL(
    (url) => url.href.startsWith(`${keycloakBase}/realms/`) && url.href.includes("/protocol/openid-connect/auth"),
    { timeout: 15_000 },
  );
}

export async function loginViaKeycloak(page: Page) {
  page.on("console", (msg) => {
    // eslint-disable-next-line no-console
    console.log(`[metadata:${msg.type()}] ${msg.text()}`);
  });

  await page.goto(`${metadataBase}/`, { waitUntil: "domcontentloaded" });
  await waitForKeycloakAuth(page);

  for (let attempt = 0; attempt < 3; attempt += 1) {
    await page.fill("input[name='username']", username);
    await page.fill("input[name='password']", password);
    await page.getByRole("button", { name: "Sign In" }).click();
    try {
      await page.waitForURL((url) => url.href.startsWith(metadataBase), { timeout: 20_000 });
      return;
    } catch (error) {
      if (!(await page.locator("text=Please re-authenticate").isVisible())) {
        throw error;
      }
    }
  }
  throw new Error("Keycloak login did not complete after multiple attempts");
}

export function captureAuthLogs(page: Page) {
  const events: string[] = [];
  page.on("console", (msg) => {
    if (msg.text().includes("[AuthLoop]")) {
      events.push(msg.text());
    }
  });
  return events;
}

export async function readSessionValue(page: Page, key: string) {
  return page.evaluate((storageKey) => window.sessionStorage.getItem(storageKey), key);
}

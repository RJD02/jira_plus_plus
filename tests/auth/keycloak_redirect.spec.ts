import { test, expect } from "@playwright/test";
import {
  metadataBase,
  waitForKeycloakAuth,
  captureAuthLogs,
  loginViaKeycloak,
  readSessionValue,
} from "../helpers/webAuth";

const AUTO_ATTEMPTS_KEY = "kc:autoAttempts";
const LAST_ERROR_KEY = "kc:lastError";

function filterLogs(logs: string[], event: string) {
  return logs.filter((line) => line.includes(event));
}

test.describe("metadata auth guardrail", () => {
  test("first visit performs at most one auto attempt", async ({ page }) => {
    const logs = captureAuthLogs(page);
    await page.goto(`${metadataBase}/`, { waitUntil: "domcontentloaded" });
    await waitForKeycloakAuth(page);
    const attempts = filterLogs(logs, "auth:auto_attempt");
    expect(attempts.length).toBeLessThanOrEqual(1);
    expect(filterLogs(logs, "auth:auto_suppressed").length).toBeLessThanOrEqual(1);
  });

  test("error fragment halts auto login and surfaces troubleshooting", async ({ page }) => {
    await page.goto(`${metadataBase}/#error=login_required`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(500);
    await expect(page).toHaveURL(`${metadataBase}/`);
    await expect(page.getByText("Troubleshooting")).toBeVisible();
    await expect(page.getByRole("button", { name: "Continue with Keycloak" })).toBeVisible();
    const storedError = await readSessionValue(page, LAST_ERROR_KEY);
    expect(storedError).not.toBeNull();
    const autoAttempts = await readSessionValue(page, AUTO_ATTEMPTS_KEY);
    expect(Number(autoAttempts ?? "0")).toBe(0);
    await page.waitForTimeout(1000);
    expect(page.url()).toBe(`${metadataBase}/`);
  });

  test("manual retry clears stored error and starts a login attempt", async ({ page }) => {
    const logs = captureAuthLogs(page);
    await page.goto(`${metadataBase}/`, { waitUntil: "domcontentloaded" });
    await page.evaluate(() => {
      window.sessionStorage.setItem(
        "kc:lastError",
        JSON.stringify({ message: "Manual retry", code: "login_required", timestamp: Date.now() }),
      );
    });
    await page.reload();
    await expect(page.getByRole("button", { name: "Continue with Keycloak" })).toBeVisible();
    await page.getByRole("button", { name: "Continue with Keycloak" }).click();
    await waitForKeycloakAuth(page);
    expect(filterLogs(logs, "auth:auto_attempt").length).toBeGreaterThan(0);
    await page.goBack();
    await expect(page).toHaveURL(`${metadataBase}/`);
    await expect(page.getByText("Troubleshooting")).not.toBeVisible({ timeout: 2000 });
    const storedError = await readSessionValue(page, LAST_ERROR_KEY);
    if (storedError) {
      try {
        const parsed = JSON.parse(storedError);
        expect(parsed?.message).not.toContain("Manual retry");
      } catch {
        expect(storedError).toBeNull();
      }
    }
  });

  test("successful login resets guards and strips hash", async ({ page }) => {
    await loginViaKeycloak(page);
    await expect(page).toHaveURL((url) => url.href.startsWith(metadataBase));
    const autoAttempts = await readSessionValue(page, AUTO_ATTEMPTS_KEY);
    expect(Number(autoAttempts ?? "0")).toBe(0);
    const storedError = await readSessionValue(page, LAST_ERROR_KEY);
    expect(storedError).toBeNull();
    await expect(page.getByRole("button", { name: "Metadata" })).toBeVisible();
    expect(page.url()).not.toContain("#");
  });

  test("auto login is suppressed after max attempts", async ({ page }) => {
    const logs = captureAuthLogs(page);
    await page.goto(`${metadataBase}/`, { waitUntil: "domcontentloaded" });
    await waitForKeycloakAuth(page);
    await page.goto(`${metadataBase}/`, { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(`${metadataBase}/`);
    await page.waitForTimeout(500);
    expect(filterLogs(logs, "auth:auto_suppressed").some((line) => line.includes("exceeded_attempts"))).toBeTruthy();
  });

  test("silent check asset is reachable", async ({ request }) => {
    const response = await request.get(`${metadataBase}/silent-check-sso.html`);
    expect(response.ok()).toBeTruthy();
  });
});

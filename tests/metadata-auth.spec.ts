import { test, expect, type Page } from "@playwright/test";
import { ensureCatalogSeed } from "./helpers/metadata";

const metadataBase = (process.env.METADATA_WEB_URL ?? "http://127.0.0.1:5176").replace(/\/+$/, "");
const targetUrl = `${metadataBase}/`;
const keycloakBase = (process.env.KEYCLOAK_BASE_URL ?? "http://localhost:8081").replace(/\/+$/, "");
const username = process.env.KEYCLOAK_TEST_USERNAME ?? "dev-writer";
const password = process.env.KEYCLOAK_TEST_PASSWORD ?? "password";

test.beforeAll(async ({ request }) => {
  await ensureCatalogSeed(request);
});

async function loginViaKeycloak(page: Page) {
  page.on("console", (msg) => {
    // eslint-disable-next-line no-console
    console.log(`[metadata:${msg.type()}] ${msg.text()}`);
  });

  await page.goto(targetUrl, { waitUntil: "domcontentloaded" });
  await page.waitForURL(
    (url) => url.href.startsWith(`${keycloakBase}/realms/`) && url.href.includes("/protocol/openid-connect/auth"),
    { timeout: 15_000 },
  );

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

test("metadata console requires Keycloak login and loads workspace nav", async ({ page }) => {
  await loginViaKeycloak(page);
  const metadataTab = page.getByRole("button", { name: "Metadata" });
  await expect(metadataTab).toBeVisible({ timeout: 20_000 });
  await metadataTab.click();
  await expect(page.getByTestId("metadata-register-open").first()).toBeVisible();
  await expect(page.locator("text=/Authentication required/i")).toHaveCount(0);
});

test("metadata workspace sections render datasets, endpoints, and collections", async ({ page }) => {
  await loginViaKeycloak(page);
  await page.getByRole("button", { name: "Metadata" }).click();

  const catalogCards = page.locator("[data-testid='metadata-catalog-card']");
  const catalogEmpty = page.locator("[data-testid='metadata-catalog-empty']");
  await expect(catalogCards.first().or(catalogEmpty)).toBeVisible({ timeout: 20_000 });
  if ((await catalogCards.count()) > 0) {
    await expect(catalogCards.first()).toBeVisible();
    await catalogCards.first().click();
    const previewButton = page.getByTestId("metadata-preview-button");
    await expect(previewButton).toBeVisible();
    if (!(await previewButton.isDisabled())) {
      await previewButton.click();
      const previewResult = page.getByTestId("metadata-preview-table");
      await expect(previewResult.or(page.getByTestId("metadata-preview-empty"))).toBeVisible({ timeout: 20_000 });
    } else {
      await expect(page.getByTestId("metadata-preview-empty")).toBeVisible();
    }
    const viewDetailButton = page.getByRole("button", { name: "View detail" }).first();
    await viewDetailButton.click();
    await expect(page.getByTestId("metadata-dataset-detail-drawer")).toBeVisible();
    await page.locator("[data-testid='metadata-dataset-detail-drawer'] button", { hasText: "Close" }).first().click().catch(async () => {
      // dataset detail closes via backdrop; fall back to pressing Escape
      await page.keyboard.press("Escape");
    });
  } else {
    await expect(catalogEmpty).toBeVisible();
  }

  await page.getByRole("button", { name: "Endpoints" }).click();
  const endpointCards = page.locator("[data-testid='metadata-endpoint-card']");
  const endpointEmpty = page.locator("[data-testid='metadata-endpoint-empty']");
  await expect(endpointCards.first().or(endpointEmpty)).toBeVisible({ timeout: 20_000 });
  if ((await endpointCards.count()) > 0) {
    await expect(endpointCards.first()).toBeVisible();
    await endpointCards.first().getByRole("button", { name: "Details" }).click();
    await expect(page.getByTestId("metadata-endpoint-detail")).toBeVisible();
    await page.getByRole("button", { name: "Close" }).click();
  } else {
    await expect(endpointEmpty).toBeVisible();
  }

  await page.getByRole("button", { name: "Collections" }).click();
  const collectionsPanel = page.locator("[data-testid='metadata-collections-panel']");
  await expect(collectionsPanel).toBeVisible();

  await page.locator("[data-testid='metadata-register-open']").first().click();
  await expect(page.locator("[data-testid='metadata-register-form']")).toBeVisible();
});

test("postgres template connection test succeeds", async ({ page }) => {
  await loginViaKeycloak(page);
  await page.getByRole("button", { name: "Metadata" }).click();
  await page.locator("[data-testid='metadata-register-open']").first().click();
  await expect(page.locator("[data-testid='metadata-register-form']")).toBeVisible();

  await page.getByRole("button", { name: "JDBC" }).click();
  await page.getByRole("button", { name: /PostgreSQL/i }).first().click();

  await page.getByLabel(/Endpoint name/i).fill("Playwright Postgres Endpoint");
  await page.getByLabel(/Host/i).fill(process.env.METADATA_PG_HOST ?? "localhost");
  await page.getByLabel(/Port/i).fill(process.env.METADATA_PG_PORT ?? "5432");
  await page.getByLabel(/Database/i).fill(process.env.METADATA_PG_DATABASE ?? "jira_plus_plus");
  await page.getByLabel(/Username/i).fill(process.env.METADATA_PG_USERNAME ?? "postgres");
  await page.getByLabel(/Password/i).fill(process.env.METADATA_PG_PASSWORD ?? "postgres");
  await page.getByLabel(/Schemas/i).fill(process.env.METADATA_PG_SCHEMAS ?? "public");

  await page.getByRole("button", { name: /Test connection/i }).click();
  await expect(page.locator("text=Connection parameters validated.")).toBeVisible({ timeout: 20_000 });
  await expect(page.locator("text=/Write access denied/i")).toHaveCount(0);
});

import { test, expect, type Page, type APIRequestContext, type Route } from "@playwright/test";
import { loginViaKeycloak, ensureRealmUser, keycloakBase } from "./helpers/webAuth";

const POSTGRES_CONNECTION_DEFAULTS = {
  host: process.env.METADATA_PG_HOST ?? "localhost",
  port: process.env.METADATA_PG_PORT ?? "5432",
  database: process.env.METADATA_PG_DATABASE ?? "jira_plus_plus",
  username: process.env.METADATA_PG_USERNAME ?? "postgres",
  password: process.env.METADATA_PG_PASSWORD ?? "postgres",
  schemas: process.env.METADATA_PG_SCHEMAS ?? "public",
};
const DEFAULT_TEST_USERNAME = process.env.KEYCLOAK_TEST_USERNAME ?? "dev-writer";
const DEFAULT_TEST_PASSWORD = process.env.KEYCLOAK_TEST_PASSWORD ?? "password";
const METADATA_DEFAULT_PROJECT = process.env.METADATA_DEFAULT_PROJECT ?? "global";
const METADATA_CATALOG_DOMAIN = process.env.METADATA_CATALOG_DOMAIN ?? "catalog.dataset";

test.beforeEach(({ page }) => {
  page.addInitScript(() => {
    const originalFetch = window.fetch;
    window.fetch = async (...args) => {
      const [resource] = args;
      const url = typeof resource === "string" ? resource : resource instanceof Request ? resource.url : "";
      if (url.includes("graphql")) {
        console.info("[metadata-auth] fetch", url);
      }
      return originalFetch(...args);
    };
  });
  page.on("response", (response) => {
    if (!response.url().includes("graphql")) {
      return;
    }
    // eslint-disable-next-line no-console
    console.info("[metadata-auth] response", response.status(), response.url());
    if (response.status() >= 400) {
      // eslint-disable-next-line no-console
      console.warn("[metadata-auth] graphql failure", response.status(), response.url());
    }
  });
});

test("metadata console requires Keycloak login and loads workspace nav", async ({ page }) => {
  await loginViaKeycloak(page);
  const metadataTab = page.getByRole("button", { name: "Metadata" });
  await expect(metadataTab).toBeVisible({ timeout: 20_000 });
  await metadataTab.click();
  await ensureWorkspaceReady(page);
  await expect(page.getByTestId("metadata-register-open").first()).toBeVisible();
  await expect(page.locator("text=/Authentication required/i")).toHaveCount(0);
});

test("metadata workspace sections render datasets, endpoints, and collections", async ({ page }) => {
  await openMetadataWorkspace(page);

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
  await page.getByRole("button", { name: "Refresh" }).click();
  await ensureWorkspaceReady(page);
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
  await openMetadataWorkspace(page);
  await page.locator("[data-testid='metadata-register-open']").first().click();
  await expect(page.locator("[data-testid='metadata-register-form']")).toBeVisible();

  await page.getByRole("button", { name: "JDBC" }).click();
  const postgresOption = page.getByRole("button", { name: /PostgreSQL/i }).first();
  await expect(postgresOption).toBeVisible({ timeout: 20_000 });
  await postgresOption.click();

  await page.getByLabel(/Endpoint name/i).fill("Playwright Postgres Endpoint");
  await fillPostgresConnectionForm(page);

  await page.getByRole("button", { name: /Test connection/i }).click();
  const testResult = page.getByTestId("metadata-test-result");
  await expect(testResult).toContainText("Connection parameters validated.", { timeout: 20_000 });
  await expect(page.locator("text=/Write access denied/i")).toHaveCount(0);
});

test("metadata endpoints can be registered, edited, and deleted", async ({ page, request }) => {
  await openMetadataWorkspace(page);
  await page.locator("[data-testid='metadata-register-open']").first().click();
  await expect(page.locator("[data-testid='metadata-register-form']")).toBeVisible();

  await page.getByRole("button", { name: "JDBC" }).click();
  await page.getByRole("button", { name: /PostgreSQL/i }).first().click();

  const endpointName = `Playwright Endpoint ${Date.now()}`;
  const updatedEndpointName = `${endpointName} v2`;

  await page.getByLabel(/Endpoint name/i).fill(endpointName);
  await fillPostgresConnectionForm(page);
  await page.getByRole("button", { name: /Test connection/i }).click();
  await expect(page.getByTestId("metadata-test-result")).toContainText("Connection parameters validated.", {
    timeout: 20_000,
  });
  await page.getByRole("button", { name: /Register endpoint/i }).click();
  await page.getByRole("button", { name: /Back to overview/i }).click();
  await ensureWorkspaceReady(page);
  await page.getByRole("button", { name: "Endpoints" }).click();
  await page.getByRole("button", { name: "Refresh" }).click();
  await ensureWorkspaceReady(page);

  const endpointCard = page
    .locator("[data-testid='metadata-endpoint-card']")
    .filter({ hasText: endpointName })
    .first();
  await expect(endpointCard).toBeVisible({ timeout: 30_000 });
  await endpointCard.getByRole("button", { name: "Details" }).click();
  await expect(page.getByTestId("metadata-endpoint-detail")).toBeVisible();
  await expect(page.getByRole("button", { name: "Delete" })).toHaveCount(0);

  await page.getByRole("button", { name: "Edit" }).click();
  await expect(page.locator("[data-testid='metadata-register-form']")).toBeVisible();
  await page.getByLabel(/Endpoint name/i).fill(updatedEndpointName);
  await page.getByLabel(/Schemas/i).fill(`${POSTGRES_CONNECTION_DEFAULTS.schemas},playwright`);
  const saveButton = page.getByRole("button", { name: /Save changes/i });
  await expect(saveButton).toBeDisabled();
  await page.getByRole("button", { name: /Test connection/i }).click();
  await expect(page.getByTestId("metadata-test-result")).toContainText("Connection parameters validated.", {
    timeout: 20_000,
  });
  await expect(saveButton).toBeEnabled();
  await saveButton.click();
  await expect(page.locator("[data-testid='metadata-register-form']")).toBeHidden({ timeout: 20_000 });
  await ensureWorkspaceReady(page);
  await page.getByRole("button", { name: "Endpoints" }).click();
  await ensureWorkspaceReady(page);

  const updatedCard = page
    .locator("[data-testid='metadata-endpoint-card']")
    .filter({ hasText: updatedEndpointName })
    .first();
  await expect(updatedCard).toBeVisible({ timeout: 30_000 });
  const datasetDisplayName = await ensureEndpointDatasetViaApi(request, updatedEndpointName);
  await updatedCard.getByRole("button", { name: "Details" }).click();
  await expect(page.getByTestId("metadata-endpoint-detail")).toBeVisible();
  await expect(page.getByRole("button", { name: "Delete" })).toHaveCount(0);
  const detailPanel = page.getByTestId("metadata-endpoint-detail");
  await expect(detailPanel.getByText(/Datasets \(/)).toBeVisible();
  await detailPanel.getByRole("button", { name: "Refresh" }).click();
  const datasetRow = detailPanel.locator("li").filter({ hasText: datasetDisplayName }).first();
  await expect(datasetRow).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Close" }).click();

  await deleteEndpointViaApi(request, updatedEndpointName);
  await page.getByRole("button", { name: "Endpoints" }).click();
  await page.getByRole("button", { name: "Refresh" }).click();
  await ensureWorkspaceReady(page);
  await expect(
    page.locator("[data-testid='metadata-endpoint-card']").filter({ hasText: updatedEndpointName }),
  ).toHaveCount(0);
});

test("metadata viewer role cannot mutate endpoints", async ({ page, request }) => {
  const endpointName = `Viewer Endpoint ${Date.now()}`;
  await registerEndpointViaApi(request, endpointName);
  await ensureRealmUser({ username: "dev-viewer", password: "password", roles: ["viewer"] });
  await openMetadataWorkspace(page, { username: "dev-viewer", password: "password" });
  await page.getByRole("button", { name: "Endpoints" }).click();
  await ensureWorkspaceReady(page);
  await expect(page.getByTestId("metadata-register-open").first()).toBeDisabled();
  const endpointCard = page
    .locator("[data-testid='metadata-endpoint-card']")
    .filter({ hasText: endpointName })
    .first();
  await expect(endpointCard).toBeVisible({ timeout: 30_000 });
  const triggerButton = endpointCard.getByRole("button", { name: /Trigger collection/i });
  await expect(triggerButton).toBeDisabled();
  await endpointCard.getByRole("button", { name: "Details" }).click();
  const detailPanel = page.getByTestId("metadata-endpoint-detail");
  await expect(detailPanel).toBeVisible();
  await expect(detailPanel.getByRole("button", { name: "Edit" })).toHaveCount(0);
  await expect(detailPanel.getByRole("button", { name: "Delete" })).toHaveCount(0);
  await page.getByRole("button", { name: "Close" }).click();
  await deleteEndpointViaApi(request, endpointName);
});

test("metadata admin can delete endpoints via the UI", async ({ page, request }) => {
  const endpointName = `Admin Endpoint ${Date.now()}`;
  await registerEndpointViaApi(request, endpointName);
  const adminCredentials = { username: "dev-admin", password: process.env.KEYCLOAK_ADMIN_PASSWORD ?? "password" };
  await ensureRealmUser({ ...adminCredentials, roles: ["admin"] });
  await openMetadataWorkspace(page, adminCredentials);
  await page.getByRole("button", { name: "Endpoints" }).click();
  await ensureWorkspaceReady(page);
  const endpointCard = page
    .locator("[data-testid='metadata-endpoint-card']")
    .filter({ hasText: endpointName })
    .first();
  await expect(endpointCard).toBeVisible({ timeout: 30_000 });
  await endpointCard.getByRole("button", { name: "Details" }).click();
  const deleteButton = page.getByRole("button", { name: "Delete" });
  await expect(deleteButton).toBeEnabled();
  await deleteButton.click();
  await expect(page.getByTestId("metadata-endpoint-detail")).toBeHidden({ timeout: 20_000 });
  await page.getByRole("button", { name: "Endpoints" }).click();
  await ensureWorkspaceReady(page);
  await expect(
    page.locator("[data-testid='metadata-endpoint-card']").filter({ hasText: endpointName }),
  ).toHaveCount(0);
});

test("metadata dataset preview requires preview capability", async ({ page, request }) => {
  const endpointName = `Preview Endpoint ${Date.now()}`;
  await registerEndpointViaApi(request, endpointName, { capabilities: ["metadata"] });
  const datasetDisplayName = await ensureEndpointDatasetViaApi(request, endpointName);
  await openMetadataWorkspace(page);
  const catalogCard = page
    .locator("[data-testid='metadata-catalog-card']")
    .filter({ hasText: datasetDisplayName })
    .first();
  await expect(catalogCard).toBeVisible({ timeout: 30_000 });
  await catalogCard.click();
  const previewButton = page.getByTestId("metadata-preview-button");
  await expect(previewButton).toBeDisabled();
  await expect(
    page.getByText(`Dataset previews disabled: ${endpointName} is missing the "preview" capability.`),
  ).toBeVisible();
  await deleteEndpointViaApi(request, endpointName);
});

test("metadata editor can trigger collection runs and see status chip", async ({ page, request }) => {
  const endpointName = `Trigger Endpoint ${Date.now()}`;
  await registerEndpointViaApi(request, endpointName);
  const stopIntercept = await interceptMetadataTestWrites(page);
  try {
    await openMetadataWorkspace(page);
    await page.getByRole("button", { name: "Endpoints" }).click();
    await ensureWorkspaceReady(page);
    const endpointCard = page
      .locator("[data-testid='metadata-endpoint-card']")
      .filter({ hasText: endpointName })
      .first();
    await expect(endpointCard).toBeVisible({ timeout: 30_000 });
    await endpointCard.getByRole("button", { name: /Trigger collection/i }).click();
    await page.getByRole("button", { name: "Refresh" }).click();
    await ensureWorkspaceReady(page);
    const statusPill = endpointCard.getByTestId("metadata-endpoint-status");
    await expect(statusPill).toHaveAttribute("data-status", /succeeded/);
    await page.getByRole("button", { name: "Collections" }).click();
    const collectionsPanel = page.locator("[data-testid='metadata-collections-panel']");
    await expect(collectionsPanel).toBeVisible();
    await expect(collectionsPanel.locator("article").first()).toContainText(endpointName);
  } finally {
    await stopIntercept();
    await deleteEndpointViaApi(request, endpointName);
  }
});

async function ensureWorkspaceReady(page: Page) {
  const errorBanner = page.getByRole("button", { name: /GraphQL request failed/i });
  if (await errorBanner.isVisible({ timeout: 2000 }).catch(() => false)) {
    await errorBanner.click();
    await page.getByRole("button", { name: "Refresh" }).click();
  }
  const registerButton = page.getByTestId("metadata-register-open").first();
  const registerForm = page.locator("[data-testid='metadata-register-form']");
  await expect(registerButton.or(registerForm)).toBeVisible({ timeout: 20_000 });
}

async function openMetadataWorkspace(page: Page, credentials?: { username?: string; password?: string }) {
  await loginViaKeycloak(page, credentials);
  await page.getByRole("button", { name: "Metadata" }).click();
  await ensureWorkspaceReady(page);
}

async function fillPostgresConnectionForm(page: Page, overrides: Partial<typeof POSTGRES_CONNECTION_DEFAULTS> = {}) {
  const config = { ...POSTGRES_CONNECTION_DEFAULTS, ...overrides };
  await page.getByLabel(/Host/i).fill(config.host);
  await page.getByLabel(/Port/i).fill(config.port);
  await page.getByLabel(/Database/i).fill(config.database);
  await page.getByLabel(/Username/i).fill(config.username);
  await page.getByLabel(/Password/i).fill(config.password);
  await page.getByLabel(/Schemas/i).fill(config.schemas);
}

const METADATA_GRAPHQL_ENDPOINT = process.env.METADATA_GRAPHQL_ENDPOINT ?? "http://localhost:4010/graphql";
const KEYCLOAK_REALM = process.env.KEYCLOAK_REALM ?? process.env.VITE_KEYCLOAK_REALM ?? "nucleus";
const ADMIN_CREDENTIALS = { username: "dev-admin", password: process.env.KEYCLOAK_ADMIN_PASSWORD ?? "password" };

async function registerEndpointViaApi(
  request: APIRequestContext,
  endpointName: string,
  options?: { capabilities?: string[]; labels?: string[] },
): Promise<string> {
  await ensureRealmUser({ username: DEFAULT_TEST_USERNAME, password: DEFAULT_TEST_PASSWORD, roles: ["writer"] });
  const writerToken = await fetchKeycloakTokenForUser(request, {
    username: DEFAULT_TEST_USERNAME,
    password: DEFAULT_TEST_PASSWORD,
  });
  const registerResponse = await request.post(METADATA_GRAPHQL_ENDPOINT, {
    data: {
      query: `
        mutation RegisterEndpoint($input: EndpointInput!) {
          registerEndpoint(input: $input) {
            id
            name
          }
        }
      `,
      variables: {
        input: {
          projectSlug: METADATA_DEFAULT_PROJECT,
          name: endpointName,
          verb: "GET",
          url: `https://metadata-playwright.example.com/api/${Date.now()}`,
          description: "Playwright seeded endpoint",
          labels: options?.labels ?? ["playwright"],
          capabilities: options?.capabilities ?? ["metadata"],
        },
      },
    },
    headers: {
      Authorization: `Bearer ${writerToken}`,
      "Content-Type": "application/json",
      "X-Metadata-Test-Write": "1",
    },
  });
  if (!registerResponse.ok()) {
    const errorBody = await registerResponse.text();
    throw new Error(`Failed to register endpoint via API: ${errorBody}`);
  }
  const payload = (await registerResponse.json()) as { data?: { registerEndpoint?: { id: string } } };
  const endpointId = payload.data?.registerEndpoint?.id;
  if (!endpointId) {
    throw new Error("Register endpoint response missing id");
  }
  return endpointId;
}

async function ensureEndpointDatasetViaApi(
  request: APIRequestContext,
  endpointName: string,
  options?: { displayName?: string },
): Promise<string> {
  const adminToken = await ensureAdminToken(request);
  const endpoint = await fetchEndpointByName(request, adminToken, endpointName);
  if (!endpoint) {
    throw new Error(`Unable to locate endpoint "${endpointName}" to seed datasets`);
  }
  const datasetId = `pw_dataset_${Date.now()}`;
  const displayName = options?.displayName ?? `${endpointName} Dataset`;
  const upsertResponse = await request.post(METADATA_GRAPHQL_ENDPOINT, {
    data: {
      query: `
        mutation UpsertDataset($input: MetadataRecordInput!) {
          upsertMetadataRecord(input: $input) {
            id
          }
        }
      `,
      variables: {
        input: {
          id: datasetId,
          projectId: METADATA_DEFAULT_PROJECT,
          domain: METADATA_CATALOG_DOMAIN,
          labels: ["playwright", `endpoint:${endpoint.id}`],
            payload: {
              dataset: {
                id: datasetId,
                displayName,
                description: "Seeded dataset for endpoint detail verification",
                fields: [
                  { name: "id", type: "STRING", description: "Synthetic primary key" },
                  { name: "value", type: "NUMBER", description: "Synthetic metric" },
              ],
            },
            metadata_endpoint_id: endpoint.id,
            _metadata: {
              source_endpoint_id: endpoint.id,
              source_id: endpoint.id,
              collected_at: new Date().toISOString(),
            },
          },
        },
      },
    },
    headers: {
      Authorization: `Bearer ${adminToken}`,
      "Content-Type": "application/json",
      "X-Metadata-Test-Write": "1",
    },
  });
  if (!upsertResponse.ok()) {
    const errorBody = await upsertResponse.text();
    throw new Error(`Failed to seed dataset for endpoint: ${errorBody}`);
  }
  return displayName;
}

async function interceptMetadataTestWrites(page: Page): Promise<() => Promise<void>> {
  const targets = ["**://localhost:4010/graphql", "**://127.0.0.1:4010/graphql"];
  const handler = async (route: Route) => {
    const headers = {
      ...route.request().headers(),
      "x-metadata-test-write": "1",
    };
    await route.continue({ headers });
  };
  await Promise.all(targets.map((target) => page.route(target, handler)));
  return async () => {
    await Promise.all(targets.map((target) => page.unroute(target, handler)));
  };
}

async function deleteEndpointViaApi(request: APIRequestContext, endpointName: string) {
  const adminToken = await ensureAdminToken(request);
  const endpoint = await fetchEndpointByName(request, adminToken, endpointName);
  if (!endpoint) {
    throw new Error(`Unable to locate endpoint "${endpointName}" for deletion`);
  }
  const deleteResponse = await request.post(METADATA_GRAPHQL_ENDPOINT, {
    data: {
      query: `mutation DeleteEndpoint($id: ID!) { deleteEndpoint(id: $id) }`,
      variables: { id: endpoint.id },
    },
    headers: {
      Authorization: `Bearer ${adminToken}`,
      "Content-Type": "application/json",
      "X-Metadata-Test-Write": "1",
    },
  });
  if (!deleteResponse.ok()) {
    const errorBody = await deleteResponse.text();
    throw new Error(`Failed to delete endpoint via API: ${errorBody}`);
  }
}

async function fetchKeycloakTokenForUser(
  request: APIRequestContext,
  credentials: { username: string; password: string },
): Promise<string> {
  const response = await request.post(`${keycloakBase}/realms/${KEYCLOAK_REALM}/protocol/openid-connect/token`, {
    form: {
      client_id: "jira-plus-plus",
      grant_type: "password",
      username: credentials.username,
      password: credentials.password,
      scope: "nucleus-context",
    },
  });
  if (!response.ok()) {
    const errorBody = await response.text();
    throw new Error(`Failed to fetch Keycloak token: ${errorBody}`);
  }
  const payload = (await response.json()) as { access_token?: string };
  if (!payload.access_token) {
    throw new Error("Keycloak token response missing access_token");
  }
  return payload.access_token;
}

async function ensureAdminToken(request: APIRequestContext): Promise<string> {
  await ensureRealmUser({ ...ADMIN_CREDENTIALS, roles: ["admin"] });
  return fetchKeycloakTokenForUser(request, ADMIN_CREDENTIALS);
}

async function fetchEndpointByName(
  request: APIRequestContext,
  token: string,
  endpointName: string,
): Promise<{ id: string; name: string } | null> {
  const listResponse = await request.post(METADATA_GRAPHQL_ENDPOINT, {
    data: { query: `query EndpointList { endpoints { id name } }` },
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });
  if (!listResponse.ok()) {
    const errorBody = await listResponse.text();
    throw new Error(`Failed to list endpoints: ${errorBody}`);
  }
  const listPayload = (await listResponse.json()) as { data?: { endpoints: Array<{ id: string; name: string }> } };
  return listPayload.data?.endpoints.find((entry) => entry.name === endpointName) ?? null;
}

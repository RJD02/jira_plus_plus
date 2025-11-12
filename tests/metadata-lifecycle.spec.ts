import { test, expect } from "@playwright/test";
import { ensureCatalogSeed, fetchKeycloakToken, graphql } from "./helpers/metadata";

test.beforeAll(async ({ request }) => {
  await ensureCatalogSeed(request);
});

test.describe("Metadata catalog & endpoint lifecycle", () => {
  test("catalog datasets are available (seeded)", async ({ request }) => {
    const token = await fetchKeycloakToken(request);
    const data = await graphql<{ catalogDatasets: Array<{ id: string }> }>(
      request,
      token,
      `
        query CatalogSmoke {
          catalogDatasets {
            id
          }
        }
      `,
    );
    expect(data.catalogDatasets.length, "catalog datasets present").toBeGreaterThan(0);
  });

  test("register, update, and soft-delete an endpoint", async ({ request }) => {
    const token = await fetchKeycloakToken(request);
    const endpointName = `Smoke Endpoint ${Date.now()}`;
    const registerInput = {
      name: endpointName,
      verb: "GET",
      url: "https://metadata-smoke.example.com/api",
      description: "Smoke test endpoint",
      labels: ["smoke", "test"],
    };

    const registerResult = await graphql<{ registerMetadataEndpoint: { id: string } }>(
      request,
      token,
      `
        mutation Register($input: MetadataEndpointInput!) {
          registerMetadataEndpoint(input: $input) {
            id
          }
        }
      `,
      { input: registerInput },
    );

    const endpointId = registerResult.registerMetadataEndpoint.id;
    expect(endpointId).toBeTruthy();

    // Update description to verify edit lifecycle.
    await graphql(
      request,
      token,
      `
        mutation Update($input: MetadataEndpointInput!) {
          registerMetadataEndpoint(input: $input) {
            id
            description
            deletedAt
          }
        }
      `,
      {
        input: {
          ...registerInput,
          id: endpointId,
          description: "Updated via lifecycle test",
        },
      },
    );

    // Soft-delete the endpoint.
    const deleteResult = await graphql<{ deleteMetadataEndpoint: { id: string; deletedAt: string | null } }>(
      request,
      token,
      `
        mutation Delete($id: ID!) {
          deleteMetadataEndpoint(id: $id) {
            id
            deletedAt
          }
        }
      `,
      { id: endpointId },
    );
    expect(deleteResult.deleteMetadataEndpoint.deletedAt).toBeTruthy();

    const activeEndpoints = await graphql<{ metadataEndpoints: Array<{ id: string }> }>(
      request,
      token,
      `
        query ActiveEndpoints {
          metadataEndpoints {
            id
          }
        }
      `,
    );
    expect(activeEndpoints.metadataEndpoints.find((endpoint) => endpoint.id === endpointId)).toBeFalsy();

    const archivedEndpoints = await graphql<{ metadataEndpoints: Array<{ id: string; deletedAt: string | null }> }>(
      request,
      token,
      `
        query ArchivedEndpoints {
          metadataEndpoints(includeDeleted: true) {
            id
            deletedAt
          }
        }
      `,
    );
    expect(archivedEndpoints.metadataEndpoints.find((endpoint) => endpoint.id === endpointId)?.deletedAt).toBeTruthy();
  });
});

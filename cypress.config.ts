import { defineConfig } from "cypress";

const baseUrl = process.env.CYPRESS_BASE_URL || "http://127.0.0.1:5175";

export default defineConfig({
  e2e: {
    baseUrl,
    supportFile: "cypress/support/e2e.ts",
    video: false,
    screenshotOnRunFailure: true,
    retries: 1,
    experimentalSessionAndOrigin: true,
    env: {
      metadataBaseUrl: process.env.CYPRESS_METADATA_BASE_URL || "http://127.0.0.1:5176",
      metadataGraphqlEndpoint: process.env.CYPRESS_METADATA_GRAPHQL_ENDPOINT || "http://localhost:4010/graphql",
      keycloakBaseUrl: process.env.CYPRESS_KEYCLOAK_BASE_URL || "http://localhost:8081",
      keycloakRealm: process.env.CYPRESS_KEYCLOAK_REALM || "nucleus",
      keycloakClientId: process.env.CYPRESS_KEYCLOAK_CLIENT_ID || "jira-plus-plus",
      keycloakTestUsername: process.env.CYPRESS_KEYCLOAK_TEST_USERNAME || "dev-writer",
      keycloakTestPassword: process.env.CYPRESS_KEYCLOAK_TEST_PASSWORD || "password",
    },
  },
});

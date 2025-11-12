// Cypress support file

const TOKEN_STORAGE_KEY = "jira-plus-plus/token";
const USER_STORAGE_KEY = "jira-plus-plus/user";

const defaultMetadataBaseUrl = "http://127.0.0.1:5176";
const defaultKeycloakBaseUrl = "http://localhost:8081";

function getEnvString(key: string, fallback: string): string {
  const value = Cypress.env(key);
  if (typeof value === "string" && value.length > 0) {
    return value;
  }
  return fallback;
}

Cypress.Commands.add("metadataLogin", () => {
  const metadataBaseUrl = getEnvString("metadataBaseUrl", defaultMetadataBaseUrl);
  const keycloakBaseUrl = getEnvString("keycloakBaseUrl", defaultKeycloakBaseUrl);
  const keycloakUsername = getEnvString("keycloakTestUsername", "dev-writer");
  const keycloakPassword = getEnvString("keycloakTestPassword", "password");

  cy.session(
    ["metadata", keycloakUsername],
    () => {
      cy.visit(metadataBaseUrl);
      cy.contains("Continue with Keycloak").click();
      cy.origin(
        keycloakBaseUrl,
        { args: { username: keycloakUsername, password: keycloakPassword } },
        ({ username, password }) => {
          cy.get("input[name='username'], input#username").clear().type(username);
          cy.get("input[name='password'], input#password").clear().type(password, { log: false });
          cy.get("button[type='submit'], button#kc-login").click();
        },
      );
      cy.url().should("include", metadataBaseUrl);
    },
    {
      cacheAcrossSpecs: true,
    },
  );

  cy.visit(metadataBaseUrl);
});

Cypress.Commands.add("metadataGraphQL", (options: { query: string; variables?: Record<string, unknown> }) => {
  const metadataGraphqlEndpoint = getEnvString("metadataGraphqlEndpoint", "http://localhost:4010/graphql");
  const keycloakBaseUrl = getEnvString("keycloakBaseUrl", defaultKeycloakBaseUrl);
  const keycloakRealm = getEnvString("keycloakRealm", "nucleus");
  const keycloakClientId = getEnvString("keycloakClientId", "jira-plus-plus");
  const keycloakUsername = getEnvString("keycloakTestUsername", "dev-writer");
  const keycloakPassword = getEnvString("keycloakTestPassword", "password");

  return cy
    .request({
      method: "POST",
      url: `${keycloakBaseUrl}/realms/${keycloakRealm}/protocol/openid-connect/token`,
      form: true,
      body: {
        client_id: keycloakClientId,
        grant_type: "password",
        username: keycloakUsername,
        password: keycloakPassword,
      },
    })
    .then((tokenResponse) => {
      const token = tokenResponse.body.access_token as string;
      return cy.request({
        method: "POST",
        url: metadataGraphqlEndpoint,
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: {
          query: options.query,
          variables: options.variables,
        },
      });
    });
});

Cypress.Commands.add("ensureMetadataCatalogHasData", () => {
  cy.metadataGraphQL({
    query: `
      query CatalogSmoke {
        catalogDatasets {
          id
          displayName
        }
      }
    `,
  }).then((response) => {
    const datasets = response.body.data?.catalogDatasets ?? [];
    expect(
      datasets.length,
      "metadata catalog datasets exist (seed via metadata collection before running this test)",
    ).to.be.greaterThan(0);
  });
});

Cypress.Commands.add("setAuth", (user) => {
  const payload = {
    id: user.id ?? "user-1",
    email: user.email ?? "user@example.com",
    displayName: user.displayName ?? "Test User",
    role: user.role ?? "USER",
  };

  const token = user.token ?? "test-token";

  cy.window().then((win) => {
    win.localStorage.setItem(TOKEN_STORAGE_KEY, token);
    win.localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(payload));
  });
});

Cypress.Commands.add("clearAuth", () => {
  cy.window().then((win) => {
    win.localStorage.removeItem(TOKEN_STORAGE_KEY);
    win.localStorage.removeItem(USER_STORAGE_KEY);
  });
});

type GraphQLResponder =
  | ((req: Cypress.Interception) => void | { data?: unknown; errors?: unknown })
  | { data?: unknown; errors?: unknown };

declare global {
  namespace Cypress {
    interface Chainable {
      metadataLogin(): Chainable<void>;
      metadataGraphQL(options: { query: string; variables?: Record<string, unknown> }): Chainable<Cypress.Response<any>>;
      ensureMetadataCatalogHasData(): Chainable<void>;
      setAuth(user: {
        id?: string;
        email?: string;
        displayName?: string;
        role?: "ADMIN" | "USER" | "MANAGER";
        token?: string;
      }): Chainable<void>;
      clearAuth(): Chainable<void>;
      mockGraphql(handlers: Record<string, GraphQLResponder | undefined>): Chainable<void>;
    }
  }
}

function extractOperationName(body: unknown): string | null {
  if (!body || typeof body !== "object") {
    return null;
  }
  const operationName = (body as Record<string, unknown>).operationName;
  if (typeof operationName === "string" && operationName.length) {
    return operationName;
  }
  const query = (body as Record<string, unknown>).query;
  if (typeof query === "string") {
    const match = query.match(/(?:query|mutation)\s+([A-Za-z0-9_]+)/);
    if (match) {
      return match[1];
    }
  }
  return null;
}

Cypress.Commands.add("mockGraphql", (handlers) => {
  cy.intercept("POST", "**/graphql", (req) => {
    const operationName = extractOperationName(req.body) ?? "UnknownOperation";
    req.alias = `gql${operationName}`;
    const handler = handlers[operationName];
    if (!handler) {
      req.reply({ body: { data: {} } });
      return;
    }

    if (typeof handler === "function") {
      const maybeResponse = handler(req);
      if (maybeResponse !== undefined) {
        req.reply({ body: maybeResponse });
      }
      return;
    }

    req.reply({ body: handler });
  });
});

export {};

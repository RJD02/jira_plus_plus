describe("Keycloak login flow", () => {
  const keycloakBaseUrl: string = Cypress.env("keycloakBaseUrl") || "http://localhost:8082";
  const username: string = Cypress.env("keycloakTestUsername") || "dev-writer";
  const password: string = Cypress.env("keycloakTestPassword") || "password";

  beforeEach(() => {
    cy.clearCookies();
    cy.clearLocalStorage();
  });

  it("redirects to Keycloak, logs in, and returns authenticated", () => {
    cy.visit("/");

    // Wait for Keycloak init to complete (silent SSO iframe check takes ~5 s
    // before failing on cross-origin dev setups, then the Sign In button appears)
    cy.contains("button", /sign in with keycloak/i, { timeout: 20000 }).click();

    // Keycloak login page is on a different origin — use cy.origin()
    cy.origin(
      keycloakBaseUrl,
      { args: { username, password } },
      ({ username, password }) => {
        cy.get("input#username, input[name='username']", { timeout: 10000 })
          .should("be.visible")
          .type(username);
        cy.get("input#password, input[name='password']")
          .should("be.visible")
          .type(password, { log: false });
        cy.get("button#kc-login, input[type='submit'], button[type='submit']").click();
      },
    );

    // Should land back on the app, authenticated
    cy.url().should("include", "5175");

    // The "Sign in" button should be gone and a user menu should be visible
    cy.get("button", { timeout: 10000 })
      .filter(":visible")
      .should("not.contain.text", "Sign in with Keycloak");

    // Header-level sign in button also gone
    cy.contains("button", /^sign in$/i).should("not.exist");
  });
});

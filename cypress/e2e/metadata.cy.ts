const metadataBaseUrl = (Cypress.env("metadataBaseUrl") as string | undefined) ?? "http://127.0.0.1:5176";

describe("Metadata console", () => {
  before(() => {
    cy.ensureMetadataCatalogHasData();
  });

  it("shows user identity and supports logout", () => {
    cy.metadataLogin();
    cy.get("[data-testid='metadata-user-chip']").should("be.visible").and("contain", "Dev").and("contain", "Writer");
    cy.get("[data-testid='metadata-user-role']").should("contain", "USER").or("contain", "MANAGER").or("contain", "ADMIN");
    cy.get("[data-testid='metadata-logout-button']").click();
    cy.contains("Launch the metadata workspace").should("be.visible");
  });

  it("navigates catalog, endpoints, and collections", () => {
    cy.metadataLogin();
    cy.get("[data-testid='metadata-catalog-card']").should("exist");
    cy.contains("Endpoints").click();
    cy.get("[data-testid='metadata-endpoint-card']").should("exist");
    cy.contains("Collections").click();
    cy.get("[data-testid='metadata-collections-panel']").should("exist");
    cy.contains("Register endpoint").click();
    cy.get("[data-testid='metadata-register-form']").should("be.visible");
    cy.url().should("include", metadataBaseUrl);
  });

  it("supports dataset previews and endpoint detail drawers", () => {
    cy.metadataLogin();
    cy.get("body").then(($body) => {
      if ($body.find("[data-testid='metadata-catalog-card']").length) {
        cy.get("[data-testid='metadata-catalog-card']").first().click();
        cy.get("[data-testid='metadata-preview-button']").then(($button) => {
          if ($button.is(":disabled")) {
            cy.get("[data-testid='metadata-preview-empty']").should("be.visible");
          } else {
            cy.wrap($button).click();
            cy.get("[data-testid='metadata-preview-table'], [data-testid='metadata-preview-empty']").should("be.visible");
          }
        });
        cy.contains("button", "View detail").click();
        cy.get("[data-testid='metadata-dataset-detail-drawer']").should("be.visible");
        cy.get("[data-testid='metadata-dataset-detail-drawer']").contains("Close").click();
      } else {
        cy.get("[data-testid='metadata-catalog-empty']").should("be.visible");
      }
    });

    cy.contains("Endpoints").click();
    cy.get("body").then(($body) => {
      if ($body.find("[data-testid='metadata-endpoint-card']").length) {
        cy.get("[data-testid='metadata-endpoint-card']").first().contains("Details").click();
        cy.get("[data-testid='metadata-endpoint-detail']").should("be.visible");
        cy.get("[data-testid='metadata-endpoint-detail']").contains("Close").click();
      } else {
        cy.get("[data-testid='metadata-endpoint-empty']").should("be.visible");
      }
    });
  });
});

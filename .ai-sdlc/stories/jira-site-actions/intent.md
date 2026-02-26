# Intent — Allow ADMIN/MANAGER to edit Jira Site configuration (name, email, api_key)

## Background
Jira++ supports registering multiple Jira sites (instances). Currently, Jira site registration exists, but updating an existing Jira site configuration (site name, email, api_key) is missing or incomplete.

## Problem
Admins/Managers need to correct or rotate Jira credentials (API key), update the email used for Jira API access, and rename the Jira site for clarity. Without edit capability, outdated credentials break sync and force re-registration or manual DB intervention.

## Goal
Provide a secure, role-gated “Edit Jira Site” capability that allows ADMIN and MANAGER users to update:
- Jira site display name
- Jira email
- Jira API key/token

Edits must be validated, persisted, audited, and reflected across sync/health immediately (or clearly defined refresh behavior).

## Scope (In)
- UI: Edit form for Jira Site in Admin Console (or Manager view if applicable)
- API: Mutation/endpoint to update Jira site fields
- Backend validation and RBAC enforcement (ADMIN/MANAGER only)
- Secure handling of secrets (api_key): never returned in plain text, never logged
- Optional: “Test Connection” action to validate new credentials before saving (recommended)
- Automated tests for UI and API (Playwright/Cypress + service test)

## Scope (Out)
- Adding new auth providers or changing Keycloak configuration
- Changing the underlying Jira sync model beyond what is required to apply updated credentials
- Bulk edits across multiple sites (single-site edit only)

## Constraints
- Must preserve multi-tenancy: edits only affect tenant-owned Jira sites
- api_key must be stored securely (existing encryption/hashing approach must be reused)
- Avoid breaking existing sync workflows; update should be backward compatible
- Any error must be explicit and actionable (invalid credentials, permission denied, etc.)

## Assumptions
- Jira site entity exists with fields similar to: name, baseUrl, email, apiKey/token, tenantId, createdBy, etc.
- Sync jobs reference the Jira site record for credentials at runtime, or can be updated to do so.

## Deliverables
- “Edit Jira Site” UI + API integration
- RBAC + tenant isolation enforced server-side
- Verification and tests added under the story folder and integrated into repo test harness
- `.ai-sdlc` artifacts produced (analysis, plan, execution, audit, verification)
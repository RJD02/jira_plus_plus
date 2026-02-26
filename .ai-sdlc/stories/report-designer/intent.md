# Intent — Restore "Report Designer" feature from git history and integrate into current app

## Background
The codebase previously had a feature called "Report Designer" used to provide static reports per project. It existed in the git history but is not present (or not working) in the current version.

## Problem
We need to bring back the Report Designer capability by locating the last known working implementation in git history, extracting the relevant code, and integrating it cleanly into the current application architecture (frontend + backend + DB/config as needed).

## Goal
- Identify the commit(s) where Report Designer last worked.
- Understand how it worked (UI entrypoints, data sources, APIs, permissions).
- Restore the feature into the current app in a maintainable way, compatible with current auth/routing/data layers.
- Ensure it can be enabled and used for at least one project to view static reports.

## Scope (In)
- Git archaeology to find prior Report Designer implementation.
- Re-introducing required UI routes/components for Report Designer.
- Re-introducing or adapting backend endpoints/resolvers/services required to serve report data.
- Wiring permissions/auth so only intended users can access (e.g., manager/admin as applicable).
- Minimal DB/schema/config additions if required for report metadata/storage.
- Add UI + API tests (Playwright/Cypress + service tests) for acceptance criteria.

## Scope (Out)
- Building a brand-new report builder from scratch (only restore existing functionality).
- Major redesign of report UI/UX beyond what is necessary to integrate.
- Adding new report types not previously supported (unless trivial).

## Constraints
- Prefer minimal-change integration: reuse existing app patterns for routing, auth, GraphQL/REST, and state management.
- Avoid copy-paste of outdated architecture; adapt to current code style and folder structure.
- Do not reintroduce deprecated dependencies unless necessary; if needed, document and justify.
- No secrets/tokens/logging sensitive data.

## Assumptions
- The old feature can be found by searching git history for keywords like: "report designer", "reports", "static report", "dashboard report".
- The restored feature should work in local dev without requiring manual DB edits beyond documented migration/seed steps.

## Deliverables
- Restored Report Designer UI entrypoint integrated in the app navigation or route.
- Backend integration for fetching/serving report definitions and/or assets.
- Documentation in the story work folder: analysis.md, plan.md, diagrams.md, verification.md, audit.md.
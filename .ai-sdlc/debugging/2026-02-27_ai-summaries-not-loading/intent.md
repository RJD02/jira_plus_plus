# Intent — AI Summaries Not Loading

## What
The Daily Scrum Board shows "Select a teammate to review their AI summary" in the AI Summary panel, but no AI-generated summaries are available for any user. All user cards show placeholder text like "has not been synced yet" and "Trigger a Jira sync to populate today's plan."

## Why
AI summaries are a core feature of the Daily Scrum Board — managers rely on them for quick status updates. Without them, the board is effectively non-functional.

## Scope
- Diagnose why AI summaries are not being generated or returned
- Trace the full pipeline: UI request → GraphQL resolver → data source → LLM runtime
- Identify the root cause and fix it

## Constraints
- Local dev environment (API on :4000, Web on :5175, Keycloak on :8082)
- Temporal may be unhealthy (DB issues observed earlier)
- LLM skills directory was missing in dist (fixed this session)

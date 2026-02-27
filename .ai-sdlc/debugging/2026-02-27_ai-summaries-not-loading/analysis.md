# Analysis — AI Summaries Not Loading

## Problem Statement
The Daily Scrum Board shows placeholder text ("has not been synced yet", "Trigger a Jira sync to populate today's plan") for all users. AI summaries exist in the database but contain empty activity data because the upstream Jira sync pipeline is failing.

## Current Behavior
- UI shows "Select a teammate to review their AI summary" (empty state) or empty summary panels with idle/placeholder text.
- UserSummarySnapshot records exist (4 rows) but payload contains "no recorded activity" headlines.
- 0 issues and 0 worklogs in the database — no raw Jira data was ever synced.
- TaskSummarySnapshot count = 0 (no task-level summaries generated since no issue data).

## Expected Behavior
- Jira sync pulls issues, worklogs, and changelog data into the `Issue` and `Worklog` tables.
- Hierarchical summary generation produces populated TaskSummarySnapshots, UserSummarySnapshots, and ProjectSummarySnapshots.
- AI Summary panel shows rich narrative content per user.

## Root Cause Chain
1. **Primary**: `ENCRYPTION_SECRET` mismatch between local dev API (`apps/api/.env`) and Docker container (root `.env`).
   - `apps/api/.env`: `ENCRYPTION_SECRET="please-change-this-encryption-secret-32"`
   - Root `.env`: `ENCRYPTION_SECRET=replace-with-random-string-at-least-32-chars`
   - The Jira site was registered via the local API (which read `apps/api/.env`), so the Jira API token was encrypted with the local secret.
   - The Docker worker uses root `.env`, gets a different key, and `decryptSecret()` throws "Unsupported state or unable to authenticate data".

2. **Secondary**: Worker container was also failing to connect to Temporal (`localhost:7233` instead of `temporal:7233`), preventing any workflow execution. Fixed by adding `TEMPORAL_ADDRESS: temporal:7233` to docker-compose.

3. **Secondary**: Docker compose interpolation of `${POSTGRES_USER}` etc. in `environment:` blocks was failing because no `.env` file existed in `infra/` directory. Fixed by symlinking root `.env` to `infra/.env`.

4. **Tertiary**: No memory limits on Docker containers, causing the 7.8GB machine to OOM and reboot. Fixed by adding deploy.resources.limits to all services (~2.9GB total).

## Constraints + Assumptions
- Local dev environment: API :4000, Web :5175 (or :3000 in Docker), Keycloak :8082
- Machine: 7.8GB RAM, 4 CPUs — memory-constrained
- The Jira API token in the DB is valid but encrypted with the wrong key

## Candidate Approaches
1. **Align ENCRYPTION_SECRET** — Update root `.env` to match `apps/api/.env` (or vice versa) so Docker containers can decrypt the stored token. Simplest fix.
2. **Re-register Jira site** — Delete the existing JiraSite record and re-register with a fresh token. More disruptive.
3. **Run services locally (not Docker)** — Bypass the env mismatch entirely. Not a real fix.

## Risks / Unknowns
- The Jira API token itself may have expired (it was set today, likely still valid)
- After fixing decryption, the sync may surface other issues (rate limits, JQL errors, etc.)
- Summary generation depends on having recent DailySummary records to seed from

## Testability Assessment
- AC-1 (root cause): Documented above — manual verification via decrypt test
- AC-2 (pipeline trace): Documented above — DB queries confirm the gap
- AC-3 (fix applied): Verify via `docker logs jira_worker` showing successful sync + DB query for Issue count > 0
- AC-4 (local dev works): Hit the GraphQL endpoint and verify non-empty summary data

## Initial Confidence: 85%
High confidence in root cause. The fix is straightforward (align encryption secrets). Remaining uncertainty: whether the Jira token is still valid and whether the sync will produce enough data for meaningful summaries.

# Plan — AI Summaries Not Loading

## Objectives
- Fix the ENCRYPTION_SECRET mismatch so Docker-based worker can decrypt the Jira API token
- Verify Jira sync completes successfully and populates Issue/Worklog tables
- Confirm AI summaries are generated with real activity data
- Ensure the Daily Scrum Board displays populated AI summaries
- Add API unit tests and Playwright E2E tests for the AI summaries pipeline

## Scope
- **In**: Align encryption secrets, verify sync pipeline, verify summary generation, verify UI, write tests
- **Out**: Changing the Jira token itself, modifying the LLM narrative generation, changing auth flows

## Plan Steps

### M1 — Align ENCRYPTION_SECRET across environments
- **Description**: Update root `.env` to use `ENCRYPTION_SECRET="please-change-this-encryption-secret-32"` (matching `apps/api/.env`), then restart API and worker containers.
- **Files**: `.env`
- **Verification**: `docker exec jira_api` decrypt test succeeds; worker logs show no `decryptSecret` errors
- **Rollback**: Revert `.env` change

### M2 — Verify Jira sync completes
- **Description**: After the worker restarts with the correct secret, monitor worker logs for sync completion. Check `Issue` table has rows and `SyncLog` shows completion.
- **Files**: None (monitoring)
- **Verification**: `SELECT count(*) FROM "Issue"` > 0; `SyncLog` shows "Sync completed" entry
- **Rollback**: N/A

### M3 — Trigger summary regeneration
- **Description**: Once issues are synced, trigger a project summary regeneration via the GraphQL mutation or wait for the Temporal automation schedule. Verify TaskSummarySnapshot, UserSummarySnapshot payloads contain real activity data.
- **Files**: None (operational)
- **Verification**: `SELECT count(*) FROM "TaskSummarySnapshot"` > 0; UserSummarySnapshot payload contains non-idle headlines
- **Rollback**: N/A

### M4 — Verify UI displays AI summaries
- **Description**: Open Daily Scrum Board, select a user, verify the AI Summary panel shows narrative content instead of placeholder text.
- **Files**: None
- **Verification**: Manual UI check or API test via GraphQL

### M5 — API unit tests (Vitest)
- **Description**: Add unit tests for the hierarchical summary service and encryption consistency.
- **Files**:
  - `apps/api/src/__tests__/hierarchicalSummaryService.test.ts` — Tests for:
    - `fetchProjectSummaries` returns correctly shaped records with user/task summaries grouped by runId
    - `mapUserSummaryRecord` correctly maps DB entity to GraphQL record shape (identity, metrics, narrative fields)
    - `mapTaskSummaryRecord` correctly maps task entities (payload, timeline, participants)
    - `mapProjectSummaryRecord` correctly maps project entities (executiveBrief, teamHealth, highlights)
  - `apps/api/src/__tests__/encryptionConsistency.test.ts` — Tests for:
    - Encryption with one secret, decryption with same secret succeeds (round-trip)
    - Encryption with one secret, decryption with a **different** secret fails (reproduces the root cause)
    - Cross-environment env var validation: warns if ENCRYPTION_SECRET is the default placeholder
- **Framework**: Vitest (existing `apps/api/vitest.config.ts`)
- **Verification**: `pnpm --filter api test` passes

### M6 — Playwright E2E tests for Daily Scrum Board AI summaries
- **Description**: Add Playwright tests that verify the AI Summary panel renders correctly with mocked data and handles the empty/error states.
- **Files**:
  - `tests/scrum/ai-summaries.spec.ts` — Tests for:
    - S1: Daily Scrum page loads and shows project selector
    - S2: With mocked `projectDailySummaries` returning populated user summaries, clicking a user card opens the AI Summary panel with the user's headline, narrative story, accomplishments, and metrics
    - S3: With mocked data containing idle/empty user summary, panel shows the idle status correctly
    - S4: Empty state — when no project summaries exist, shows "Select a teammate" placeholder
- **Framework**: Playwright (existing `playwright.config.ts`, using `mockGraphql` + `setupMockAuth` helpers)
- **Mocking**: Route interception for `DailySummaries`, `ProjectDailySummaries`, `ScrumProjects` GraphQL operations with fixture data
- **Verification**: `pnpm e2e:run -- tests/scrum/ai-summaries.spec.ts` passes

## Test Plan — AC → Test Mapping

| AC | Test | Framework | File |
|----|------|-----------|------|
| AC-1 | `encryptionConsistency.test.ts`: mismatched-secret decryption fails | Vitest (API) | `apps/api/src/__tests__/encryptionConsistency.test.ts` |
| AC-2 | `hierarchicalSummaryService.test.ts`: fetchProjectSummaries returns grouped records | Vitest (API) | `apps/api/src/__tests__/hierarchicalSummaryService.test.ts` |
| AC-3 | `ai-summaries.spec.ts`: S2 — clicking user shows populated AI summary panel | Playwright | `tests/scrum/ai-summaries.spec.ts` |
| AC-4 | `ai-summaries.spec.ts`: S1 — Daily Scrum page loads in local dev | Playwright | `tests/scrum/ai-summaries.spec.ts` |

## Data/Fixtures Needed
- **API tests**: Mock Prisma client (`vi.mock`) with in-memory fixture data for ProjectSummarySnapshot, UserSummarySnapshot, TaskSummarySnapshot
- **Playwright tests**: GraphQL mock handlers returning fixture ProjectDailySummaryRecord with realistic payloads (identity, headline, metrics, narrative, accomplishments)

## Open Questions
- None

## Estimated Impact/Risk: LOW
- Single env var change + container restart for the fix
- Tests are additive (no existing code changes)

## Plan Confidence: 88%

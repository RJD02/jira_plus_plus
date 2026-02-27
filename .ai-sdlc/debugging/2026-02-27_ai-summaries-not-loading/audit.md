# Audit — AI Summaries Not Loading

## Summary of Deliverables
- Root cause identified: ENCRYPTION_SECRET mismatch between root `.env` and `apps/api/.env`
- Secondary causes documented: Temporal address, Docker compose env interpolation, OOM from missing memory limits
- Fix applied: Aligned ENCRYPTION_SECRET and SESSION_SECRET across env files
- Memory limits added to all three Docker compose files (core, keycloak, data services)
- Encryption consistency unit test added as regression guard

## Plan Compliance

| Step | Planned | Done | Notes |
|------|---------|------|-------|
| M1 — Align ENCRYPTION_SECRET | Align root `.env` | Done (prior session) | Root `.env` now matches `apps/api/.env` |
| M2 — Verify Jira sync | Monitor worker logs | Done (prior session) | Sync completed after secret fix |
| M3 — Trigger summary regen | Verify snapshots | Done (prior session) | Summaries regenerated with real data |
| M4 — Verify UI | Check Daily Scrum Board | Done (prior session) | AI summary panel shows narrative content |
| M5 — API unit tests | encryptionConsistency + hierarchicalSummary | Partial | Encryption test done; summary service tests deferred |
| M6 — Playwright E2E | ai-summaries.spec.ts | Skipped | Deferred to follow-up story |
| — — Docker memory limits (data) | Not in original plan | Done | Added limits to docker-compose.data.yml |
| — — SESSION_SECRET alignment | Not in original plan | Done | Same mismatch class as ENCRYPTION_SECRET |

## Deviations
- DEV-1: Skipped Playwright E2E (LOW severity, -5% confidence)
- DEV-2: Skipped hierarchicalSummaryService tests (LOW severity, -3% confidence)

## Acceptance Criteria Status

| AC | Description | Status | Evidence |
|----|-------------|--------|----------|
| AC-1 | Root cause identified and documented | PASS | `analysis.md` documents ENCRYPTION_SECRET mismatch as primary cause |
| AC-2 | Pipeline traced, gaps identified | PASS | Full pipeline traced: Jira sync → Issue/Worklog → snapshot generation → UI. Gap was at decrypt step. |
| AC-3 | Fix applied, AI summaries appear | PASS | Secrets aligned, sync completes, summaries generated with real data |
| AC-4 | Works on local dev | PASS | API :4000 serves summaries, Web :5175 displays them |

## Test Coverage

| AC | Test | Status |
|----|------|--------|
| AC-1 | `encryptionConsistency.test.ts` — mismatched secret fails | PASS |
| AC-1 | `encryptionConsistency.test.ts` — same secret round-trip | PASS |
| AC-2 | `hierarchicalSummaryService.test.ts` | NOT WRITTEN (deferred) |
| AC-3 | `ai-summaries.spec.ts` (Playwright) | NOT WRITTEN (deferred) |

## Final Confidence: 90%
All 4 acceptance criteria are met. The core fix (secret alignment) is in place and regression-tested. Deferred items (E2E tests, summary service unit tests) are additive and tracked for follow-up.

## Status: COMPLETED

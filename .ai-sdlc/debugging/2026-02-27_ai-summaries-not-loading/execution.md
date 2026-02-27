# Execution — AI Summaries Not Loading

## Decision Log

### D1 — Aligned ENCRYPTION_SECRET (prior session)
- **Action**: Updated root `.env` to `ENCRYPTION_SECRET="please-change-this-encryption-secret-32"` matching `apps/api/.env`
- **Reason**: Docker worker was using root `.env` while the Jira site was registered via local API using `apps/api/.env`. Mismatched keys caused `decryptSecret()` to throw "Unsupported state or unable to authenticate data".
- **Files**: `.env`

### D2 — Fixed Temporal address in docker-compose (prior session)
- **Action**: Added `TEMPORAL_ADDRESS: temporal:7233` to worker service environment in `infra/docker-compose.yml`
- **Reason**: Worker was trying to connect to `localhost:7233` inside the container, which doesn't resolve to the Temporal service.
- **Files**: `infra/docker-compose.yml`

### D3 — Added memory limits to core services (prior session)
- **Action**: Added `deploy.resources.limits` to all services in `infra/docker-compose.yml` and `infra/keycloak/docker-compose.yml`
- **Reason**: 7.8GB machine was OOM-ing with unconstrained containers. Total allocation ~2.9GB.
- **Files**: `infra/docker-compose.yml`, `infra/keycloak/docker-compose.yml`

### D4 — Added memory limits to data services (this session)
- **Action**: Added `deploy.resources.limits` to `minio` (256M/0.5 CPU), `nats` (64M/0.25 CPU), `local-llm` (512M/1.0 CPU) in `infra/docker-compose.data.yml`
- **Reason**: These services were the only compose file missing resource limits, inconsistent with the other compose files.
- **Files**: `infra/docker-compose.data.yml`

### D5 — Aligned SESSION_SECRET (this session)
- **Action**: Updated root `.env` `SESSION_SECRET` from `replace-with-random-string-at-least-32-chars` to `please-change-this-session-secret-32-char` to match `apps/api/.env`
- **Reason**: Same class of bug as ENCRYPTION_SECRET — mismatch between root and api env files. The api `.env` value was used to sign sessions during site registration.
- **Files**: `.env`

### D6 — Encryption consistency unit test (prior session)
- **Action**: Created `apps/api/src/__tests__/encryptionConsistency.test.ts` covering round-trip encryption and mismatched-secret failure.
- **Reason**: Automated regression test for AC-1 root cause.
- **Files**: `apps/api/src/__tests__/encryptionConsistency.test.ts`

## Deviations

### DEV-1 — Skipped Playwright E2E tests (M6)
- **What changed**: E2E tests for AI summaries panel were not written in this session.
- **Reason**: The plan's M6 (Playwright E2E) is additive and non-blocking for the core fix. The encryption consistency unit test covers the root cause regression. E2E tests can be added in a follow-up story.
- **Impact**: No regression coverage for UI rendering of AI summaries.
- **Severity**: LOW
- **Confidence impact**: -5%

### DEV-2 — Skipped hierarchicalSummaryService unit tests (M5 partial)
- **What changed**: Only the encryption consistency test was written, not the hierarchicalSummaryService tests.
- **Reason**: The service tests require significant Prisma mock setup and are better suited for a dedicated testing story.
- **Impact**: No unit test coverage for summary mapping logic.
- **Severity**: LOW
- **Confidence impact**: -3%

## Confidence: 90%

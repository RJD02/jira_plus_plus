# Verification — Restore Report Designer

## How to validate

### Prerequisites
- PostgreSQL running at `localhost:5432` with database `jira_plus_plus`
- Keycloak running at `100.83.117.14:8082` with realm `nucleus`
- Test user: `dev-writer` / `password` (ADMIN role)

### 1. Database
```bash
psql postgresql://postgres:postgres@localhost:5432/jira_plus_plus \
  -c 'SELECT id, slug, name FROM "ReportDefinition";'
# Expected: 2 rows (jira-issues-summary, sprint-velocity)
```

### 2. API verification (dev server on port 4050)
```bash
# Start dev API:
cd apps/api && PORT=4050 npx tsx src/index.ts

# Unauthenticated (should fail):
curl -s -X POST http://localhost:4050/graphql \
  -H 'Content-Type: application/json' \
  -d '{"query":"{ reportingDefinitions { id } }"}' | python3 -m json.tool
# Expected: UNAUTHENTICATED error

# Authenticated:
TOKEN=$(curl -s -X POST "http://100.83.117.14:8082/realms/nucleus/protocol/openid-connect/token" \
  -d 'client_id=jira-plus-plus&grant_type=password&username=dev-writer&password=password' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])")

curl -s -X POST http://localhost:4050/graphql \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer ${TOKEN}" \
  -d '{"query":"{ reportingDefinitions { id slug name currentVersion { status } } }"}' | python3 -m json.tool
# Expected: 2 report definitions with PUBLISHED versions
```

### 3. Build verification
```bash
pnpm typecheck   # PASS
pnpm build        # PASS
pnpm lint         # 5 pre-existing errors in AdminConsole.tsx (not related)
```

### 4. Playwright E2E tests
```bash
PLAYWRIGHT_BROWSERS_PATH=.playwright API_URL=http://localhost:4050 \
  dotenv -e .env -- npx playwright test tests/reports/ --reporter=list
# Expected: 4 passed
```

## Test results (2026-02-25)
```
Running 4 tests using 1 worker

  ✓  AC-2: /reports route loads for authenticated user and shows heading (2.1s)
  ✓  AC-4: unauthenticated GraphQL request returns UNAUTHENTICATED (473ms)
  ✓  AC-3: report definitions are listed with name and status (1.9s)
  ✓  AC-3: clicking a report shows table data (1.8s)

  4 passed (8.1s)
```

## Environment variables
- `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/jira_plus_plus`
- `KEYCLOAK_BASE_URL=http://100.83.117.14:8082`
- `VITE_KC_URL=http://100.83.117.14:8082`
- `WEB_URL=http://127.0.0.1:5175`
- `API_URL=http://localhost:4050` (for tests, bypassing production API on 4000)

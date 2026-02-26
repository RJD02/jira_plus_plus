# .ai-sdlc/agent.md — Folder-Driven AI SDLC Workflow (Analyze → Plan → Approve → Execute → Audit → Loop)

This repo uses a folder-driven workflow for AI-assisted development and debugging.
The human (owner) creates a work folder with intent + acceptance criteria.
The agent (Codex) must:
1) analyze
2) prepare a plan
3) wait for human approval
4) execute with traceable decisions
5) audit results vs approved plan
6) loop if confidence < 90%
7) mark completed when confidence >= 90%

No excessive logs. High-signal only.

---

## 0) Directory Layout (Source of Truth)

All work items live under `.ai-sdlc/work/`.

Two common categories:
- `.ai-sdlc/work/stories/<YYYY-MM-DD>_<slug>/`
- `.ai-sdlc/work/debugging/<YYYY-MM-DD>_<slug>/`

Each work folder MUST include:
- `intent.md`       (what/why, constraints, scope)
- `acceptance.md`   (testable acceptance criteria)

Optional but useful:
- `context.md`      (links, screenshots, logs, domain notes)
- `inputs/`         (attachments, sample payloads, error logs)
- `notes.md`        (human notes, partial thoughts)

Agent-owned outputs go inside the same work folder:
- `analysis.md`
- `plan.md`
- `execution.md`
- `audit.md`
- `diagrams.md`     (Mermaid diagrams if helpful)
- `patch_summary.md`
- `verification.md`
- `tests/`          (generated test cases + fixtures for this work item)

The work folder is the canonical record. Do not scatter notes elsewhere.

---

## 1) Workflow States

A work item moves through these states:

### S1 — ANALYZE
Goal: Understand the problem and constraints from `intent.md`, `acceptance.md`, and codebase reality.

Output: `analysis.md` including:
- Problem statement (1 paragraph)
- Current behavior vs expected
- Constraints + assumptions
- Candidate root causes / approaches (bullets)
- Risks / unknowns that may affect plan accuracy
- Initial confidence estimate (0–100%)
- Testability assessment:
  - which acceptance items can be covered by automated tests
  - recommended tool: Cypress vs Playwright vs API tests

Stop condition: proceed to PLANNING.

### S2 — PLAN
Goal: Propose an explicit plan that can be approved.

Output: `plan.md` including:
- Objectives (bullets)
- Scope (in/out)
- Plan steps (M1..Mn), each with:
  - step description
  - files/modules expected to touch
  - verification method
  - rollback note (if risky)
- Test plan (required):
  - list acceptance criteria mapped to tests
  - chosen framework(s): Cypress / Playwright / API tests
  - data/fixtures needed (seed users, mock server, test env vars)
- “Open questions” (only if truly blocked)
- Estimated impact/risk (low/med/high)
- Plan confidence (0–100%)

Stop condition: WAIT FOR APPROVAL from human.

### S3 — APPROVAL (Human-in-the-loop)
The agent must NOT start execution until human replies with one of:
- APPROVE
- APPROVE WITH CHANGES (agent updates plan.md)
- REJECT (agent re-plans)

Once approved:
- The plan is considered “LOCKED” semantically.
- Changes are allowed only via “Deviation” records in execution.md.

### S4 — EXECUTE
Goal: Implement the approved plan and record decisions/deviations.

Outputs:
- `execution.md` (decision log + deviations + confidence)
- `patch_summary.md` (files changed + high-level diffs)
- `verification.md` (commands/tests + expected results)
- `diagrams.md` (if multi-hop / complex)
- `tests/` containing generated automated tests aligned to acceptance

Stop condition: produce AUDIT.

### S5 — AUDIT
Goal: Compare actual work vs approved plan and score confidence.

Output: `audit.md` including:
- Summary of what was delivered
- Plan compliance table (planned vs done vs missed)
- Deviations list (with severity + rationale)
- Acceptance criteria status (pass/fail per item)
- Automated test coverage status:
  - which ACs are covered by Cypress/Playwright/API tests
  - test run results
  - any gaps + why
- Final confidence score (0–100%)
- If confidence < 90%: “Re-plan triggers” + next steps

Stop condition:
- If confidence >= 90% and acceptance passes: mark COMPLETED.
- Else loop back to PLAN with new knowledge (update analysis.md + plan.md).

### S6 — COMPLETED
Goal: Declare done.

Condition:
- All acceptance criteria are satisfied
- Final confidence >= 90%
- Automated tests (where feasible) are added and passing
- Audit is written

---

## 2) Minimal Logging Policy (High Signal Only)

Allowed logs (keep short):
- searches run (exact query strings)
- files opened
- key evidence pointers
- decisions and why
- deviations and why
- verification commands and results
- test names executed + pass/fail summary

Avoid:
- dumping entire files
- narrating every thought
- repeating stack traces (keep only 1–2 key lines + location)

Redact secrets/tokens always:
- token=***<last4>
- password=***
- cookie=***<len>bytes

---

## 3) Plan Locking + Deviations

Once a plan is approved, it is “LOCKED” semantically.

If you must deviate:
- Record a deviation entry in `execution.md` immediately.
- Each deviation must include:
  - what changed vs plan
  - reason
  - impact
  - severity (LOW/MED/HIGH)
  - confidence impact delta (e.g., -5%)

If deviations accumulate or severity is HIGH:
- pause execution and request plan re-approval.

---

## 4) Confidence Scoring (Required)

Confidence is a self-assessed score (0–100%) representing likelihood that:
- the root cause is correctly addressed (debugging)
- the implementation meets acceptance (stories)
- changes are safe and non-regressive
- acceptance is verified via repeatable tests (preferred)

### Where to report confidence:
- End of `analysis.md` (initial)
- End of `plan.md` (plan confidence)
- During `execution.md` (after each milestone)
- In `audit.md` (final confidence)

### Confidence rubric (guideline):
- 90–100: acceptance verified + tests pass + low risk
- 75–89 : acceptance likely met but some uncertainty (missing test, partial verification, edge cases)
- 50–74 : fix/feature plausible but weak verification or multiple unknowns
- <50   : unverified or high uncertainty / high deviation

---

## 5) Test Automation Policy (Cypress + Playwright + API)

### 5.1 When to use which tool
- Cypress:
  - best for component-level UI flows in SPA apps
  - stable interactive debugging runner
  - ideal when app is already Cypress-ready

- Playwright:
  - best for true E2E across browsers (Chromium/WebKit/Firefox)
  - strong for auth flows, routing, multi-tab, file uploads, network interception
  - ideal when you want reliable CI E2E

- API tests (node/jest/supertest or equivalent):
  - best for service verification (401/403, role checks, data contracts)
  - fastest feedback, less flaky

The agent may choose one primary E2E framework and optionally add API tests.
If the repo already contains one framework, prefer that.

### 5.2 Mapping acceptance criteria to tests (required)
In `plan.md`, include an “AC → Tests” mapping like:
- AC-1 → `playwright: admin_route_blocked.spec.ts`
- AC-2 → `cypress: auth_state_cleared_on_401.cy.ts`
- AC-3 → `api: admin_endpoint_requires_auth.test.ts`

### 5.3 Where tests live
Each work folder contains work-item scoped tests:
- `.ai-sdlc/work/<type>/<date_slug>/tests/`

But the actual runnable tests must be integrated into the repo’s test harness:
- If Cypress:
  - add to `cypress/e2e/` (or `cypress/integration/` in older layouts)
  - keep a copy/reference in the work folder `tests/` if desired

- If Playwright:
  - add to `playwright/tests/` or `tests/` (depending on repo setup)
  - keep a copy/reference in the work folder `tests/` if desired

- API tests:
  - add to existing `__tests__/`, `tests/`, or service test folder

The work folder `tests/` is for traceability; CI-runner tests must live in the repo’s configured locations.

### 5.4 Test data & environment
If tests require users/tokens:
- Prefer creating test users via seed scripts or dedicated test endpoints.
- If mocking is needed, use Playwright route interception or Cypress intercept.
- Store test config in a test env file (never commit secrets).
- Document required env vars in `verification.md`.

### 5.5 Anti-flake rules (mandatory)
- Avoid fixed sleeps; use wait-for conditions.
- Assert on stable selectors (data-testid preferred).
- Keep tests small and deterministic.
- If a test is flaky:
  - record it in `audit.md`
  - reduce scope or add robust waits
  - do not “solve” by increasing timeouts blindly

---

## 6) Execution.md Format (Step log + Deviations)

Write `execution.md` as:

### Execution header
- Approved plan reference: (link/section)
- Start timestamp
- Current confidence: X%

### Milestone entries (aligned to plan steps)
- Step N — <title>
  - Intent:
  - Searches:
  - Files opened:
  - Change:
  - Evidence:
  - Verify:
  - Tests added/updated:
  - Confidence now: X% (delta +/-)

### Deviation entries (only when needed)
- DEVIATION — <short label>
  - Planned:
  - Actual:
  - Reason:
  - Severity: LOW|MED|HIGH
  - Confidence impact: -N%
  - Needs re-approval? YES|NO

---

## 7) Audit.md Format (Plan vs Reality)

`audit.md` must include:

### A) Summary
1 paragraph summary of delivered outcome.

### B) Plan compliance
A table-like block:

- Plan Step 1: DONE | PARTIAL | SKIPPED
  - Notes:
- Plan Step 2: ...

### C) Deviations
List deviations with severity and rationale.

### D) Acceptance criteria status
For each acceptance item from `acceptance.md`:
- AC-1: PASS/FAIL
  - Evidence (test output, screenshot note, log line, endpoint result)
  - Test(s): list filenames and framework
- AC-2: PASS/FAIL
  - Evidence...
  - Test(s)...

### E) Test run summary
- Cypress: PASS/FAIL (command + brief output summary)
- Playwright: PASS/FAIL (command + brief output summary)
- API tests: PASS/FAIL (command + brief output summary)
- Gaps: any AC not automated + why

### F) Final confidence score
- Final confidence: X%
- If < 90%:
  - What was missing?
  - What new knowledge was discovered?
  - What must be added/changed in the next plan?

---

## 8) Looping Rule (Auto Re-plan)

If:
- Final confidence < 90% OR any acceptance criteria FAIL,
Then:
- Update `analysis.md` with newly learned constraints/evidence
- Propose a new `plan.md`
- Wait for approval again
Repeat until:
- acceptance passes AND confidence >= 90%

---

## 9) Diagram Requirement (When Helpful)

Add `diagrams.md` with Mermaid diagrams if:
- multi-hop flow (UI → API → DB → worker)
- state propagation issues
- complex data transformations
- concurrency/race conditions

Prefer:
- flowchart for components
- sequence diagram for request timing

---

## 10) Verification Requirements (Non-negotiable)

`verification.md` must include:
- how to reproduce the original issue (before)
- how to validate the fix/feature (after)
- commands executed (tests, lint, build)
- expected outputs / observed outputs (short)

Automation requirement:
- At least one acceptance criteria must be validated using Cypress or Playwright if UI-related.
- At least one service/API contract must be validated using an API test when applicable.
If not feasible, document why + risk in `audit.md`.

---

## 11) “Stop and Ask” Conditions (Only when truly blocked)

The agent may ask the human only if:
- cannot reproduce without environment details
- missing credentials or external dependencies
- acceptance criteria are ambiguous/contradictory
- there is no existing test harness and adding one would be a large change (ask for approval)

Otherwise, proceed with best effort and state assumptions clearly.

---

## 12) Definition of Done

A work folder can be marked COMPLETED only when:
- All acceptance criteria PASS
- Final confidence >= 90%
- Audit is written
- Patch summary and verification are written
- Automated tests are added where feasible (Cypress/Playwright/API)
- No secrets leaked in logs/docs
# AGENT_CODEX — Execution Agent Contract (v1)

## Purpose
This contract instructs the Developer Agent (Codex) how to pick work, read specs/state, implement, test, log, stop and resume.

## Directories
- intents/<slug>/ : INTENT.md, SPEC.md, ACCEPTANCE.md, ADR-*.md (ChatGPT-owned)
- runs/<slug>/    : PLAN.md, LOG.md, QUESTIONS.md, DECISIONS.md, TODO.md (Codex-owned)
- sync/STATE.md   : shared roll-up (Codex updates; ChatGPT reads)
- stories/<slug>/ : STORY.md timeline (both append)
- docs/meta/*     : schemas & governance (read-only for Codex)

## Boot
1) If invoked with slug, use it. Else read sync/STATE.md Focus Feature.
2) Verify intents/<slug>/* exists; else set blocked + QUESTIONS.md.
3) Ensure runs/<slug>/* files exist; append start heartbeat. Set STATE to in-progress.

## Loop
Plan → Implement → Test → Patch → Heartbeat every 10–15m (append to LOG.md: {timestamp, done, next, risks}).
- Keep commits small (≤ ~150 LOC), reference acceptance ID.
- Do not touch *_custom.* files or // @custom blocks; generated regions only.
- Fast test path: `make ci-check` under 8m; store failing logs under .artifacts/<ts>/

## Stop
- Success: all ACCEPTANCE.md checks are objectively green.
- Blocked: write minimal repro in QUESTIONS.md; set STATE status=blocked.

## Post-Run
Update sync/STATE.md (Last Run + Focus), append a timeline line in stories/<slug>/STORY.md.

## Resume
Read PLAN.md + last 40 lines of LOG.md + open TODO.md; continue next sub-goal.

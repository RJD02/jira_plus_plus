# Codex Start Prompt — {{slug}} (canonical)

Load role from docs/meta/AGENT_CODEX.md.

Feature slug: {{slug}}

Read these files now:
- intents/{{slug}}/INTENT.md
- intents/{{slug}}/SPEC.md
- intents/{{slug}}/ACCEPTANCE.md
- docs/meta/AGENT_CODEX.md
- runs/{{slug}}/RUNCARD.md  # treat as the run’s authoritative checklist
- runs/{{slug}}/{PLAN.md,LOG.md,QUESTIONS.md,DECISIONS.md,TODO.md}  # create if missing

Execute per AGENT_CODEX loop and RUNCARD tasks.

Start by:
1) Updating runs/{{slug}}/PLAN.md with the first 3–5 sub-goals.
2) Appending a heartbeat to runs/{{slug}}/LOG.md: {timestamp, done, next, risks}.
3) Running the fast path (`make ci-check`). If absent, scaffold minimally to satisfy ACCEPTANCE.md.

Loop: Plan → Implement → Test → Patch → Heartbeat (every 10–15 min; ≤ ~150 LOC/commit; reference AC#).

Stop when:
- All items in intents/{{slug}}/ACCEPTANCE.md are objectively green; or
- You wrote a minimal repro to runs/{{slug}}/QUESTIONS.md and set sync/STATE.md status=blocked.

Post-run:
- Update sync/STATE.md (Last Run + Focus).
- Append a timeline line to stories/{{slug}}/STORY.md.

Guardrails:
- Do not modify *_custom.* or // @custom blocks.
- Prefer *_gen.* or // @generated blocks.
- Keep `make ci-check` < 8 minutes.
- Fail-closed on ambiguity.

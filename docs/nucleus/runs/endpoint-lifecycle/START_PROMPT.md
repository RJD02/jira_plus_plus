# Codex Start Prompt — endpoint-lifecycle (canonical)

Load role from docs/meta/AGENT_CODEX.md.

Feature slug: endpoint-lifecycle

Read these files now:
- intents/endpoint-lifecycle/INTENT.md
- intents/endpoint-lifecycle/SPEC.md
- intents/endpoint-lifecycle/ACCEPTANCE.md
- docs/meta/AGENT_CODEX.md
- runs/endpoint-lifecycle/RUNCARD.md  # treat as the run’s authoritative checklist
- runs/endpoint-lifecycle/{PLAN.md,LOG.md,QUESTIONS.md,DECISIONS.md,TODO.md}  # create if missing

Execute per AGENT_CODEX loop and RUNCARD tasks.

Start by:
1) Updating runs/endpoint-lifecycle/PLAN.md with the first 3–5 sub-goals.
2) Appending a heartbeat to runs/endpoint-lifecycle/LOG.md: {timestamp, done, next, risks}.
3) Running the fast path (`make ci-check`). If absent, scaffold minimally to satisfy ACCEPTANCE.md.

Loop: Plan → Implement → Test → Patch → Heartbeat (every 10–15 min; ≤ ~150 LOC/commit; reference AC#).

Stop when:
- All items in intents/endpoint-lifecycle/ACCEPTANCE.md are objectively green; or
- You wrote a minimal repro to runs/endpoint-lifecycle/QUESTIONS.md and set sync/STATE.md status=blocked.

Post-run:
- Update sync/STATE.md (Last Run + Focus).
- Append a timeline line to stories/endpoint-lifecycle/STORY.md.

Guardrails:
- Do not modify *_custom.* or // @custom blocks.
- Prefer *_gen.* or // @generated blocks.
- Keep `make ci-check` < 8 minutes.
- Fail-closed on ambiguity.

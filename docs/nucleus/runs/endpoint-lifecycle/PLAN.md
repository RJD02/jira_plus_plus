1. Verify datasets tab + detail drawer render real `endpointDatasets` responses (AC7) and capture evidence (screens/logs) while confirming secrets remain masked (AC8).
2. Exercise trigger/run chips + capability gating (AC3–AC6) via UI/manual probes; log any deviations in DECISIONS/TODO before adjusting code/tests.
3. Expand Playwright automation (metadata-auth spec) or supporting helpers to cover datasets tab + trigger chip assertions, keeping suite under ci budget (AC1–AC7).
4. Run `make ci-check` and inspect perf/contract outputs to ensure AC9–AC10 remain green; iterate on regressions immediately.
5. Update run artifacts (LOG heartbeat, TODO, QUESTIONS, DECISIONS) and sync/STATE/STORY with latest status once criteria verified.

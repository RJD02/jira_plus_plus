import { proxyActivities } from "@temporalio/workflow";
import type * as narrativeActivities from "../activities/narrativeActivities.js";

export const NARRATIVE_WORKFLOW_NAME = "refreshNarrativesWorkflow";

const { processNarrativeQueue } = proxyActivities<typeof narrativeActivities>({
  startToCloseTimeout: "10 minute",
  retry: {
    maximumAttempts: 3,
  },
});

export interface RefreshNarrativesInput {
  projectId?: string | null;
  batchSize?: number;
  iterations?: number;
  persona?: string;
  force?: boolean;
}

export async function refreshNarrativesWorkflow(
  input: RefreshNarrativesInput = {},
): Promise<void> {
  const batchSize = input.batchSize ?? 10;
  const maxIterations = input.iterations ?? 5;

  for (let index = 0; index < maxIterations; index += 1) {
    const result = await processNarrativeQueue({
      projectId: input.projectId ?? null,
      limit: batchSize,
      persona: input.persona,
      force: input.force,
    });

    if (result.processed === 0 || (result.remainingProject === 0 && result.remainingUser === 0)) {
      break;
    }
  }
}

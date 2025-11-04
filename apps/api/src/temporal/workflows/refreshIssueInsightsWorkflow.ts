import { proxyActivities } from "@temporalio/workflow";
import type * as insightActivities from "../activities/insightActivities.js";

export const INSIGHT_WORKFLOW_NAME = "refreshIssueInsightsWorkflow";

const { processInsightQueue } = proxyActivities<typeof insightActivities>({
  startToCloseTimeout: "10 minute",
  retry: {
    maximumAttempts: 3,
  },
});

export interface RefreshIssueInsightsInput {
  projectId?: string | null;
  batchSize?: number;
  iterations?: number;
}

export async function refreshIssueInsightsWorkflow(
  input: RefreshIssueInsightsInput = {},
): Promise<void> {
  const batchSize = input.batchSize ?? 10;
  const maxIterations = input.iterations ?? 5;

  for (let index = 0; index < maxIterations; index += 1) {
    const result = await processInsightQueue({
      projectId: input.projectId ?? null,
      limit: batchSize,
    });

    if (result.processed === 0 || result.remaining === 0) {
      break;
    }
  }
}

import { proxyActivities } from "@temporalio/workflow";
import type * as summaryActivities from "../activities/summaryAutomationActivities.js";

export const PROJECT_SUMMARY_AUTOMATION_WORKFLOW_NAME = "projectSummaryAutomationWorkflow";

const { runProjectSummaryAutomationActivity } = proxyActivities<typeof summaryActivities>({
  startToCloseTimeout: "10 minute",
  retry: {
    maximumAttempts: 3,
  },
});

export interface ProjectSummaryAutomationInput {
  batchSize?: number;
  iterations?: number;
  lockSeconds?: number;
  ensureProjects?: boolean;
}

export async function projectSummaryAutomationWorkflow(
  input: ProjectSummaryAutomationInput = {},
): Promise<void> {
  const batchSize = Math.max(1, input.batchSize ?? 5);
  const iterations = Math.max(1, input.iterations ?? 5);

  for (let index = 0; index < iterations; index += 1) {
    const result = await runProjectSummaryAutomationActivity({
      limit: batchSize,
      lockSeconds: input.lockSeconds,
      ensureProjects: input.ensureProjects,
    });

    if (result.processed === 0 || result.remaining === 0) {
      break;
    }
  }
}

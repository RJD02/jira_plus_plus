import { proxyActivities } from "@temporalio/workflow";

const { runSkill } = proxyActivities({
  startToCloseTimeout: "5 minutes",
  retry: {
    maximumAttempts: 3,
    initialInterval: "2s",
    maximumInterval: "30s",
    backoffCoefficient: 2,
    nonRetryableErrorTypes: ["SkillExecutionFailed", "SkillProviderUnavailable"],
  },
});

export async function BaseLLMWorkflow(input) {
  const activityOptions = input.activityTimeoutMs
    ? { startToCloseTimeout: `${Math.ceil(input.activityTimeoutMs / 1000)}s` }
    : undefined;
  if (activityOptions) {
    return runSkill.with(activityOptions)(input);
  }
  return runSkill(input);
}

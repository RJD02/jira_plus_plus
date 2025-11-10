import type {
  AgentConversationConfig,
  AgentPromptInput,
  AgentSuggestion,
  ReportExecutionInput,
  ReportExecutionResult,
} from "@reporting/temporal";
import { condition, defineSignal, proxyActivities, setHandler, workflowInfo } from "@temporalio/workflow";
import type { ReportingActivities } from "./activities.js";

const {
  markRunStarted,
  markRunCompleted,
  executeReport,
  ensureAgentReflection,
  appendAgentMessage,
  generateAgentSuggestions,
} = proxyActivities<ReportingActivities>({
  startToCloseTimeout: "5 minutes",
});

const promptSignal = defineSignal<[AgentPromptInput]>("agent.addPrompt");

export async function agentDesignWorkflow(config: AgentConversationConfig): Promise<void> {
  const reflection = await ensureAgentReflection({
    reflectionId: config.reflectionId,
    tenantId: config.tenantId,
    userId: null,
    persona: config.persona ?? null,
  });

  const processPrompt = async (input: AgentPromptInput) => {
    await appendAgentMessage({
      reflectionId: reflection.reflectionId,
      role: "user",
      content: input.prompt,
    });

    const suggestions = await generateAgentSuggestions({
      tenantId: input.tenantId,
      prompt: input.prompt,
      persona: input.persona ?? null,
      datasetIds: input.datasetIds,
      reflectionId: reflection.reflectionId,
    });

    await appendAgentMessage({
      reflectionId: reflection.reflectionId,
      role: "assistant",
      content: summariseSuggestionsForLog(suggestions, input.persona ?? null),
      suggestions,
    });
  };

  setHandler(promptSignal, async (payload) => {
    await processPrompt(payload);
  });

  await condition(() => false);
}

function summariseSuggestionsForLog(suggestions: AgentSuggestion[], persona: string | null): string {
  if (!suggestions.length) {
    return "No viable suggestions were generated.";
  }
  const personaLabel = persona ? persona.toUpperCase() : "persona";
  const summaryLines = suggestions.slice(0, 3).map((suggestion) => `• ${suggestion.title}: ${suggestion.summary}`);
  return [`Recommendations for ${personaLabel}:`, ...summaryLines].join("\n");
}

export async function reportExecutionWorkflow(
  input: ReportExecutionInput,
): Promise<ReportExecutionResult> {
  const info = workflowInfo();
  const startedAt = Date.now();

  await markRunStarted({
    runId: input.runId,
    workflowId: info.workflowId,
    temporalRunId: info.runId,
    startedAt: new Date(startedAt).toISOString(),
  });

  try {
    const execution = await executeReport({
      runId: input.runId,
      tenantId: input.tenantId,
      reportVersionId: input.reportVersionId,
      filters: input.filters,
    });

    await markRunCompleted({
      runId: input.runId,
      status: execution.status,
      durationMs: execution.durationMs,
      error: execution.error,
      payload: execution.payload ?? null,
    });

    return {
      runId: input.runId,
      payloadLocation: execution.payloadLocation,
    };
  } catch (error) {
    await markRunCompleted({
      runId: input.runId,
      status: "FAILED",
      durationMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error),
      payload: null,
    });
    throw error;
  }
}

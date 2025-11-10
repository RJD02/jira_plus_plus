export interface AgentSuggestion {
  id: string;
  title: string;
  summary: string;
  query: string;
  filters?: Record<string, unknown>;
  datasetId?: string | null;
  persona?: string | null;
}

export interface AgentMessageRecord {
  id: string;
  role: "user" | "assistant";
  content: string;
  suggestions?: AgentSuggestion[] | null;
  createdAt: string;
}

export interface AgentConversationConfig {
  tenantId: string;
  reflectionId: string;
  persona?: string | null;
}

export interface AgentPromptInput {
  tenantId: string;
  userId?: string | null;
  prompt: string;
  persona?: string | null;
  datasetIds?: string[];
  reflectionId: string;
}

export interface AgentDesignResult {
  reflectionId: string;
  suggestions: AgentSuggestion[];
}

export interface ReportExecutionInput {
  runId: string;
  reportVersionId: string;
  tenantId: string;
  filters: Record<string, unknown>;
}

export interface ReportExecutionResult {
  runId: string;
  payloadLocation: string;
}

export const WORKFLOW_NAMES = {
  agentDesign: "agentDesignWorkflow",
  reportExecution: "reportExecutionWorkflow",
} as const;

export interface MarkRunStartedInput {
  runId: string;
  workflowId: string;
  temporalRunId: string;
  startedAt: string;
}

export interface MarkRunCompletedInput {
  runId: string;
  status: "COMPLETED" | "FAILED";
  durationMs: number;
  error?: string | null;
  payload?: Record<string, unknown> | null;
}

export type TemporalWorkflowNames = typeof WORKFLOW_NAMES[keyof typeof WORKFLOW_NAMES];

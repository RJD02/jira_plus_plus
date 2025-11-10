import { prisma } from "../prisma.js";
import { getCatalogProvider } from "../catalog.js";
import type { AgentMessageRecord, AgentSuggestion, MarkRunCompletedInput, MarkRunStartedInput } from "@reporting/temporal";
import { NoopSandboxRunner } from "@reporting/sandbox";
import { buildHeuristicSuggestions } from "../services/agentDesigner.js";
import { generateAgentSuggestionsWithLLM } from "../services/agentLLM.js";
import { buildPreviewPayload, coerceJsonObject } from "../services/reportPreview.js";
import { Prisma } from "../generated/client/index.js";

export interface ReportingActivities {
  markRunStarted(input: MarkRunStartedInput): Promise<void>;
  markRunCompleted(input: MarkRunCompletedInput): Promise<void>;
  executeReport(input: ExecuteReportActivityInput): Promise<ExecuteReportActivityResult>;
  ensureAgentReflection(input: EnsureAgentReflectionInput): Promise<EnsureAgentReflectionResult>;
  appendAgentMessage(input: AppendAgentMessageInput): Promise<void>;
  loadAgentConversation(input: LoadAgentConversationInput): Promise<AgentMessageRecord[]>;
  generateAgentSuggestions(input: GenerateAgentSuggestionsInput): Promise<AgentSuggestion[]>;
}

export interface ExecuteReportActivityInput {
  runId: string;
  reportVersionId: string;
  tenantId: string;
  filters: Record<string, unknown>;
}

export interface ExecuteReportActivityResult {
  status: "COMPLETED" | "FAILED";
  durationMs: number;
  payloadLocation: string;
  error?: string | null;
  payload?: Record<string, unknown> | null;
}

export interface EnsureAgentReflectionInput {
  reflectionId?: string | null;
  tenantId: string;
  userId?: string | null;
  persona?: string | null;
}

export interface EnsureAgentReflectionResult {
  reflectionId: string;
}

export interface AppendAgentMessageInput {
  reflectionId: string;
  role: "user" | "assistant";
  content: string;
  suggestions?: AgentSuggestion[] | null;
}

export interface LoadAgentConversationInput {
  reflectionId: string;
  limit?: number;
}

export interface GenerateAgentSuggestionsInput {
  tenantId: string;
  prompt: string;
  persona?: string | null;
  datasetIds?: string[];
  reflectionId: string;
}

export const activities: ReportingActivities = {
  async markRunStarted({ runId, workflowId, temporalRunId, startedAt }) {
    await prisma.reportRun.updateMany({
      where: { id: runId },
      data: {
        status: "IN_PROGRESS",
        workflowId,
        temporalRunId,
        executedAt: startedAt ? new Date(startedAt) : new Date(),
      },
    });
  },

  async markRunCompleted({ runId, status, durationMs, error, payload }) {
    const updateData: Prisma.ReportRunUpdateManyMutationInput = {
      status,
      durationMs,
      error: error ?? null,
    };
    if (payload !== undefined) {
      updateData.payload = payload
        ? (payload as Prisma.InputJsonValue)
        : Prisma.JsonNull;
    }
    await prisma.reportRun.updateMany({
      where: { id: runId },
      data: updateData,
    });
  },

  async executeReport({ runId, reportVersionId, tenantId, filters }) {
    const version = await prisma.reportVersion.findFirst({
      where: { id: reportVersionId, tenantId },
      include: {
        definition: true,
      },
    });

    if (!version || !version.definition) {
      return {
        status: "FAILED" as const,
        durationMs: 0,
        payloadLocation: `inline://report-run/${runId}`,
        error: "Report version not found or inaccessible for tenant.",
      };
    }

    const sandbox = new NoopSandboxRunner();
    const startedAt = Date.now();
    const defaultFiltersObject = coerceJsonObject(version.defaultFilters);
    const mergedFilters = {
      ...defaultFiltersObject,
      ...(filters ?? {}),
    };

    try {
      await sandbox.execute({
        moduleId: version.definition.slug ?? version.definitionId,
        input: {
          runId,
          reportVersionId,
          queryTemplate: version.queryTemplate ?? "",
          filters: mergedFilters,
        },
      });

      const durationMs = Date.now() - startedAt;
      const payload = await buildPreviewPayload({
        runId,
        tenantId,
        definitionName: version.definition.name,
        definitionSlug: version.definition.slug ?? version.definitionId,
        queryTemplate: version.queryTemplate ?? null,
        defaultFilters: version.defaultFilters,
        filters: mergedFilters,
      });
      return {
        status: "COMPLETED" as const,
        durationMs,
        payloadLocation: `inline://report-run/${runId}`,
        payload,
      };
    } catch (error) {
      const durationMs = Date.now() - startedAt;
      const payload = await buildPreviewPayload({
        runId,
        tenantId,
        definitionName: version.definition.name,
        definitionSlug: version.definition.slug ?? version.definitionId,
        queryTemplate: version.queryTemplate ?? null,
        defaultFilters: version.defaultFilters,
        filters: mergedFilters,
      });
      return {
        status: "FAILED" as const,
        durationMs,
        payloadLocation: `inline://report-run/${runId}`,
        error: error instanceof Error ? error.message : String(error),
        payload,
      };
    }
  },

  async ensureAgentReflection({ reflectionId, tenantId, userId, persona }) {
    if (reflectionId) {
      const existing = await prisma.agentReflection.findFirst({
        where: { id: reflectionId, tenantId },
      });
      if (!existing) {
        throw new Error(`Agent reflection ${reflectionId} not found for tenant ${tenantId}`);
      }
      if (!existing.persona && persona) {
        await prisma.agentReflection.update({
          where: { id: reflectionId },
          data: { persona },
        });
      }
      return { reflectionId };
    }

    const created = await prisma.agentReflection.create({
      data: {
        tenantId,
        userId: userId ?? undefined,
        persona: persona ?? undefined,
      },
      select: { id: true },
    });
    return { reflectionId: created.id };
  },

  async appendAgentMessage({ reflectionId, role, content, suggestions }) {
    await prisma.agentMessage.create({
      data: {
        reflectionId,
        role,
        content,
        suggestions:
          suggestions && suggestions.length
            ? (suggestions as unknown as Prisma.InputJsonValue)
            : undefined,
      },
    });
  },

  async loadAgentConversation({ reflectionId, limit = 20 }) {
    const records = await prisma.agentMessage.findMany({
      where: { reflectionId },
      orderBy: { createdAt: "asc" },
      take: limit,
    });

    return records.map(
      (record) =>
        ({
          id: record.id,
          role: record.role === "assistant" ? "assistant" : "user",
          content: record.content,
          suggestions: (record.suggestions ?? null) as AgentSuggestion[] | null,
          createdAt: record.createdAt.toISOString(),
        }) satisfies AgentMessageRecord,
    );
  },

  async generateAgentSuggestions({ tenantId, prompt, persona, datasetIds, reflectionId }) {
    const catalog = getCatalogProvider();
    const datasets =
      datasetIds && datasetIds.length > 0
        ? (
            await Promise.all(
              datasetIds.map(async (datasetId) => catalog.getDataset(datasetId)),
            )
          ).filter((dataset): dataset is NonNullable<typeof dataset> => Boolean(dataset))
        : await catalog.listDatasets();

    const conversationRecords = await prisma.agentMessage.findMany({
      where: { reflectionId },
      orderBy: { createdAt: "asc" },
      take: 20,
    });
    const conversation = conversationRecords.map(
      (record) =>
        ({
          id: record.id,
          role: record.role === "assistant" ? "assistant" : "user",
          content: record.content,
          suggestions: (record.suggestions ?? null) as AgentSuggestion[] | null,
          createdAt: record.createdAt.toISOString(),
        }) satisfies AgentMessageRecord,
    );

    const llmSuggestions = await generateAgentSuggestionsWithLLM({
      tenantId,
      prompt,
      persona,
      datasets,
      conversation,
    });

    if (llmSuggestions && llmSuggestions.length) {
      return llmSuggestions;
    }

    return buildHeuristicSuggestions({ prompt, persona, datasets });
  },
};

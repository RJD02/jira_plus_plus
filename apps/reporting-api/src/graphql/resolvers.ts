import { DateTimeResolver, JSONResolver } from "graphql-scalars";
import { createHash } from "node:crypto";
import { Prisma } from "../generated/client/index.js";
import type { Context } from "../types.js";
import { NoopSandboxRunner } from "@reporting/sandbox";
import { WORKFLOW_NAMES } from "@reporting/temporal";
import { getTemporalClient } from "../temporal/client.js";
import { buildPreviewPayload, coerceJsonObject } from "../services/reportPreview.js";
import { buildHeuristicSuggestions } from "../services/agentDesigner.js";

const AGENT_SIGNAL_NAME = "agent.addPrompt";
const ASSISTANT_POLL_INTERVAL_MS = 500;
const ASSISTANT_WAIT_TIMEOUT_MS = 20000;

function toSlug(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export const resolvers = {
  DateTime: DateTimeResolver,
  JSON: JSONResolver,
  Query: {
    health: () => ({
      status: "ok",
      version: "0.1.0",
    }),
    reportDefinitions: async (_parent: unknown, _args: unknown, ctx: Context) => {
      const records = await ctx.prisma.reportDefinition.findMany({
        where: { tenantId: ctx.tenantId },
        include: {
          currentVersion: true,
          versions: {
            where: { tenantId: ctx.tenantId },
            orderBy: { createdAt: "desc" },
          },
        },
        orderBy: { createdAt: "desc" },
      });
      return records;
    },
    reportDefinition: async (
      _parent: unknown,
      args: { id: string },
      ctx: Context,
    ) => {
      return ctx.prisma.reportDefinition.findFirst({
        where: { id: args.id, tenantId: ctx.tenantId },
        include: {
          currentVersion: true,
          versions: {
            where: { tenantId: ctx.tenantId },
            orderBy: { createdAt: "desc" },
          },
        },
      });
    },
    reportDefinitionBySlug: async (
      _parent: unknown,
      args: { slug: string },
      ctx: Context,
    ) => {
      return ctx.prisma.reportDefinition.findFirst({
        where: { slug: args.slug, tenantId: ctx.tenantId },
        include: {
          currentVersion: true,
          versions: {
            where: { tenantId: ctx.tenantId },
            orderBy: { createdAt: "desc" },
          },
        },
      });
    },
    reportVersions: async (
      _parent: unknown,
      args: { definitionId: string },
      ctx: Context,
    ) => {
      return ctx.prisma.reportVersion.findMany({
        where: { definitionId: args.definitionId, tenantId: ctx.tenantId },
        orderBy: { createdAt: "desc" },
      });
    },
    reportDashboards: async (_parent: unknown, _args: unknown, ctx: Context) => {
      return ctx.prisma.reportDashboard.findMany({
        where: { tenantId: ctx.tenantId },
        include: {
          currentVersion: {
            include: { tiles: true },
          },
          versions: {
            where: { tenantId: ctx.tenantId },
            include: { tiles: true },
            orderBy: { createdAt: "desc" },
          },
        },
        orderBy: { createdAt: "desc" },
      });
    },
    reportDashboard: async (
      _parent: unknown,
      args: { id: string },
      ctx: Context,
    ) => {
      return ctx.prisma.reportDashboard.findFirst({
        where: { id: args.id, tenantId: ctx.tenantId },
        include: {
          currentVersion: { include: { tiles: true } },
          versions: {
            where: { tenantId: ctx.tenantId },
            include: { tiles: true },
            orderBy: { createdAt: "desc" },
          },
        },
      });
    },
    dashboardVersion: async (
      _parent: unknown,
      args: { id: string },
      ctx: Context,
    ) => {
      return ctx.prisma.dashboardVersion.findFirst({
        where: { id: args.id, tenantId: ctx.tenantId },
        include: { tiles: true },
      });
    },
    reportRuns: async (
      _parent: unknown,
      args: { filter?: { status?: string | null; reportVersionId?: string | null } },
      ctx: Context,
    ) => {
      const where: Prisma.ReportRunWhereInput = { tenantId: ctx.tenantId };
      if (args.filter?.status) {
        where.status = args.filter.status;
      }
      if (args.filter?.reportVersionId) {
        where.reportVersionId = args.filter.reportVersionId;
      }
      return ctx.prisma.reportRun.findMany({
        where,
        orderBy: { executedAt: "desc" },
      });
    },
    catalogDatasets: async (_parent: unknown, _args: unknown, ctx: Context) => {
      return ctx.catalog.listDatasets();
    },
    catalogDataset: async (_parent: unknown, args: { id: string }, ctx: Context) => {
      return ctx.catalog.getDataset(args.id);
    },
    agentConversations: async (_parent: unknown, _args: unknown, ctx: Context) => {
      return ctx.prisma.agentReflection.findMany({
        where: { tenantId: ctx.tenantId },
        orderBy: { updatedAt: "desc" },
      });
    },
    agentConversation: async (_parent: unknown, args: { id: string }, ctx: Context) => {
      const conversation = await ctx.prisma.agentReflection.findFirst({
        where: { id: args.id, tenantId: ctx.tenantId },
      });
      if (!conversation) {
        return null;
      }
      const messages = await ctx.prisma.agentMessage.findMany({
        where: { reflectionId: conversation.id },
        orderBy: { createdAt: "asc" },
      });
      return {
        conversation,
        messages,
      };
    },
  },
  ReportDefinition: {
    personaTags: (parent: { personaTags: string[] | null }) => parent.personaTags ?? [],
    currentVersion: (parent: { currentVersion: unknown | null }) => parent.currentVersion ?? null,
    versions: (parent: { versions?: unknown[] | null }, _args: unknown, ctx: Context) => {
      if (Array.isArray(parent.versions)) {
        return parent.versions;
      }
      return ctx.prisma.reportVersion.findMany({
        where: { definitionId: (parent as { id: string }).id, tenantId: ctx.tenantId },
        orderBy: { createdAt: "desc" },
      });
    },
  },
  ReportVersion: {
    defaultFilters: (parent: { defaultFilters: Prisma.JsonValue | null }) =>
      (parent.defaultFilters as Prisma.JsonValue | null) ?? null,
    tenantId: (parent: { tenantId: string }) => parent.tenantId,
  },
  ReportDashboard: {
    personaTags: (parent: { personaTags: string[] | null }) => parent.personaTags ?? [],
    currentVersion: (parent: { currentVersion: unknown | null }) => parent.currentVersion ?? null,
    versions: (parent: { versions?: unknown[] | null }, _args: unknown, ctx: Context) => {
      if (Array.isArray(parent.versions)) {
        return parent.versions;
      }
      return ctx.prisma.dashboardVersion.findMany({
        where: { dashboardId: (parent as { id: string }).id, tenantId: ctx.tenantId },
        include: { tiles: true },
        orderBy: { createdAt: "desc" },
      });
    },
  },
  DashboardVersion: {
    tiles: (parent: { tiles?: unknown[] | null }, _args: unknown, ctx: Context) => {
      if (Array.isArray(parent.tiles)) {
        return parent.tiles;
      }
      return ctx.prisma.dashboardTile.findMany({
        where: { dashboardVersionId: (parent as { id: string }).id, tenantId: ctx.tenantId },
      });
    },
  },
  ReportRun: {
    filtersUsed: (parent: { filtersUsed: Prisma.JsonValue | null }) =>
      (parent.filtersUsed as Prisma.JsonValue | null) ?? null,
    payload: (parent: { payload: Prisma.JsonValue | null }) =>
      (parent.payload as Prisma.JsonValue | null) ?? null,
  },
  AgentConversation: {
    lastMessageAt: async (parent: { id: string }, _args: unknown, ctx: Context) => {
      const message = await ctx.prisma.agentMessage.findFirst({
        where: { reflectionId: parent.id },
        orderBy: { createdAt: "desc" },
      });
      return message?.createdAt ?? null;
    },
  },
  AgentMessage: {
    suggestions: (parent: { suggestions: Prisma.JsonValue | null }) => {
      if (!parent.suggestions) {
        return [];
      }
      if (Array.isArray(parent.suggestions)) {
        return parent.suggestions as Array<Record<string, unknown>>;
      }
      return [];
    },
  },
  CatalogDataset: {
    fields: (parent: { fields?: Array<unknown> | null }) =>
      Array.isArray(parent.fields) ? parent.fields : [],
  },
  Mutation: {
    createReportDefinition: async (
      _parent: unknown,
      args: {
        input: {
          slug?: string | null;
          name: string;
          description?: string | null;
          type?: string | null;
          personaTags?: string[] | null;
          scopePolicy?: Prisma.InputJsonValue | null;
          filterSchema?: Prisma.InputJsonValue | null;
          visualisationConfig?: Prisma.InputJsonValue | null;
        };
      },
      ctx: Context,
    ) => {
      const slugCandidate = args.input.slug?.trim() || toSlug(args.input.name);
      if (!slugCandidate) {
        throw new Error("Unable to derive slug for report definition");
      }

      const personaTags = args.input.personaTags?.filter(Boolean) ?? [];

      const definition = await ctx.prisma.reportDefinition.create({
        data: {
          tenantId: ctx.tenantId,
          slug: slugCandidate,
          name: args.input.name,
          description: args.input.description,
          type: args.input.type ?? "QUERY",
          personaTags,
          scopePolicy: args.input.scopePolicy ?? undefined,
          filterSchema: args.input.filterSchema ?? undefined,
          visualisationConfig: args.input.visualisationConfig ?? undefined,
        },
        include: { currentVersion: true },
      });

      return definition;
    },
    createReportVersion: async (
      _parent: unknown,
      args: {
        input: {
          definitionId: string;
          status?: string | null;
          queryTemplate?: string | null;
          defaultFilters?: Prisma.InputJsonValue | null;
          notes?: string | null;
        };
      },
      ctx: Context,
    ) => {
      const definition = await ctx.prisma.reportDefinition.findFirst({
        where: { id: args.input.definitionId, tenantId: ctx.tenantId },
      });
      if (!definition) {
        throw new Error("Report definition not found");
      }

      const version = await ctx.prisma.reportVersion.create({
        data: {
          definitionId: definition.id,
          tenantId: ctx.tenantId,
          status: args.input.status ?? "DRAFT",
          queryTemplate: args.input.queryTemplate ?? null,
          defaultFilters: args.input.defaultFilters ?? undefined,
          notes: args.input.notes ?? null,
        },
      });

      return version;
    },
    publishReportVersion: async (
      _parent: unknown,
      args: { id: string },
      ctx: Context,
    ) => {
      const version = await ctx.prisma.reportVersion.findFirst({
        where: { id: args.id, tenantId: ctx.tenantId },
      });
      if (!version) {
        throw new Error("Report version not found");
      }

      const [, updatedDefinition] = await ctx.prisma.$transaction([
        ctx.prisma.reportVersion.update({
          where: { id: version.id },
          data: { status: "PUBLISHED", publishedAt: new Date() },
        }),
        ctx.prisma.reportDefinition.update({
          where: { id: version.definitionId },
          data: { currentVersionId: version.id },
          include: { currentVersion: true },
        }),
      ]);
      return updatedDefinition;
    },
    createReportDashboard: async (
      _parent: unknown,
      args: {
        input: {
          slug?: string | null;
          name: string;
          description?: string | null;
          personaTags?: string[] | null;
        };
      },
      ctx: Context,
    ) => {
      const slugCandidate = args.input.slug?.trim() || toSlug(args.input.name);
      if (!slugCandidate) {
        throw new Error("Unable to derive slug for dashboard");
      }
      const personaTags = args.input.personaTags?.filter(Boolean) ?? [];
      return ctx.prisma.reportDashboard.create({
        data: {
          tenantId: ctx.tenantId,
          slug: slugCandidate,
          name: args.input.name,
          description: args.input.description,
          personaTags,
        },
        include: {
          currentVersion: { include: { tiles: true } },
          versions: { include: { tiles: true } },
        },
      });
    },
    createDashboardVersion: async (
      _parent: unknown,
      args: {
        input: {
          dashboardId: string;
          layout: Prisma.InputJsonValue;
          status?: string | null;
        };
      },
      ctx: Context,
    ) => {
      const dashboard = await ctx.prisma.reportDashboard.findFirst({
        where: { id: args.input.dashboardId, tenantId: ctx.tenantId },
      });
      if (!dashboard) {
        throw new Error("Dashboard not found");
      }
      return ctx.prisma.dashboardVersion.create({
        data: {
          dashboardId: dashboard.id,
          tenantId: ctx.tenantId,
          layout: args.input.layout,
          status: args.input.status ?? "DRAFT",
        },
        include: { tiles: true },
      });
    },
    addDashboardTile: async (
      _parent: unknown,
      args: {
        input: {
          dashboardVersionId: string;
          reportDefinitionId: string;
          reportVersionId?: string | null;
          position?: Prisma.InputJsonValue | null;
          size?: Prisma.InputJsonValue | null;
          tileOverrides?: Prisma.InputJsonValue | null;
        };
      },
      ctx: Context,
    ) => {
      const version = await ctx.prisma.dashboardVersion.findFirst({
        where: { id: args.input.dashboardVersionId, tenantId: ctx.tenantId },
      });
      if (!version) {
        throw new Error("Dashboard version not found");
      }
      const definition = await ctx.prisma.reportDefinition.findFirst({
        where: { id: args.input.reportDefinitionId, tenantId: ctx.tenantId },
      });
      if (!definition) {
        throw new Error("Report definition not found");
      }
      if (args.input.reportVersionId) {
        const reportVersion = await ctx.prisma.reportVersion.findFirst({
          where: { id: args.input.reportVersionId, tenantId: ctx.tenantId },
        });
        if (!reportVersion) {
          throw new Error("Report version not found");
        }
      }
      return ctx.prisma.dashboardTile.create({
        data: {
          dashboardVersionId: version.id,
          reportDefinitionId: definition.id,
          reportVersionId: args.input.reportVersionId ?? null,
          tenantId: ctx.tenantId,
          position: args.input.position ?? undefined,
          size: args.input.size ?? undefined,
          tileOverrides: args.input.tileOverrides ?? undefined,
        },
      });
    },
    publishDashboardVersion: async (
      _parent: unknown,
      args: { id: string },
      ctx: Context,
    ) => {
      const version = await ctx.prisma.dashboardVersion.findFirst({
        where: { id: args.id, tenantId: ctx.tenantId },
      });
      if (!version) {
        throw new Error("Dashboard version not found");
      }
      const [, updatedDashboard] = await ctx.prisma.$transaction([
        ctx.prisma.dashboardVersion.update({
          where: { id: version.id },
          data: { status: "PUBLISHED", publishedAt: new Date() },
        }),
        ctx.prisma.reportDashboard.update({
          where: { id: version.dashboardId },
          data: { currentVersionId: version.id },
          include: {
            currentVersion: { include: { tiles: true } },
            versions: { include: { tiles: true } },
          },
        }),
      ]);
      return updatedDashboard;
    },
    runReportVersion: async (
      _parent: unknown,
      args: {
        input: {
          reportVersionId: string;
          filters?: Prisma.InputJsonValue | null;
        };
      },
      ctx: Context,
    ) => {
      const version = await ctx.prisma.reportVersion.findFirst({
        where: { id: args.input.reportVersionId, tenantId: ctx.tenantId },
        include: {
          definition: true,
        },
      });
      if (!version) {
        throw new Error("Report version not found");
      }

      const runtimeFilters = coerceJsonObject(args.input.filters as Prisma.JsonValue);
      const defaultFiltersObject = coerceJsonObject(version.defaultFilters);
      const mergedFilters = {
        ...defaultFiltersObject,
        ...runtimeFilters,
      };
      const filterHash = createHash("sha1").update(JSON.stringify(mergedFilters)).digest("hex");

      const runRecord = await ctx.prisma.reportRun.create({
        data: {
          reportVersionId: version.id,
          tenantId: ctx.tenantId,
          status: "QUEUED",
          durationMs: 0,
          cacheHit: false,
          filterHash,
          filtersUsed: mergedFilters as Prisma.InputJsonValue,
        },
      });

      try {
        const { client: temporalClient, taskQueue } = await getTemporalClient();
        const workflowId = `reporting-run-${runRecord.id}`;
        const handle = await temporalClient.start(WORKFLOW_NAMES.reportExecution, {
          taskQueue,
          workflowId,
          args: [
            {
              runId: runRecord.id,
              reportVersionId: version.id,
              tenantId: ctx.tenantId,
              filters: mergedFilters,
            },
          ],
        });

        const updated = await ctx.prisma.reportRun.update({
          where: { id: runRecord.id },
          data: {
            workflowId,
            temporalRunId: handle.firstExecutionRunId,
          },
        });

        return updated;
      } catch (temporalError) {
        const sandbox = new NoopSandboxRunner();
        const startedAt = Date.now();
        await sandbox.execute({
          moduleId: WORKFLOW_NAMES.reportExecution,
          input: {
            reportVersionId: version.id,
            filters: mergedFilters,
          },
        });
        const durationMs = Date.now() - startedAt;
        const payload = await buildPreviewPayload({
          runId: runRecord.id,
          tenantId: ctx.tenantId,
          definitionName: version.definition?.name ?? `Report ${version.definitionId}`,
          definitionSlug: version.definition?.slug ?? version.definitionId,
          queryTemplate: version.queryTemplate ?? null,
          defaultFilters: version.defaultFilters,
          filters: mergedFilters,
        });

        const updated = await ctx.prisma.reportRun.update({
          where: { id: runRecord.id },
          data: {
            status: "COMPLETED",
            durationMs,
            cacheHit: false,
            filterHash,
            filtersUsed: mergedFilters as Prisma.InputJsonValue,
            payload: payload as Prisma.InputJsonValue,
            error: temporalError instanceof Error ? temporalError.message : String(temporalError),
          },
        });

        return updated;
      }
    },
    agentDesign: async (
      _parent: unknown,
      args: { input: { prompt: string; datasetIds?: string[] | null; persona?: string | null; conversationId: string } },
      ctx: Context,
    ) => {
      const conversation = await ctx.prisma.agentReflection.findFirst({
        where: { id: args.input.conversationId, tenantId: ctx.tenantId },
      });
      if (!conversation) {
        throw new Error("Conversation not found.");
      }

      const datasetIds = args.input.datasetIds?.filter(Boolean) ?? [];
      const persona = args.input.persona ?? conversation.persona ?? null;
      const workflowId = `reporting-agent-${ctx.tenantId}-${conversation.id}`;

      const lastAssistant = await ctx.prisma.agentMessage.findFirst({
        where: { reflectionId: conversation.id, role: "assistant" },
        orderBy: { createdAt: "desc" },
      });
      const lastAssistantTimestamp = lastAssistant?.createdAt ?? new Date(0);

      try {
        const { client: temporalClient, taskQueue } = await getTemporalClient();
        await temporalClient.signalWithStart(WORKFLOW_NAMES.agentDesign, {
          taskQueue,
          workflowId,
          args: [
            {
              tenantId: ctx.tenantId,
              reflectionId: conversation.id,
              persona,
            },
          ],
          signal: AGENT_SIGNAL_NAME,
          signalArgs: [
            {
              tenantId: ctx.tenantId,
              userId: ctx.userId ?? null,
              prompt: args.input.prompt,
              persona,
              datasetIds,
              reflectionId: conversation.id,
            },
          ],
        });

        const assistantMessage = await waitForAssistantMessage(ctx, conversation.id, lastAssistantTimestamp);
        if (!assistantMessage) {
          throw new Error("Timed out waiting for agent response.");
        }

        const suggestions = extractSuggestions(assistantMessage.suggestions);

        return {
          reflectionId: conversation.id,
          suggestions,
        };
      } catch (error) {
        const datasets =
          datasetIds.length > 0
            ? (
                await Promise.all(datasetIds.map((datasetId) => ctx.catalog.getDataset(datasetId)))
              ).filter((dataset): dataset is NonNullable<typeof dataset> => Boolean(dataset))
            : await ctx.catalog.listDatasets();

        const fallbackSuggestions = buildHeuristicSuggestions({
          prompt: args.input.prompt,
          persona,
          datasets,
        });

        return {
          reflectionId: conversation.id,
          suggestions: fallbackSuggestions,
        };
      }
    },
    startAgentConversation: async (
      _parent: unknown,
      args: { input?: { persona?: string | null } | null },
      ctx: Context,
    ) => {
      const persona = args.input?.persona?.trim() || null;
      const reflection = await ctx.prisma.agentReflection.create({
        data: {
          tenantId: ctx.tenantId,
          persona: persona ?? undefined,
        },
      });
      return {
        reflectionId: reflection.id,
        suggestions: [],
      };
    },
  },
};

async function waitForAssistantMessage(ctx: Context, reflectionId: string, after: Date) {
  const deadline = Date.now() + ASSISTANT_WAIT_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const message = await ctx.prisma.agentMessage.findFirst({
      where: {
        reflectionId,
        role: "assistant",
        createdAt: { gt: after },
      },
      orderBy: { createdAt: "desc" },
    });
    if (message) {
      return message;
    }
    await new Promise((resolve) => setTimeout(resolve, ASSISTANT_POLL_INTERVAL_MS));
  }
  return null;
}

function extractSuggestions(value: Prisma.JsonValue | null): Array<Record<string, unknown>> {
  if (!value) {
    return [];
  }
  if (Array.isArray(value)) {
    return value as Array<Record<string, unknown>>;
  }
  return [];
}

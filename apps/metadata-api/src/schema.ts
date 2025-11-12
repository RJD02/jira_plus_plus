import { randomUUID } from "node:crypto";
import { GraphQLScalarType } from "graphql";
import { DateTimeResolver, JSONResolver } from "graphql-scalars";
import type { MetadataStore, MetadataEndpointDescriptor, MetadataRecordInput, MetadataRecord, HttpVerb } from "@metadata/core";
import type { EndpointBuildResult, EndpointTestResult } from "./types.js";
import { getPrismaClient } from "./prismaClient.js";
import { getTemporalClient } from "./temporal/client.js";
import { WORKFLOW_NAMES } from "./temporal/workflows.js";
import type { AuthContext } from "./auth.js";
import sampleMetadata from "./fixtures/sample-metadata.json" assert { type: "json" };

const CATALOG_DATASET_DOMAIN = process.env.METADATA_CATALOG_DOMAIN ?? "catalog.dataset";
const DEFAULT_PROJECT_ID = process.env.METADATA_DEFAULT_PROJECT ?? "global";
const ENABLE_SAMPLE_FALLBACK = process.env.METADATA_SAMPLE_FALLBACK !== "0";

export const typeDefs = `#graphql
  scalar DateTime
  scalar JSON

  type Health {
    status: String!
    version: String!
  }

  type MetadataDomain {
    key: String!
    title: String!
    description: String
    itemCount: Int!
  }

  type MetadataRecord {
    id: ID!
    projectId: String!
    domain: String!
    labels: [String!]!
    payload: JSON!
    createdAt: DateTime!
    updatedAt: DateTime!
  }

  input MetadataRecordInput {
    id: ID
    projectId: String!
    domain: String!
    labels: [String!]
    payload: JSON!
  }

  type MetadataEndpoint {
    id: ID!
    sourceId: String!
    projectId: String
    name: String!
    description: String
    verb: String!
    url: String!
    authPolicy: String
    domain: String
    labels: [String!]
    config: JSON
    detectedVersion: String
    versionHint: String
    capabilities: [String!]
    createdAt: DateTime
    updatedAt: DateTime
    deletedAt: DateTime
    deletionReason: String
    runs(limit: Int): [MetadataCollectionRun!]!
    datasets(limit: Int, search: String): [CatalogDataset!]!
  }

  input MetadataEndpointInput {
    id: ID
    sourceId: String
    projectId: String
    name: String!
    description: String
    verb: String
    url: String
    authPolicy: String
    domain: String
    labels: [String!]
    config: JSON
  }

  type CatalogDatasetField {
    name: String!
    type: String!
    description: String
  }

  type CatalogDatasetProfile {
    recordCount: Int
    sampleSize: Int
    lastProfiledAt: DateTime
    raw: JSON
  }

  type CatalogDatasetPreview {
    sampledAt: DateTime!
    rows: [JSON!]!
  }

  type CatalogDataset {
    id: ID!
    displayName: String!
    description: String
    source: String
    projectIds: [String!]
    labels: [String!]
    schema: String
    entity: String
    collectedAt: DateTime
    sourceEndpointId: ID
    sourceEndpoint: MetadataEndpoint
    profile: CatalogDatasetProfile
    sampleRows: [JSON!]
    statistics: JSON
    fields: [CatalogDatasetField!]!
  }

  enum MetadataCollectionStatus {
    QUEUED
    RUNNING
    SUCCEEDED
    FAILED
  }

  type MetadataCollectionRun {
    id: ID!
    endpointId: ID!
    endpoint: MetadataEndpoint!
    status: MetadataCollectionStatus!
    requestedBy: String
    requestedAt: DateTime!
    startedAt: DateTime
    completedAt: DateTime
    workflowId: String
    temporalRunId: String
    error: String
    filters: JSON
  }

  input MetadataCollectionRunFilter {
    endpointId: ID
    status: MetadataCollectionStatus
  }

  input MetadataCollectionRequestInput {
    endpointId: ID!
    schemas: [String!]
  }

  enum MetadataEndpointFamily {
    JDBC
    HTTP
    STREAM
  }

  enum MetadataEndpointFieldValueType {
    STRING
    PASSWORD
    NUMBER
    BOOLEAN
    URL
    HOSTNAME
    PORT
    JSON
    ENUM
    LIST
    TEXT
  }

  enum MetadataEndpointFieldSemantic {
    HOST
    PORT
    DATABASE
    USERNAME
    PASSWORD
    API_TOKEN
    PROJECT
    SCHEMA
    TABLE
    WAREHOUSE
    ROLE
    ENVIRONMENT
    CLUSTER
    TOPIC
    GENERIC
    FILE_PATH
  }

  type MetadataEndpointRequirementOption {
    label: String!
    value: String!
    description: String
  }

  type MetadataEndpointField {
    key: String!
    label: String!
    required: Boolean!
    valueType: MetadataEndpointFieldValueType!
    semantic: MetadataEndpointFieldSemantic
    description: String
    placeholder: String
    helpText: String
    options: [MetadataEndpointRequirementOption!]
    regex: String
    min: Int
    max: Int
    defaultValue: String
    advanced: Boolean
    sensitive: Boolean
    dependsOn: String
    dependsValue: String
    visibleWhen: [MetadataEndpointFieldVisibilityRule!]
  }

  type MetadataEndpointFieldVisibilityRule {
    field: String!
    values: [String!]!
  }

  type MetadataEndpointCapability {
    key: String!
    label: String!
    description: String
  }

  type MetadataEndpointConnection {
    urlTemplate: String
    defaultVerb: String
  }

  type MetadataEndpointTemplate {
    id: ID!
    family: MetadataEndpointFamily!
    title: String!
    vendor: String!
    description: String
    domain: String
    categories: [String!]!
    protocols: [String!]!
    versions: [String!]!
    defaultPort: Int
    driver: String
    docsUrl: String
    agentPrompt: String
    defaultLabels: [String!]
    fields: [MetadataEndpointField!]!
    capabilities: [MetadataEndpointCapability!]!
    sampleConfig: JSON
    connection: MetadataEndpointConnection
    descriptorVersion: String
    minVersion: String
    maxVersion: String
    probing: MetadataEndpointProbingPlan
  }

  type MetadataEndpointProbingPlan {
    methods: [MetadataEndpointProbingMethod!]!
    fallbackMessage: String
  }

  type MetadataEndpointProbingMethod {
    key: String!
    label: String!
    strategy: String!
    statement: String
    description: String
    requires: [String!]
    returnsVersion: Boolean
    returnsCapabilities: [String!]
  }

  type MetadataEndpointTestResult {
    success: Boolean!
    message: String
    detectedVersion: String
    capabilities: [String!]
    details: JSON
  }

  type Query {
    health: Health!
    metadataDomains: [MetadataDomain!]!
    metadataRecords(domain: String!, projectId: String, labels: [String!], search: String, limit: Int): [MetadataRecord!]!
    metadataEndpoints(projectId: String, includeDeleted: Boolean): [MetadataEndpoint!]!
    metadataEndpoint(id: ID!): MetadataEndpoint
    catalogDatasets(projectId: String, labels: [String!], search: String, endpointId: ID): [CatalogDataset!]!
    metadataDataset(id: ID!): CatalogDataset
    metadataCollectionRuns(filter: MetadataCollectionRunFilter, limit: Int): [MetadataCollectionRun!]!
    metadataEndpointTemplates(family: MetadataEndpointFamily): [MetadataEndpointTemplate!]!
  }

  type Mutation {
    upsertMetadataRecord(input: MetadataRecordInput!): MetadataRecord!
    registerMetadataEndpoint(input: MetadataEndpointInput!): MetadataEndpoint!
    deleteMetadataEndpoint(id: ID!, reason: String): MetadataEndpoint!
    triggerMetadataCollection(input: MetadataCollectionRequestInput!): MetadataCollectionRun!
    testMetadataEndpoint(input: MetadataEndpointInput!): MetadataEndpointTestResult!
    previewMetadataDataset(id: ID!, limit: Int): CatalogDatasetPreview!
  }
`;

export function createResolvers(store: MetadataStore) {
  return {
    DateTime: DateTimeResolver,
    JSON: JSONResolver as GraphQLScalarType,
    Query: {
      health: () => ({ status: "ok", version: "0.1.0" }),
      metadataDomains: async (_parent: unknown, _args: unknown, ctx: ResolverContext) => {
        enforceReadAccess(ctx);
        return store.listDomains();
      },
      metadataRecords: async (
        _parent: unknown,
        args: { domain: string; projectId?: string; labels?: string[]; search?: string; limit?: number },
        ctx: ResolverContext,
      ) => {
        enforceReadAccess(ctx);
        return store.listRecords(args.domain, {
          projectId: args.projectId ?? ctx.auth.projectId,
          labels: args.labels,
          search: args.search,
          limit: args.limit,
        });
      },
      metadataEndpoints: async (
        _parent: unknown,
        args: { projectId?: string; includeDeleted?: boolean },
        ctx: ResolverContext,
      ) => {
        enforceReadAccess(ctx);
        const endpoints = await store.listEndpoints(args.projectId ?? ctx.auth.projectId);
        const filtered = args.includeDeleted ? endpoints : endpoints.filter((endpoint) => !endpoint.deletedAt);
        if (filtered.length === 0 && ENABLE_SAMPLE_FALLBACK) {
          return buildSampleEndpoints(args.projectId ?? ctx.auth.projectId);
        }
        return filtered;
      },
      metadataEndpoint: async (_parent: unknown, args: { id: string }, ctx: ResolverContext) => {
        enforceReadAccess(ctx);
        const endpoints = await store.listEndpoints(ctx.auth.projectId);
        return endpoints.find((endpoint) => endpoint.id === args.id) ?? null;
      },
      catalogDatasets: async (
        _parent: unknown,
        args: { projectId?: string; labels?: string[]; search?: string; endpointId?: string | null },
        ctx: ResolverContext,
      ) => {
        enforceReadAccess(ctx);
        const records = await store.listRecords(CATALOG_DATASET_DOMAIN, {
          projectId: args.projectId ?? ctx.auth.projectId,
          labels: args.labels,
          search: args.search,
        });
        let datasets = records
          .map(mapCatalogRecordToDataset)
          .filter((dataset): dataset is CatalogDataset => Boolean(dataset));
        if (args.endpointId) {
          datasets = datasets.filter((dataset) => dataset.sourceEndpointId === args.endpointId);
        }
        if (datasets.length === 0 && ENABLE_SAMPLE_FALLBACK) {
          return buildSampleCatalogDatasets(args.projectId ?? ctx.auth.projectId);
        }
        return datasets;
      },
      metadataDataset: async (_parent: unknown, args: { id: string }, ctx: ResolverContext) => {
        enforceReadAccess(ctx);
        const record = await store.getRecord(CATALOG_DATASET_DOMAIN, args.id);
        if (!record || record.projectId !== ctx.auth.projectId) {
          return null;
        }
        return mapCatalogRecordToDataset(record);
      },
      metadataCollectionRuns: async (
        _parent: unknown,
        args: { filter?: MetadataCollectionRunFilter | null; limit?: number | null },
        ctx: ResolverContext,
      ) => {
        enforceReadAccess(ctx);
        const prisma = await getPrismaClient();
        return prisma.metadataCollectionRun.findMany({
          where: {
            endpointId: args.filter?.endpointId ?? undefined,
            status: args.filter?.status ?? undefined,
            endpoint: {
              projectId: ctx.auth.projectId,
            },
          },
          orderBy: { requestedAt: "desc" },
          take: args.limit ?? 50,
          include: { endpoint: true },
        });
      },
      metadataEndpointTemplates: async (_parent: unknown, args: { family?: "JDBC" | "HTTP" | "STREAM" }) => {
        const { client, taskQueue } = await getTemporalClient();
        return client.workflow.execute(WORKFLOW_NAMES.listEndpointTemplates, {
          taskQueue,
          workflowId: `metadata-endpoint-templates-${randomUUID()}`,
          args: [{ family: args.family }],
        });
      },
    },
    Mutation: {
      upsertMetadataRecord: async (_parent: unknown, args: { input: GraphQLMetadataRecordInput }, ctx: ResolverContext) => {
        enforceWriteAccess(ctx);
        const payload: MetadataRecordInput<unknown> = {
          id: args.input.id ?? undefined,
          projectId: args.input.projectId ?? ctx.auth.projectId,
          domain: args.input.domain,
          labels: args.input.labels ?? undefined,
          payload: args.input.payload,
        };
        const record = await store.upsertRecord(payload);
        return record;
      },
      registerMetadataEndpoint: async (_parent: unknown, args: { input: GraphQLMetadataEndpointInput }, ctx: ResolverContext) => {
        enforceWriteAccess(ctx);
        const templateId = parseTemplateId(args.input.config);
        let built: EndpointBuildResult | undefined;
        let testResult: EndpointTestResult | null = null;
        let templateParameters: Record<string, string> = {};
        if (templateId) {
          templateParameters = parseTemplateParameters(args.input.config);
          const { client, taskQueue } = await getTemporalClient();
          built = await client.workflow.execute(WORKFLOW_NAMES.buildEndpointConfig, {
            taskQueue,
            workflowId: `metadata-endpoint-build-${randomUUID()}`,
            args: [{ templateId, parameters: templateParameters, extras: { labels: args.input.labels ?? undefined } }],
          });
          testResult = await tryTestEndpointTemplate(client, taskQueue, templateId, templateParameters);
        }

        const url = built?.url ?? args.input.url;
        if (!url) {
          throw new Error("Endpoint URL is required.");
        }
        const versionHint =
          extractVersionHint(templateParameters) ?? extractVersionHintFromConfig(args.input.config) ?? undefined;

        const descriptor: MetadataEndpointDescriptor = {
          id: args.input.id ?? undefined,
          sourceId: args.input.sourceId ?? undefined,
          name: args.input.name,
          description: args.input.description ?? undefined,
          verb: ((args.input.verb as HttpVerb | undefined) ?? built?.verb ?? "POST") as HttpVerb,
          url,
          authPolicy: args.input.authPolicy ?? undefined,
          projectId: args.input.projectId ?? ctx.auth.projectId ?? undefined,
          domain: args.input.domain ?? built?.domain ?? undefined,
          labels: built?.labels ?? args.input.labels ?? undefined,
          config: built?.config ?? args.input.config ?? undefined,
          detectedVersion: testResult?.detectedVersion ?? undefined,
          versionHint,
          capabilities: testResult?.capabilities ?? undefined,
          deletedAt: null,
          deletionReason: undefined,
        };
        return store.registerEndpoint(descriptor);
      },
      deleteMetadataEndpoint: async (_parent: unknown, args: { id: string; reason?: string | null }, ctx: ResolverContext) => {
        enforceWriteAccess(ctx);
        const endpoints = await store.listEndpoints(ctx.auth.projectId);
        const target = endpoints.find((endpoint) => endpoint.id === args.id || endpoint.sourceId === args.id);
        if (!target) {
          throw new Error("Endpoint not found");
        }
        const deleted = await store.registerEndpoint({
          ...target,
          deletedAt: new Date().toISOString(),
          deletionReason: args.reason ?? target.deletionReason ?? null,
        });
        return deleted;
      },
      triggerMetadataCollection: async (
        _parent: unknown,
        args: { input: MetadataCollectionRequestInput },
        ctx: ResolverContext,
      ) => {
        enforceWriteAccess(ctx);
        const prisma = await getPrismaClient();
        const endpoint = await prisma.metadataEndpoint.findUnique({ where: { id: args.input.endpointId } });
        if (!endpoint || endpoint.projectId !== ctx.auth.projectId) {
          throw new Error("Endpoint not found");
        }
        if (!endpoint.url) {
          throw new Error("Endpoint is missing a connection URL");
        }
        const filters = buildRunFilters(args.input.schemas);
        const run = await prisma.metadataCollectionRun.create({
          data: {
            endpointId: endpoint.id,
            status: "QUEUED",
            requestedBy: ctx.userId ?? undefined,
            filters,
          },
          include: { endpoint: true },
        });

        const { client, taskQueue } = await getTemporalClient();
        const workflowId = `metadata-collection-${run.id}`;
        const handle = await client.workflow.start(WORKFLOW_NAMES.metadataCollection, {
          taskQueue,
          workflowId,
          args: [{ runId: run.id }],
        });

        await prisma.metadataCollectionRun.update({
          where: { id: run.id },
          data: {
            workflowId: handle.workflowId,
            temporalRunId: handle.firstExecutionRunId,
          },
        });

        return prisma.metadataCollectionRun.findUnique({ where: { id: run.id }, include: { endpoint: true } });
      },
      testMetadataEndpoint: async (_parent: unknown, args: { input: GraphQLMetadataEndpointInput }, ctx: ResolverContext) => {
        enforceWriteAccess(ctx);
        const templateId = parseTemplateId(args.input.config);
        if (!templateId) {
          return { success: false, message: "templateId required in config for testing." };
        }
        const parameters = parseTemplateParameters(args.input.config);
        const { client, taskQueue } = await getTemporalClient();
        return client.workflow.execute(WORKFLOW_NAMES.testEndpointConnection, {
          taskQueue,
          workflowId: `metadata-endpoint-test-${randomUUID()}`,
          args: [{ templateId, parameters }],
        });
      },
      previewMetadataDataset: async (_parent: unknown, args: { id: string; limit?: number | null }, ctx: ResolverContext) => {
        enforceReadAccess(ctx);
        const record = await store.getRecord(CATALOG_DATASET_DOMAIN, args.id);
        if (!record || record.projectId !== ctx.auth.projectId) {
          throw new Error("Dataset not found");
        }
        const payload = normalizePayload(record.payload) ?? {};
        const schema = extractDatasetSchema(payload, record);
        const table = extractDatasetEntity(payload, record);
        if (!schema || !table) {
          throw new Error("Dataset schema or entity is missing");
        }
        const sourceEndpointId = extractSourceEndpointId(payload);
        if (!sourceEndpointId) {
          throw new Error("Dataset is missing source endpoint linkage");
        }
        const prisma = await getPrismaClient();
        const endpoint = await prisma.metadataEndpoint.findUnique({ where: { id: sourceEndpointId } });
        if (!endpoint || !endpoint.url) {
          throw new Error("Source endpoint is not registered or missing connection URL");
        }
        const { client, taskQueue } = await getTemporalClient();
        return client.workflow.execute(WORKFLOW_NAMES.previewDataset, {
          taskQueue,
          workflowId: `metadata-dataset-preview-${args.id}-${randomUUID()}`,
          args: [
            {
              datasetId: args.id,
              schema,
              table,
              limit: args.limit ?? 50,
              connectionUrl: endpoint.url,
            },
          ],
        });
      },
    },
    MetadataEndpoint: {
      runs: async (parent: { id: string; projectId?: string | null }, args: { limit?: number | null }, ctx: ResolverContext) => {
        enforceReadAccess(ctx);
        if (parent.projectId && parent.projectId !== ctx.auth.projectId) {
          return [];
        }
        const prisma = await getPrismaClient();
        return prisma.metadataCollectionRun.findMany({
          where: { endpointId: parent.id },
          orderBy: { requestedAt: "desc" },
          take: args.limit ?? 5,
        });
      },
      datasets: async (
        parent: MetadataEndpointDescriptor,
        args: { limit?: number | null; search?: string | null },
        ctx: ResolverContext,
      ) => {
        enforceReadAccess(ctx);
        if (parent.projectId && parent.projectId !== ctx.auth.projectId) {
          return [];
        }
        const records = await store.listRecords(CATALOG_DATASET_DOMAIN, {
          projectId: parent.projectId,
          search: args.search ?? undefined,
        });
        const datasets = records
          .map(mapCatalogRecordToDataset)
          .filter(
            (dataset): dataset is CatalogDataset =>
              Boolean(
                dataset &&
                  dataset.sourceEndpointId &&
                  (dataset.sourceEndpointId === parent.id || dataset.sourceEndpointId === parent.sourceId),
              ),
          );
        if (args.limit) {
          return datasets.slice(0, args.limit);
        }
        return datasets;
      },
    },
    MetadataCollectionRun: {
      endpoint: async (parent: any, _args: unknown, ctx: ResolverContext) => {
        enforceReadAccess(ctx);
        if (parent.endpoint) {
          return parent.endpoint.projectId === ctx.auth.projectId ? parent.endpoint : null;
        }
        const prisma = await getPrismaClient();
        const endpoint = await prisma.metadataEndpoint.findUnique({ where: { id: parent.endpointId } });
        if (!endpoint || endpoint.projectId !== ctx.auth.projectId) {
          return null;
        }
        return endpoint;
      },
    },
    CatalogDataset: {
      sourceEndpoint: async (parent: CatalogDataset, _args: unknown, ctx: ResolverContext) => {
        enforceReadAccess(ctx);
        if (!parent.sourceEndpointId) {
          return null;
        }
        const prisma = await getPrismaClient();
        const endpoint = await prisma.metadataEndpoint.findUnique({ where: { id: parent.sourceEndpointId } });
        if (!endpoint || endpoint.projectId !== ctx.auth.projectId) {
          return null;
        }
        return endpoint;
      },
    },
  };
}

function buildSampleEndpoints(projectId?: string): MetadataEndpointDescriptor[] {
  const targetProject = projectId ?? (sampleMetadata.projectId as string | undefined) ?? DEFAULT_PROJECT_ID;
  const now = new Date().toISOString();
  return (sampleMetadata.endpoints ?? []).map((endpoint) => ({
    id: endpoint.id,
    sourceId: endpoint.sourceId ?? endpoint.id,
    name: endpoint.name,
    description: endpoint.description ?? undefined,
    verb: ((endpoint.verb ?? "POST") as HttpVerb) || "POST",
    url: endpoint.url,
    authPolicy: endpoint.authPolicy ?? undefined,
    projectId: targetProject,
    domain: endpoint.domain ?? undefined,
    labels: endpoint.labels ?? undefined,
    config: endpoint.config ?? undefined,
    detectedVersion: endpoint.detectedVersion ?? undefined,
    versionHint: endpoint.versionHint ?? undefined,
    capabilities: endpoint.capabilities ?? [],
    createdAt: endpoint.createdAt ?? now,
    updatedAt: endpoint.updatedAt ?? now,
    deletedAt: null,
    deletionReason: null,
  }));
}

function buildSampleCatalogDatasets(projectId?: string): CatalogDataset[] {
  const targetProject = projectId ?? (sampleMetadata.projectId as string | undefined) ?? DEFAULT_PROJECT_ID;
  const now = new Date().toISOString();
  const records: MetadataRecord<unknown>[] = (sampleMetadata.datasets ?? []).map((dataset) => {
    const basePayload = { ...(dataset.payload as Record<string, unknown>) };
    const metadataBlock = (basePayload["_metadata"] as Record<string, unknown> | undefined) ?? {};
    const endpointId =
      dataset.sourceEndpointId ?? (sampleMetadata.endpoints?.[0]?.id as string | undefined) ?? "seed-endpoint";
    basePayload["metadata_endpoint_id"] = basePayload["metadata_endpoint_id"] ?? endpointId;
    metadataBlock["source_endpoint_id"] = metadataBlock["source_endpoint_id"] ?? endpointId;
    metadataBlock["source_id"] = metadataBlock["source_id"] ?? endpointId;
    metadataBlock["collected_at"] = metadataBlock["collected_at"] ?? now;
    basePayload["_metadata"] = metadataBlock;
    return {
      id: dataset.id,
      projectId: dataset.projectId ?? targetProject,
      domain: CATALOG_DATASET_DOMAIN,
      labels: dataset.labels ?? [],
      payload: basePayload,
      createdAt: now,
      updatedAt: now,
    };
  });
  return records
    .map(mapCatalogRecordToDataset)
    .filter((dataset): dataset is CatalogDataset => Boolean(dataset));
}

function parseTemplateId(config?: Record<string, unknown> | null): string | null {
  if (!config || typeof config !== "object") {
    return null;
  }
  const templateId = (config as Record<string, unknown>).templateId;
  return typeof templateId === "string" ? templateId : null;
}

function parseTemplateParameters(config?: Record<string, unknown> | null): Record<string, string> {
  if (!config || typeof config !== "object") {
    return {};
  }
  const parameters = (config as Record<string, unknown>).parameters;
  if (!parameters || typeof parameters !== "object" || Array.isArray(parameters)) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(parameters).map(([key, value]) => [key, value === undefined || value === null ? "" : String(value)]),
  );
}

async function tryTestEndpointTemplate(
  client: any,
  taskQueue: string,
  templateId: string,
  parameters: Record<string, string>,
): Promise<EndpointTestResult | null> {
  try {
    return await client.workflow.execute(WORKFLOW_NAMES.testEndpointConnection, {
      taskQueue,
      workflowId: `metadata-endpoint-test-${randomUUID()}`,
      args: [{ templateId, parameters }],
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn("Endpoint test failed during registration; continuing without detected version.", error);
    return null;
  }
}

function extractVersionHint(parameters?: Record<string, string>): string | null {
  if (!parameters) {
    return null;
  }
  const hint = parameters.version_hint ?? parameters.versionHint;
  if (!hint) {
    return null;
  }
  const trimmed = hint.trim();
  return trimmed.length ? trimmed : null;
}

function extractVersionHintFromConfig(config?: Record<string, unknown> | null): string | null {
  if (!config || typeof config !== "object") {
    return null;
  }
  const direct = (config as Record<string, unknown>).versionHint ?? (config as Record<string, unknown>).version_hint;
  if (typeof direct === "string" && direct.trim().length > 0) {
    return direct.trim();
  }
  const parameters = (config as Record<string, unknown>).parameters;
  if (!parameters || typeof parameters !== "object" || Array.isArray(parameters)) {
    return null;
  }
  const normalized = Object.fromEntries(
    Object.entries(parameters).map(([key, value]) => [key, value === undefined || value === null ? "" : String(value)]),
  );
  return extractVersionHint(normalized);
}

type GraphQLMetadataRecordInput = {
  id?: string | null;
  projectId: string;
  domain: string;
  labels?: string[] | null;
  payload: unknown;
};

type CatalogDataset = {
  id: string;
  displayName: string;
  description?: string | null;
  source?: string | null;
  projectIds?: string[];
  labels?: string[];
  schema?: string | null;
  entity?: string | null;
  collectedAt?: string | null;
  sourceEndpointId?: string | null;
  profile?: CatalogDatasetProfile | null;
  sampleRows?: unknown[];
  statistics?: Record<string, unknown> | null;
  fields: Array<{ name: string; type: string; description?: string | null }>;
};

type CatalogDatasetProfile = {
  recordCount?: number | null;
  sampleSize?: number | null;
  lastProfiledAt?: string | null;
  raw?: Record<string, unknown> | null;
};

type ResolverContext = {
  auth: AuthContext;
  userId: string | null;
  bypassWrites?: boolean;
};

function enforceReadAccess(context: ResolverContext) {
  if (!context.auth.tenantId || !context.auth.projectId) {
    throw new Error("Missing tenant/project context");
  }
}

function enforceWriteAccess(context: ResolverContext) {
  enforceReadAccess(context);
  if (context.bypassWrites) {
    return;
  }
  if (!context.auth.roles.includes("writer") && !context.auth.roles.includes("admin")) {
    throw new Error("Write access denied");
  }
}

type GraphQLMetadataEndpointInput = {
  id?: string | null;
  sourceId?: string | null;
  projectId?: string | null;
  name: string;
  description?: string | null;
  verb?: string | null;
  url?: string | null;
  authPolicy?: string | null;
  domain?: string | null;
  labels?: string[] | null;
  config?: Record<string, unknown> | null;
};

type MetadataCollectionRequestInput = {
  endpointId: string;
  schemas?: string[] | null;
};

type MetadataCollectionRunFilter = {
  endpointId?: string | null;
  status?: MetadataCollectionStatus | null;
};

type MetadataCollectionStatus = "QUEUED" | "RUNNING" | "SUCCEEDED" | "FAILED";

function mapCatalogRecordToDataset(record: MetadataRecord<unknown>): CatalogDataset | null {
  const payload = normalizePayload(record.payload) ?? {};
  const datasetPayload = normalizePayload(payload.dataset) ?? {};
  const id = String(
    datasetPayload.id ??
      payload.id ??
      payload.name ??
      record.id ??
      payload.entity ??
      payload.schema ??
      record.domain,
  );
  if (!id) {
    return null;
  }
  const displayName = String(
    datasetPayload.displayName ??
      datasetPayload.name ??
      payload.displayName ??
      payload.name ??
      id ??
      "Dataset",
  );
  const description = datasetPayload.description ?? payload.description ?? null;
  const source = datasetPayload.location ?? payload.source ?? null;
  const projectIds = mergeStrings(datasetPayload.projectIds, payload.projectIds);
  const labels = dedupeStrings([record.labels, payload.labels, datasetPayload.labels, datasetPayload.tags]);
  const schema = extractDatasetSchema(payload, record);
  const entity = extractDatasetEntity(payload, record);
  const collectedAt = extractCollectedAt(payload, record);
  const statistics = (payload.statistics ?? datasetPayload.statistics) as Record<string, unknown> | undefined;
  const profile = buildDatasetProfile(statistics);
  const sampleRows = extractSampleRows(payload);
  const sourceEndpointId = extractSourceEndpointId(payload);

  return {
    id,
    displayName,
    description,
    source,
    projectIds: projectIds.length ? projectIds : undefined,
    labels: labels.length ? labels : undefined,
    schema,
    entity,
    collectedAt,
    sourceEndpointId,
    profile,
    sampleRows,
    statistics: statistics ?? null,
    fields: extractDatasetFields(payload),
  };
}

function normalizePayload(value: unknown): Record<string, any> | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  return value as Record<string, any>;
}

function mergeStrings(
  first?: unknown,
  second?: unknown,
): string[] {
  return dedupeStrings([first, second]);
}

function dedupeStrings(groups: Array<unknown>): string[] {
  const values = groups
    .flatMap((group) => {
      if (Array.isArray(group)) {
        return group;
      }
      return [];
    })
    .map((value) => (typeof value === "string" ? value : String(value ?? "")))
    .map((value) => value.trim())
    .filter((value) => Boolean(value));
  return Array.from(new Set(values));
}

function extractDatasetFields(payload: Record<string, any>): Array<{ name: string; type: string; description?: string | null }> {
  const datasetPayload = normalizePayload(payload.dataset);
  const candidates = [payload.schema_fields, payload.columns, payload.fields, datasetPayload?.fields];
  const fields = candidates.find((field) => Array.isArray(field)) || [];
  return (fields as any[]).map((field) => ({
    name: String(field?.name ?? field?.column_name ?? ""),
    type: String(field?.data_type ?? field?.type ?? "string"),
    description: field?.description ?? field?.comment ?? null,
  }));
}

function extractDatasetSchema(payload: Record<string, any>, record: MetadataRecord<unknown>): string | null {
  const schema =
    payload.endpoint?.schema ??
    payload.schema ??
    payload.namespace ??
    payload.environment?.schema ??
    payload.endpoint?.schema ??
    record.projectId ??
    null;
  return schema ? String(schema) : null;
}

function extractDatasetEntity(payload: Record<string, any>, record: MetadataRecord<unknown>): string | null {
  const entity =
    payload.endpoint?.table ?? payload.name ?? payload.entity ?? payload.dataset?.name ?? record.id ?? null;
  return entity ? String(entity) : null;
}

function extractCollectedAt(payload: Record<string, any>, record: MetadataRecord<unknown>): string | null {
  const ts = payload.collected_at ?? payload.produced_at ?? payload.producedAt ?? record.updatedAt;
  return ts ? String(ts) : null;
}

function extractSourceEndpointId(payload: Record<string, any>): string | null {
  return (
    payload.metadata_endpoint_id ??
    payload.metadata_config?.endpointId ??
    payload.artifact_config?.metadata_endpoint_id ??
    payload.endpoint?.id ??
    payload._metadata?.source_endpoint_id ??
    payload._metadata?.source_id ??
    null
  );
}

function buildDatasetProfile(stats?: Record<string, unknown>): CatalogDatasetProfile | null {
  if (!stats || typeof stats !== "object") {
    return null;
  }
  const recordCount = stats.record_count ?? stats.rowCount;
  const sampleSize = stats.sample_size ?? stats.sampleSize;
  const lastProfiledAt = stats.last_profiled_at ?? stats.lastProfiledAt;
  return {
    recordCount: recordCount == null ? null : Number(recordCount),
    sampleSize: sampleSize == null ? null : Number(sampleSize),
    lastProfiledAt: lastProfiledAt ? String(lastProfiledAt) : null,
    raw: stats,
  };
}

function extractSampleRows(payload: Record<string, any>): unknown[] {
  const candidates = [payload.sample_rows, payload.samples, payload.preview?.rows, payload.preview];
  for (const candidate of candidates) {
    if (Array.isArray(candidate) && candidate.length > 0) {
      return candidate;
    }
  }
  return [];
}

function buildRunFilters(schemas?: string[] | null): Record<string, unknown> | undefined {
  if (!schemas || schemas.length === 0) {
    return undefined;
  }
  const normalized = schemas.map((schema) => schema.trim()).filter(Boolean);
  return normalized.length ? { schemas: normalized } : undefined;
}

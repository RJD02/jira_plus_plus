export interface ReportDefinitionSummary {
  id: string;
  name: string;
  slug: string;
  type: string;
  personaTags: string[];
  currentVersion?: ReportVersionSummary | null;
}

export interface ReportVersionSummary {
  id: string;
  status: string;
  publishedAt?: string | null;
}

export interface RunReportOptions {
  reportVersionId: string;
  filters?: Record<string, unknown>;
}

export interface ReportPayload {
  table?: {
    columns: string[];
    rows: unknown[][];
  };
  metrics?: Array<{ label: string; value: number }>;
  chart?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface CreateReportDefinitionInput {
  name: string;
  description?: string;
  slug?: string;
  type?: string;
  personaTags?: string[];
}

export interface CreateReportVersionInput {
  definitionId: string;
  status?: string;
  queryTemplate?: string;
  defaultFilters?: Record<string, unknown>;
  notes?: string;
}

export interface ReportRunSummary {
  id: string;
  reportVersionId: string;
  tenantId: string;
  status: string;
  executedAt: string;
  durationMs: number;
  cacheHit: boolean;
  filterHash?: string | null;
  filtersUsed?: Record<string, unknown> | null;
  payload?: Record<string, unknown> | null;
  error?: string | null;
  workflowId?: string | null;
  temporalRunId?: string | null;
}

export interface ReportRunFilter {
  status?: string;
  reportVersionId?: string;
}

export interface ReportingRegistryClient {
  listReports(): Promise<ReportDefinitionSummary[]>;
  runReport(options: RunReportOptions): Promise<ReportPayload>;
  createReportDefinition(input: CreateReportDefinitionInput): Promise<ReportDefinitionSummary>;
  createReportVersion(input: CreateReportVersionInput): Promise<ReportVersionSummary>;
  publishReportVersion(reportVersionId: string): Promise<ReportDefinitionSummary>;
  listRuns(filter?: ReportRunFilter): Promise<ReportRunSummary[]>;
}

export class InMemoryReportingRegistry implements ReportingRegistryClient {
  private readonly reports = new Map<string, ReportDefinitionSummary>();

  constructor(seed: ReportDefinitionSummary[] = []) {
    seed.forEach((report) => this.reports.set(report.id, report));
  }

  async listReports(): Promise<ReportDefinitionSummary[]> {
    return Array.from(this.reports.values());
  }

  async runReport(options: RunReportOptions): Promise<ReportPayload> {
    return {
      metrics: [
        {
          label: "placeholder",
          value: 0,
        },
      ],
      metadata: { filters: options.filters ?? {} },
    };
  }

  async createReportDefinition(input: CreateReportDefinitionInput): Promise<ReportDefinitionSummary> {
    const id = `local-${Date.now()}`;
    const record: ReportDefinitionSummary = {
      id,
      slug: input.slug ?? id,
      name: input.name,
      type: input.type ?? "QUERY",
      personaTags: input.personaTags ?? [],
      currentVersion: null,
    };
    this.reports.set(id, record);
    return record;
  }

  async createReportVersion(_input: CreateReportVersionInput): Promise<ReportVersionSummary> {
    return {
      id: `local-version-${Date.now()}`,
      status: "DRAFT",
      publishedAt: null,
    };
  }

  async publishReportVersion(_reportVersionId: string): Promise<ReportDefinitionSummary> {
    throw new Error("Not implemented in InMemoryReportingRegistry");
  }

  async listRuns(): Promise<ReportRunSummary[]> {
    return [];
  }
}

export interface GraphQLRegistryOptions {
  endpoint: string;
  fetchImpl?: typeof fetch;
  tenantId?: string;
  headers?: Record<string, string>;
}

async function graphQLFetch<T>(
  endpoint: string,
  body: unknown,
  headers: Record<string, string>,
  fetchImpl: typeof fetch,
): Promise<T> {
  const response = await fetchImpl(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`GraphQL request failed with status ${response.status}`);
  }

  const payload = await response.json();
  if (payload.errors?.length) {
    throw new Error(payload.errors[0]?.message ?? "GraphQL error");
  }
  return payload.data as T;
}

export class GraphQLReportingRegistryClient implements ReportingRegistryClient {
  private readonly endpoint: string;
  private readonly fetchImpl: typeof fetch;
  private readonly headers: Record<string, string>;

  constructor(options: GraphQLRegistryOptions) {
    this.endpoint = options.endpoint;
    const fallbackFetch = typeof fetch !== "undefined" ? fetch.bind(globalThis) : undefined;
    const suppliedFetch = options.fetchImpl
      ? options.fetchImpl.bind(globalThis)
      : undefined;
    this.fetchImpl = suppliedFetch ?? fallbackFetch ?? (() => {
      throw new Error("No fetch implementation available for GraphQLReportingRegistryClient");
    });
    this.headers = {
      ...(options.headers ?? {}),
    };
    if (options.tenantId) {
      this.headers["x-tenant-id"] = options.tenantId;
    }
  }

  async listReports(): Promise<ReportDefinitionSummary[]> {
    const data = await graphQLFetch<{ reportDefinitions: ReportDefinitionSummary[] }>(
      this.endpoint,
      {
        query: `query RegistryListReports {
          reportDefinitions {
            id
            slug
            name
            type
            personaTags
            currentVersion { id status publishedAt }
          }
        }`,
      },
      this.headers,
      this.fetchImpl,
    );
    return data.reportDefinitions ?? [];
  }

  async runReport(options: RunReportOptions): Promise<ReportPayload> {
    const data = await graphQLFetch<{ runReportVersion: { id: string } }>(
      this.endpoint,
      {
        query: `mutation RegistryRunReport($input: RunReportVersionInput!) {
          runReportVersion(input: $input) {
            id
          }
        }`,
        variables: {
          input: {
            reportVersionId: options.reportVersionId,
            filters: options.filters ?? {},
          },
        },
      },
      this.headers,
      this.fetchImpl,
    );

    return {
      metadata: {
        runId: data.runReportVersion.id,
        filters: options.filters ?? {},
      },
    };
  }

  async createReportDefinition(input: CreateReportDefinitionInput): Promise<ReportDefinitionSummary> {
    const data = await graphQLFetch<{ createReportDefinition: ReportDefinitionSummary }>(
      this.endpoint,
      {
        query: `mutation RegistryCreateReport($input: CreateReportDefinitionInput!) {
          createReportDefinition(input: $input) {
            id
            slug
            name
            type
            personaTags
            currentVersion { id status publishedAt }
          }
        }`,
        variables: { input },
      },
      this.headers,
      this.fetchImpl,
    );
    return data.createReportDefinition;
  }

  async createReportVersion(input: CreateReportVersionInput): Promise<ReportVersionSummary> {
    const data = await graphQLFetch<{ createReportVersion: ReportVersionSummary }>(
      this.endpoint,
      {
        query: `mutation RegistryCreateVersion($input: CreateReportVersionInput!) {
          createReportVersion(input: $input) {
            id
            status
            publishedAt
          }
        }`,
        variables: { input },
      },
      this.headers,
      this.fetchImpl,
    );
    return data.createReportVersion;
  }

  async publishReportVersion(reportVersionId: string): Promise<ReportDefinitionSummary> {
    const data = await graphQLFetch<{ publishReportVersion: ReportDefinitionSummary }>(
      this.endpoint,
      {
        query: `mutation RegistryPublishVersion($id: ID!) {
          publishReportVersion(id: $id) {
            id
            slug
            name
            type
            personaTags
            currentVersion { id status publishedAt }
          }
        }`,
        variables: { id: reportVersionId },
      },
      this.headers,
      this.fetchImpl,
    );
    return data.publishReportVersion;
  }

  async listRuns(filter?: ReportRunFilter): Promise<ReportRunSummary[]> {
    const data = await graphQLFetch<{ reportRuns: ReportRunSummary[] }>(
      this.endpoint,
      {
        query: `query RegistryListRuns($filter: ReportRunFilterInput) {
          reportRuns(filter: $filter) {
            id
            reportVersionId
            tenantId
            status
            executedAt
            durationMs
            cacheHit
            filterHash
            filtersUsed
            payload
            error
            workflowId
            temporalRunId
          }
        }`,
        variables: { filter: filter ?? {} },
      },
      this.headers,
      this.fetchImpl,
    );
    return data.reportRuns ?? [];
  }
}

export function createGraphQLReportingRegistryClient(options: GraphQLRegistryOptions) {
  return new GraphQLReportingRegistryClient(options);
}

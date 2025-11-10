import { getEnv } from "../env.js";

const REPORTING_CLIENT_SYMBOL = Symbol.for("apps.api.reportingRegistryClient");

export interface ReportDefinitionSummary {
  id: string;
  slug: string;
  name: string;
  type: string;
  personaTags: string[];
  currentVersion?: {
    id: string;
    status: string;
    publishedAt?: string | null;
  } | null;
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
  listRuns(filter?: ReportRunFilter): Promise<ReportRunSummary[]>;
}

interface GraphQLRegistryOptions {
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
    throw new Error(`Reporting GraphQL request failed with status ${response.status}`);
  }

  const payload = (await response.json()) as { data?: T; errors?: Array<{ message?: string }> };
  if (payload.errors?.length) {
    throw new Error(payload.errors[0]?.message ?? "Unknown reporting GraphQL error");
  }

  if (!payload.data) {
    throw new Error("Reporting GraphQL response missing data payload");
  }

  return payload.data;
}

function createGraphQLReportingRegistryClient(options: GraphQLRegistryOptions): ReportingRegistryClient {
  const endpoint = options.endpoint;
  const fetchImpl = options.fetchImpl ?? fetch;
  const headers: Record<string, string> = {
    ...(options.headers ?? {}),
  };
  if (options.tenantId) {
    headers["x-tenant-id"] = options.tenantId;
  }

  return {
    async listReports() {
      const data = await graphQLFetch<{ reportDefinitions: ReportDefinitionSummary[] }>(
        endpoint,
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
        headers,
        fetchImpl,
      );
      return Array.isArray(data.reportDefinitions) ? data.reportDefinitions : [];
    },

    async listRuns(filter?: ReportRunFilter) {
      const data = await graphQLFetch<{ reportRuns: ReportRunSummary[] }>(
        endpoint,
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
              error
              workflowId
              temporalRunId
            }
          }`,
          variables: {
            filter: filter ?? {},
          },
        },
        headers,
        fetchImpl,
      );
      return Array.isArray(data.reportRuns) ? data.reportRuns : [];
    },
  };
}

type ReportingClient = ReportingRegistryClient | null;

function getGlobalStore(): Record<symbol, unknown> {
  const globalAny = globalThis as Record<string | symbol, unknown>;
  if (!globalAny.__APPS_API_GLOBAL_STORE__) {
    globalAny.__APPS_API_GLOBAL_STORE__ = {} as Record<symbol, unknown>;
  }
  return globalAny.__APPS_API_GLOBAL_STORE__ as Record<symbol, unknown>;
}

export function getReportingRegistryClient(): ReportingClient {
  const store = getGlobalStore();
  if (store[REPORTING_CLIENT_SYMBOL]) {
    return store[REPORTING_CLIENT_SYMBOL] as ReportingClient;
  }

  const env = getEnv();
  if (!env.REPORTING_API_ENDPOINT) {
    store[REPORTING_CLIENT_SYMBOL] = null;
    return null;
  }

  const client = createGraphQLReportingRegistryClient({
    endpoint: env.REPORTING_API_ENDPOINT,
    tenantId: env.REPORTING_API_TENANT_ID ?? env.TENANT_ID,
    fetchImpl: fetch,
  });
  store[REPORTING_CLIENT_SYMBOL] = client;
  return client;
}

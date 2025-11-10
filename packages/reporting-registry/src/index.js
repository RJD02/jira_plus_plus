export class InMemoryReportingRegistry {
    reports = new Map();
    constructor(seed = []) {
        seed.forEach((report) => this.reports.set(report.id, report));
    }
    async listReports() {
        return Array.from(this.reports.values());
    }
    async runReport(options) {
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
    async createReportDefinition(input) {
        const id = `local-${Date.now()}`;
        const record = {
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
    async createReportVersion(_input) {
        return {
            id: `local-version-${Date.now()}`,
            status: "DRAFT",
            publishedAt: null,
        };
    }
    async publishReportVersion(_reportVersionId) {
        throw new Error("Not implemented in InMemoryReportingRegistry");
    }
    async listRuns() {
        return [];
    }
}
async function graphQLFetch(endpoint, body, headers, fetchImpl) {
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
    return payload.data;
}
export class GraphQLReportingRegistryClient {
    endpoint;
    fetchImpl;
    headers;
    constructor(options) {
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
    async listReports() {
        const data = await graphQLFetch(this.endpoint, {
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
        }, this.headers, this.fetchImpl);
        return data.reportDefinitions ?? [];
    }
    async runReport(options) {
        const data = await graphQLFetch(this.endpoint, {
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
        }, this.headers, this.fetchImpl);
        return {
            metadata: {
                runId: data.runReportVersion.id,
                filters: options.filters ?? {},
            },
        };
    }
    async createReportDefinition(input) {
        const data = await graphQLFetch(this.endpoint, {
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
        }, this.headers, this.fetchImpl);
        return data.createReportDefinition;
    }
    async createReportVersion(input) {
        const data = await graphQLFetch(this.endpoint, {
            query: `mutation RegistryCreateVersion($input: CreateReportVersionInput!) {
          createReportVersion(input: $input) {
            id
            status
            publishedAt
          }
        }`,
            variables: { input },
        }, this.headers, this.fetchImpl);
        return data.createReportVersion;
    }
    async publishReportVersion(reportVersionId) {
        const data = await graphQLFetch(this.endpoint, {
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
        }, this.headers, this.fetchImpl);
        return data.publishReportVersion;
    }
    async listRuns(filter) {
        const data = await graphQLFetch(this.endpoint, {
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
        }, this.headers, this.fetchImpl);
        return data.reportRuns ?? [];
    }
}
export function createGraphQLReportingRegistryClient(options) {
    return new GraphQLReportingRegistryClient(options);
}

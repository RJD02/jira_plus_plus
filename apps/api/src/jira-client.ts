import { GraphQLError } from "graphql";
import type { PrismaClient, JiraSite } from "@platform/cdm";
import { decryptSecret } from "./auth.js";
import { classifyJiraError, type JiraErrorClassification } from "./jira/errorClassifier.js";

export interface JiraSiteAuth {
  site: JiraSite;
  token: string;
}

export async function resolveSiteAuth(
  prisma: PrismaClient,
  tenantId: string,
  siteId: string,
): Promise<JiraSiteAuth> {
  const site = await prisma.jiraSite.findFirst({
    where: { id: siteId, tenantId },
  });

  if (!site) {
    throw new GraphQLError("Jira site not found", {
      extensions: { code: "BAD_USER_INPUT" },
    });
  }

  const token = decryptSecret(site.tokenCipher);

  return { site, token };
}

function buildAuthHeaders(email: string, token: string) {
  const basic = Buffer.from(`${email}:${token}`).toString("base64");
  return {
    Authorization: `Basic ${basic}`,
    Accept: "application/json",
    "Content-Type": "application/json",
  };
}

export interface JiraProjectOption {
  id: string;
  key: string;
  name: string;
  projectTypeKey?: string | null;
  lead?: string | null;
}

export interface JiraUserOption {
  accountId: string;
  displayName: string;
  email?: string | null;
  avatarUrl?: string | null;
}

export async function fetchJiraProjectOptions(
  prisma: PrismaClient,
  tenantId: string,
  siteId: string,
): Promise<JiraProjectOption[]> {
  const { site, token } = await resolveSiteAuth(prisma, tenantId, siteId);

  let response: Response;
  try {
    response = await fetch(
      `${site.baseUrl.replace(/\/$/, "")}/rest/api/3/project/search?expand=lead&maxResults=100`,
      {
        headers: buildAuthHeaders(site.adminEmail, token),
      },
    );
  } catch (error) {
    throw new GraphQLError("Unable to reach the Jira API. Check network connectivity.", {
      extensions: { code: "BAD_GATEWAY" },
    });
  }

  if (!response.ok) {
    throw new GraphQLError("Failed to fetch Jira projects. Verify credentials and permissions.", {
      extensions: { code: "BAD_REQUEST" },
    });
  }

  const data = (await response.json()) as {
    values?: Array<{
      id: string;
      key: string;
      name: string;
      projectTypeKey?: string;
      lead?: { displayName?: string | null };
    }>;
  };

  return (data.values ?? []).map((project) => ({
    id: project.id,
    key: project.key,
    name: project.name,
    projectTypeKey: project.projectTypeKey ?? null,
    lead: project.lead?.displayName ?? null,
  }));
}

export async function fetchJiraProjectUsers(
  prisma: PrismaClient,
  tenantId: string,
  siteId: string,
  projectKey: string,
  options: { forceRefresh?: boolean } = {},
): Promise<JiraUserOption[]> {
  const normalizedKey = projectKey;

  if (!options.forceRefresh) {
    const cached = await prisma.jiraAssignableUser.findMany({
      where: { tenantId, siteId, projectKey: normalizedKey },
      orderBy: [{ displayName: "asc" as const }, { accountId: "asc" as const }],
    });
    if (cached.length) {
      return cached.map((user) => ({
        accountId: user.accountId,
        displayName: user.displayName ?? user.accountId,
        email: user.email ?? null,
        avatarUrl: user.avatarUrl ?? null,
      }));
    }
  }

  const { site, token } = await resolveSiteAuth(prisma, tenantId, siteId);

  const baseUrl = new URL(`${site.baseUrl.replace(/\/$/, "")}/rest/api/3/user/assignable/search`);
  baseUrl.searchParams.set("project", projectKey);

  const maxResults = 200;
  let startAt = 0;
  const users: JiraUserOption[] = [];

  for (;;) {
    const pageUrl = new URL(baseUrl);
    pageUrl.searchParams.set("maxResults", String(maxResults));
    pageUrl.searchParams.set("startAt", String(startAt));

    let response: Response;
    try {
      response = await fetch(pageUrl, {
        headers: buildAuthHeaders(site.adminEmail, token),
      });
    } catch {
      throw new GraphQLError("Unable to reach the Jira API. Check network connectivity.", {
        extensions: { code: "BAD_GATEWAY" },
      });
    }

    if (!response.ok) {
      throw new GraphQLError("Failed to fetch Jira users. Ensure the API token has read permissions.", {
        extensions: { code: "BAD_REQUEST" },
      });
    }

    const page = (await response.json()) as Array<{
      accountId: string;
      displayName: string;
      emailAddress?: string;
      avatarUrls?: Record<string, string>;
    }>;

    for (const user of page) {
      users.push({
        accountId: user.accountId,
        displayName: user.displayName,
        email: user.emailAddress ?? null,
        avatarUrl: user.avatarUrls?.["48x48"] ?? user.avatarUrls?.["24x24"] ?? null,
      });
    }

    if (page.length < maxResults) {
      break;
    }
    startAt += maxResults;
  }

  const accountIds = users.map((user) => user.accountId);

  if (accountIds.length === 0) {
    await prisma.jiraAssignableUser.deleteMany({
      where: { tenantId, siteId, projectKey: normalizedKey },
    });
  } else {
    await prisma.jiraAssignableUser.deleteMany({
      where: {
        tenantId,
        siteId,
        projectKey: normalizedKey,
        accountId: { notIn: accountIds },
      },
    });

    await Promise.all(
      users.map((user) =>
        prisma.jiraAssignableUser.upsert({
          where: {
            tenantId_siteId_projectKey_accountId: {
              tenantId,
              siteId,
              projectKey: normalizedKey,
              accountId: user.accountId,
            },
          },
          update: {
            displayName: user.displayName ?? null,
            email: user.email ?? null,
            avatarUrl: user.avatarUrl ?? null,
            fetchedAt: new Date(),
          },
          create: {
            tenantId,
            siteId,
            projectKey: normalizedKey,
            accountId: user.accountId,
            displayName: user.displayName ?? null,
            email: user.email ?? null,
            avatarUrl: user.avatarUrl ?? null,
          },
        }),
      ),
    );
  }

  return users.sort((a, b) => (a.displayName ?? a.accountId).localeCompare(b.displayName ?? b.accountId));
}

export interface JiraIssueSearchResponse {
  issues: Array<{
    id: string;
    key: string;
    fields: {
      summary?: string;
      status?: { name?: string } | null;
      priority?: { name?: string } | null;
      assignee?: {
        accountId?: string;
        displayName?: string;
        emailAddress?: string;
        avatarUrls?: Record<string, string>;
      } | null;
      updated?: string;
      created?: string;
    };
  }>;
  total: number;
  nextPageToken: string;
  isLast: boolean;
  maxResults: number;
}

export class JiraClientError extends Error {
  classification: JiraErrorClassification;

  constructor(classification: JiraErrorClassification, message?: string) {
    super(message ?? classification.message);
    this.name = "JiraClientError";
    this.classification = classification;
  }
}

interface JiraRequestParams {
  baseUrl: string;
  adminEmail: string;
  token: string;
}

function buildUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/$/, "")}${path}`;
}

async function performJiraRequest(
  url: string,
  init: RequestInit,
): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch (error) {
    const classification = classifyJiraError(
      null,
      {
        errorMessage: error instanceof Error ? error.message : "Network error contacting Jira",
      },
      "Network error contacting Jira",
    );
    throw new JiraClientError(classification);
  }
}

async function parseJson<T>(response: Response): Promise<T | null> {
  const text = await response.text();
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

export async function searchJiraIssues(params: JiraRequestParams & {
  jql: string;
  nextPageToken?: string;
  maxResults?: number;
}): Promise<JiraIssueSearchResponse> {
  const url = buildUrl(params.baseUrl, "/rest/api/3/search/jql");
  const payload = {
    method: "POST",
    headers: buildAuthHeaders(params.adminEmail, params.token),
    body: JSON.stringify({
      jql: params.jql,
      nextPageToken: params.nextPageToken,
      maxResults: params.maxResults ?? 100,
      fields: ["summary", "status", "priority", "assignee", "updated", "created"],
    }),
  };
  const response = await performJiraRequest(url, payload);

  if (!response.ok) {
    const body = await parseJson<{ errorCode?: string; errorMessage?: string }>(response);
    const classification = classifyJiraError(
      response.status,
      body,
      response.statusText || "Jira search failed",
    );
    throw new JiraClientError(classification);
  }

  const data = (await response.json()) as JiraIssueSearchResponse;
  return data;
}

export async function fetchJiraIssueDetail(params: JiraRequestParams & {
  issueIdOrKey: string;
  includeComments?: boolean;
  includeWorklogs?: boolean;
}): Promise<any> {
  const issueUrl = new URL(
    buildUrl(params.baseUrl, `/rest/api/3/issue/${encodeURIComponent(params.issueIdOrKey)}`),
  );
  issueUrl.searchParams.set("expand", "renderedFields,comment,changelog");
  issueUrl.searchParams.set("fields", "summary,status,priority,assignee,updated,created");

  const issueResponse = await performJiraRequest(issueUrl.toString(), {
    headers: buildAuthHeaders(params.adminEmail, params.token),
  });

  if (!issueResponse.ok) {
    const body = await parseJson<{ errorCode?: string; errorMessage?: string }>(issueResponse);
    const classification = classifyJiraError(
      issueResponse.status,
      body,
      issueResponse.statusText || "Failed to fetch issue details",
    );
    throw new JiraClientError(classification);
  }

  const detail = (await issueResponse.json()) as any;

  if (!detail.fields) {
    detail.fields = {};
  }

  if (params.includeComments ?? true) {
    const commentData = await fetchJiraIssueComments({
      baseUrl: params.baseUrl,
      adminEmail: params.adminEmail,
      token: params.token,
      issueIdOrKey: params.issueIdOrKey,
    });
    detail.fields.comment = commentData;
  }

  if (params.includeWorklogs ?? true) {
    const worklogData = await fetchJiraIssueWorklogs({
      baseUrl: params.baseUrl,
      adminEmail: params.adminEmail,
      token: params.token,
      issueIdOrKey: params.issueIdOrKey,
    });
    detail.fields.worklog = worklogData;
  }

  return detail;
}

export async function fetchJiraIssueComments(params: {
  baseUrl: string;
  adminEmail: string;
  token: string;
  issueIdOrKey: string;
}): Promise<{ comments: any[]; total: number; maxResults: number }> {
  const results: any[] = [];
  let startAt = 0;
  let total = 0;
  let maxResults = 0;

  // Jira paginates comments; request in batches to collect all entries.
  do {
    const url = new URL(
      `${params.baseUrl.replace(/\/$/, "")}/rest/api/3/issue/${encodeURIComponent(params.issueIdOrKey)}/comment`,
    );
    url.searchParams.set("startAt", String(startAt));
    url.searchParams.set("maxResults", "100");
    url.searchParams.set("expand", "renderedBody");

    const response = await performJiraRequest(url.toString(), {
      headers: buildAuthHeaders(params.adminEmail, params.token),
    });

    if (!response.ok) {
      const body = await parseJson<{ errorCode?: string; errorMessage?: string }>(response);
      const classification = classifyJiraError(
        response.status,
        body,
        response.statusText || "Failed to fetch comments",
      );
      throw new JiraClientError(classification);
    }

    const data = (await response.json()) as {
      comments: any[];
      total: number;
      maxResults: number;
    };

    if (Array.isArray(data.comments)) {
      results.push(...data.comments);
    }
    total = data.total ?? results.length;
    maxResults = data.maxResults ?? 100;
    startAt += data.comments?.length ?? 0;
  } while (startAt < total);

  return {
    comments: results,
    total,
    maxResults,
  };
}

export async function fetchJiraIssueWorklogs(params: {
  baseUrl: string;
  adminEmail: string;
  token: string;
  issueIdOrKey: string;
}): Promise<{ worklogs: any[]; total: number; maxResults: number }> {
  const results: any[] = [];
  let startAt = 0;
  let total = 0;
  let maxResults = 0;

  // Jira returns a maximum of 100 worklogs per request by default.
  do {
    const url = new URL(
      `${params.baseUrl.replace(/\/$/, "")}/rest/api/3/issue/${encodeURIComponent(params.issueIdOrKey)}/worklog`,
    );
    url.searchParams.set("startAt", String(startAt));
    url.searchParams.set("maxResults", "100");

    const response = await performJiraRequest(url.toString(), {
      headers: buildAuthHeaders(params.adminEmail, params.token),
    });

    if (!response.ok) {
      const body = await parseJson<{ errorCode?: string; errorMessage?: string }>(response);
      const classification = classifyJiraError(
        response.status,
        body,
        response.statusText || "Failed to fetch worklogs",
      );
      throw new JiraClientError(classification);
    }

    const data = (await response.json()) as {
      worklogs: any[];
      total: number;
      maxResults: number;
    };

    if (Array.isArray(data.worklogs)) {
      results.push(...data.worklogs);
    }
    total = data.total ?? results.length;
    maxResults = data.maxResults ?? 100;
    startAt += data.worklogs?.length ?? 0;
  } while (startAt < total);

  return {
    worklogs: results,
    total,
    maxResults,
  };
}

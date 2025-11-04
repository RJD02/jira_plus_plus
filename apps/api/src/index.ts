import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { URL } from "node:url";
import path from "node:path";
import { promises as fs } from "node:fs";
import { ApolloServer, HeaderMap } from "@apollo/server";
import { schema } from "./schema.js";
import { createContext } from "./context.js";
import { getEnv } from "./env.js";
import { seedAdminUser } from "./auth.js";
import {
  exportSummariesToPdf,
  exportSummariesToSlackPayload,
  generateSummariesForDate,
  generateSummaryForUser,
} from "./services/dailySummaryService.js";
import {
  PerformanceReviewError,
  buildPerformanceMetrics,
  comparePerformanceMetrics,
  generatePerformanceSummary,
  savePerformanceNote,
} from "./services/performanceReviewService.js";
import { ensureProjectSummaryAutomationSchedule } from "./services/projectSummaryAutomationService.js";

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function setCors(res: ServerResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

function sendJson(res: ServerResponse, statusCode: number, payload: unknown) {
  res.writeHead(statusCode, { "Content-Type": "application/json" });
  res.end(JSON.stringify(payload));
}

async function readBody(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}

async function bootstrap() {
  const env = getEnv();

  await seedAdminUser();
  try {
    await ensureProjectSummaryAutomationSchedule();
  } catch (error) {
    console.error("Failed to ensure project summary automation schedule", error);
  }

  const apollo = new ApolloServer({ schema });
  await apollo.start();

  const server = createServer(async (req, res) => {
    setCors(res);

    if ((req.method ?? "").toUpperCase() === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? `localhost:${env.PORT}`}`);

    try {
      if (url.pathname === "/healthz" || url.pathname === "/health") {
        sendJson(res, 200, { status: "ok", timestamp: new Date().toISOString() });
        return;
      }

      if (url.pathname === "/graphql") {
        await handleGraphQLRequest(req, res, url, apollo);
        return;
      }

      if (url.pathname === "/api/scrum/summaries" && (req.method ?? "").toUpperCase() === "GET") {
        await handleSummariesRequest(req, res, url);
        return;
      }

      if (url.pathname === "/api/scrum/generate" && (req.method ?? "").toUpperCase() === "POST") {
        await handleGenerateRequest(req, res);
        return;
      }

      if (url.pathname === "/api/scrum/export" && (req.method ?? "").toUpperCase() === "POST") {
        await handleExportRequest(req, res);
        return;
      }

      if (url.pathname === "/api/performance/metrics" && (req.method ?? "").toUpperCase() === "GET") {
        await handlePerformanceMetricsRequest(req, res, url);
        return;
      }

      if (url.pathname === "/api/performance/summary" && (req.method ?? "").toUpperCase() === "POST") {
        await handlePerformanceSummaryRequest(req, res);
        return;
      }

      if (url.pathname === "/api/performance/compare" && (req.method ?? "").toUpperCase() === "GET") {
        await handlePerformanceComparisonRequest(req, res, url);
        return;
      }

      if (url.pathname === "/api/performance/notes" && (req.method ?? "").toUpperCase() === "PUT") {
        await handlePerformanceNotesRequest(req, res);
        return;
      }

      sendJson(res, 404, { error: "Not Found" });
    } catch (error) {
      console.error("Unhandled request error", error);
      sendJson(res, 500, { error: "Internal server error" });
    }
  });

  server.listen(env.PORT, () => {
    /* eslint-disable no-console */
    console.log(`🚀 API ready at http://localhost:${env.PORT}/graphql`);
  });
}

async function handleGraphQLRequest(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
  apollo: ApolloServer,
) {
  let parsedBody: unknown;
  if ((req.method ?? "").toUpperCase() !== "GET") {
    const rawBody = await readBody(req);
    if (rawBody.length) {
      try {
        parsedBody = JSON.parse(rawBody.toString());
      } catch {
        sendJson(res, 400, { error: "Invalid JSON body" });
        return;
      }
    }
  }

  const headerMap = new HeaderMap();
  for (const [key, value] of Object.entries(req.headers)) {
    if (typeof value === "undefined") {
      continue;
    }
    headerMap.set(key, Array.isArray(value) ? value.join(", ") : value);
  }

  const response = await apollo.executeHTTPGraphQLRequest({
    httpGraphQLRequest: {
      method: req.method ?? "POST",
      headers: headerMap,
      search: url.search,
      body: parsedBody ?? null,
    },
    context: async () => createContext({ req }),
  });

  if (response.headers) {
    for (const [key, value] of response.headers) {
      res.setHeader(key, value);
    }
  }

  const statusCode = response.status ?? 200;

  if (response.body.kind === "complete") {
    res.writeHead(statusCode);
    res.end(response.body.string);
    return;
  }

  res.writeHead(statusCode);
  for await (const chunk of response.body.asyncIterator) {
    res.write(chunk);
  }
  res.end();
}

async function handleSummariesRequest(req: IncomingMessage, res: ServerResponse, url: URL) {
  const ctx = await createContext({ req });
  if (!ctx.user) {
    sendJson(res, 401, { error: "Authentication required" });
    return;
  }

  const dateParam = url.searchParams.get("date")?.trim() || todayIsoDate();
  const projectId = url.searchParams.get("projectId")?.trim();
  if (!projectId) {
    sendJson(res, 400, { error: "projectId is required" });
    return;
  }

  if (ctx.user.role !== "ADMIN") {
    const membership = await ctx.prisma.userProjectLink.count({
      where: { projectId, userId: ctx.user.id },
    });
    if (!membership) {
      sendJson(res, 403, { error: "You do not have access to this project" });
      return;
    }
  }

  const summaries = await generateSummariesForDate(ctx.prisma, dateParam, projectId);
  sendJson(res, 200, { date: dateParam, summaries });
}

async function handleGenerateRequest(req: IncomingMessage, res: ServerResponse) {
  const ctx = await createContext({ req });
  if (!ctx.user) {
    sendJson(res, 401, { error: "Authentication required" });
    return;
  }

  const rawBody = await readBody(req);
  let payload: Record<string, unknown> = {};
  if (rawBody.length) {
    try {
      payload = JSON.parse(rawBody.toString()) as Record<string, unknown>;
    } catch {
      sendJson(res, 400, { error: "Invalid JSON body" });
      return;
    }
  }

  const requestDate = typeof payload.date === "string" && payload.date ? payload.date : todayIsoDate();
  const projectId = typeof payload.projectId === "string" && payload.projectId ? payload.projectId : null;
  if (!projectId) {
    sendJson(res, 400, { error: "projectId is required" });
    return;
  }
  const targetUserId = typeof payload.userId === "string" && payload.userId ? payload.userId : null;

  if (targetUserId) {
    if (ctx.user.role !== "ADMIN" && ctx.user.id !== targetUserId) {
      sendJson(res, 403, { error: "Insufficient permissions" });
      return;
    }
    if (ctx.user.role !== "ADMIN") {
      const membership = await ctx.prisma.userProjectLink.count({
        where: { projectId, userId: ctx.user.id },
      });
      if (!membership) {
        sendJson(res, 403, { error: "You do not have access to this project" });
        return;
      }
    }
    const summary = await generateSummaryForUser(ctx.prisma, targetUserId, requestDate, projectId);
    sendJson(res, 200, { summary });
    return;
  }

  if (ctx.user.role !== "ADMIN") {
    sendJson(res, 403, { error: "Admin privileges required" });
    return;
  }

  const summaries = await generateSummariesForDate(ctx.prisma, requestDate, projectId);
  sendJson(res, 200, { summaries });
}

async function handleExportRequest(req: IncomingMessage, res: ServerResponse) {
  const ctx = await createContext({ req });
  if (!ctx.user) {
    sendJson(res, 401, { error: "Authentication required" });
    return;
  }
  if (ctx.user.role !== "ADMIN") {
    sendJson(res, 403, { error: "Admin privileges required" });
    return;
  }

  const rawBody = await readBody(req);
  let payload: Record<string, unknown> = {};
  if (rawBody.length) {
    try {
      payload = JSON.parse(rawBody.toString()) as Record<string, unknown>;
    } catch {
      sendJson(res, 400, { error: "Invalid JSON body" });
      return;
    }
  }

  const requestDate = typeof payload.date === "string" && payload.date ? payload.date : todayIsoDate();
  const projectId = typeof payload.projectId === "string" && payload.projectId ? payload.projectId : null;
  if (!projectId) {
    sendJson(res, 400, { error: "projectId is required" });
    return;
  }
  const target = typeof payload.target === "string" ? payload.target.toUpperCase() : "";

  if (target === "PDF") {
    const pdfPath = path.join(process.cwd(), "exports", `daily-scrum-${requestDate}.pdf`);
    await fs.mkdir(path.dirname(pdfPath), { recursive: true });
    const { path: generatedPath } = await exportSummariesToPdf(
      ctx.prisma,
      requestDate,
      projectId,
      pdfPath,
    );
    sendJson(res, 200, { success: true, message: "Daily scrum PDF generated", location: generatedPath });
    return;
  }

  if (target === "SLACK") {
    const { payload: slackPayload } = await exportSummariesToSlackPayload(
      ctx.prisma,
      requestDate,
      projectId,
    );
    const slackPath = path.join(process.cwd(), "exports", `daily-scrum-${requestDate}-slack.json`);
    await fs.mkdir(path.dirname(slackPath), { recursive: true });
    await fs.writeFile(slackPath, JSON.stringify(slackPayload, null, 2), "utf-8");
    sendJson(res, 200, { success: true, message: "Slack payload generated", location: slackPath });
    return;
  }

  sendJson(res, 400, { error: "Unsupported export target" });
}

async function handlePerformanceMetricsRequest(req: IncomingMessage, res: ServerResponse, url: URL) {
  const ctx = await createContext({ req });
  if (!ctx.user) {
    sendJson(res, 401, { error: "Authentication required" });
    return;
  }

  const projectId = url.searchParams.get("projectId")?.trim() ?? "";
  const trackedUserId = url.searchParams.get("trackedUserId")?.trim() ?? "";
  const start = url.searchParams.get("start")?.trim() || undefined;
  const end = url.searchParams.get("end")?.trim() || undefined;

  if (!projectId) {
    sendJson(res, 400, { error: "projectId is required" });
    return;
  }
  if (!trackedUserId) {
    sendJson(res, 400, { error: "trackedUserId is required" });
    return;
  }

  try {
    const metrics = await buildPerformanceMetrics(ctx.prisma, ctx.user, {
      projectId,
      trackedUserId,
      start,
      end,
    });
    sendJson(res, 200, { metrics });
  } catch (error) {
    if (error instanceof PerformanceReviewError) {
      sendJson(res, error.statusCode, { error: error.message });
      return;
    }
    throw error;
  }
}

async function handlePerformanceSummaryRequest(req: IncomingMessage, res: ServerResponse) {
  const ctx = await createContext({ req });
  if (!ctx.user) {
    sendJson(res, 401, { error: "Authentication required" });
    return;
  }

  const rawBody = await readBody(req);
  if (!rawBody.length) {
    sendJson(res, 400, { error: "Request body is required" });
    return;
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody.toString()) as Record<string, unknown>;
  } catch {
    sendJson(res, 400, { error: "Invalid JSON body" });
    return;
  }

  const projectId = typeof payload.projectId === "string" ? payload.projectId.trim() : "";
  const trackedUserId = typeof payload.trackedUserId === "string" ? payload.trackedUserId.trim() : "";
  const start = typeof payload.start === "string" ? payload.start.trim() : undefined;
  const end = typeof payload.end === "string" ? payload.end.trim() : undefined;

  if (!projectId) {
    sendJson(res, 400, { error: "projectId is required" });
    return;
  }
  if (!trackedUserId) {
    sendJson(res, 400, { error: "trackedUserId is required" });
    return;
  }

  try {
    const summary = await generatePerformanceSummary(ctx.prisma, ctx.user, {
      projectId,
      trackedUserId,
      start,
      end,
    });
    sendJson(res, 200, { summary });
  } catch (error) {
    if (error instanceof PerformanceReviewError) {
      sendJson(res, error.statusCode, { error: error.message });
      return;
    }
    throw error;
  }
}

async function handlePerformanceComparisonRequest(req: IncomingMessage, res: ServerResponse, url: URL) {
  const ctx = await createContext({ req });
  if (!ctx.user) {
    sendJson(res, 401, { error: "Authentication required" });
    return;
  }

  const projectId = url.searchParams.get("projectId")?.trim() ?? "";
  const trackedUserId = url.searchParams.get("trackedUserId")?.trim() ?? "";
  const currentStart = url.searchParams.get("currentStart")?.trim() || undefined;
  const currentEnd = url.searchParams.get("currentEnd")?.trim() || undefined;
  const compareStart = url.searchParams.get("compareStart")?.trim() || undefined;
  const compareEnd = url.searchParams.get("compareEnd")?.trim() || undefined;

  if (!projectId) {
    sendJson(res, 400, { error: "projectId is required" });
    return;
  }
  if (!trackedUserId) {
    sendJson(res, 400, { error: "trackedUserId is required" });
    return;
  }

  try {
    const comparison = await comparePerformanceMetrics(
      ctx.prisma,
      ctx.user,
      { projectId, trackedUserId, start: currentStart, end: currentEnd },
      { projectId, trackedUserId, start: compareStart, end: compareEnd },
    );
    sendJson(res, 200, { comparison });
  } catch (error) {
    if (error instanceof PerformanceReviewError) {
      sendJson(res, error.statusCode, { error: error.message });
      return;
    }
    throw error;
  }
}

async function handlePerformanceNotesRequest(req: IncomingMessage, res: ServerResponse) {
  const ctx = await createContext({ req });
  if (!ctx.user) {
    sendJson(res, 401, { error: "Authentication required" });
    return;
  }

  const rawBody = await readBody(req);
  if (!rawBody.length) {
    sendJson(res, 400, { error: "Request body is required" });
    return;
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody.toString()) as Record<string, unknown>;
  } catch {
    sendJson(res, 400, { error: "Invalid JSON body" });
    return;
  }

  const projectId = typeof payload.projectId === "string" ? payload.projectId.trim() : "";
  const trackedUserId = typeof payload.trackedUserId === "string" ? payload.trackedUserId.trim() : "";
  const start = typeof payload.start === "string" ? payload.start.trim() : undefined;
  const end = typeof payload.end === "string" ? payload.end.trim() : undefined;
  const markdown = typeof payload.markdown === "string" ? payload.markdown : null;

  if (!projectId) {
    sendJson(res, 400, { error: "projectId is required" });
    return;
  }
  if (!trackedUserId) {
    sendJson(res, 400, { error: "trackedUserId is required" });
    return;
  }
  if (markdown === null) {
    sendJson(res, 400, { error: "markdown is required" });
    return;
  }

  try {
    const note = await savePerformanceNote(ctx.prisma, ctx.user, {
      projectId,
      trackedUserId,
      start,
      end,
      markdown,
    });
    sendJson(res, 200, { note });
  } catch (error) {
    if (error instanceof PerformanceReviewError) {
      sendJson(res, error.statusCode, { error: error.message });
      return;
    }
    throw error;
  }
}

bootstrap().catch((error) => {
  console.error("Failed to start API server", error);
  process.exit(1);
});

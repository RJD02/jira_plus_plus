import { DateTime } from "luxon";
import type { PrismaClient } from "@platform/cdm";
import { sendCommunication } from "../communication/index.js";
import {
  fetchProjectSummaries,
  type ProjectDailySummaryRecord,
} from "../hierarchicalSummaryService.js";

interface NewsletterOptions {
  projectId?: string | null;
}

function resolveDate(input: Date | string | null | undefined): DateTime {
  if (!input) {
    return DateTime.utc().startOf("day");
  }
  if (input instanceof Date) {
    return DateTime.fromJSDate(input).toUTC().startOf("day");
  }
  const parsed = DateTime.fromISO(input, { zone: "utc" }).startOf("day");
  if (!parsed.isValid) {
    throw new Error("Invalid date provided for newsletter generation");
  }
  return parsed;
}

function collectRecipients(managerRecords: Array<{ email: string | null }>): string[] {
  return ['rishikesh.iitkgp@gmail.com']
  return managerRecords
    .map((user) => user.email?.trim())
    .filter((email): email is string => Boolean(email && email.length > 0));
}

type RawNarrativeVariant = { text?: unknown; generatedAt?: unknown } | null | undefined;

function resolveManagerNarrative(
  record: ProjectDailySummaryRecord,
): { text: string | null; generatedAt: string | null } {
  const { narrative, narrativeGeneratedAt, richNarratives } = record.projectSummary;
  if (richNarratives && typeof richNarratives === "object" && !Array.isArray(richNarratives)) {
    const managerVariant = (richNarratives as Record<string, RawNarrativeVariant>).manager;
    if (managerVariant && typeof managerVariant === "object" && !Array.isArray(managerVariant)) {
      const text = typeof managerVariant.text === "string" ? managerVariant.text : null;
      const generatedAt =
        typeof managerVariant.generatedAt === "string" ? managerVariant.generatedAt : null;
      if (text) {
        return { text, generatedAt };
      }
    }
  }

  if (typeof narrative === "string" && narrative.trim().length > 0) {
    return { text: narrative, generatedAt: narrativeGeneratedAt ?? null };
  }

  return { text: null, generatedAt: null };
}

function sanitizeInline(value: string): string {
  return value.replace(/[<>]/g, "");
}

function buildIssueLink(baseUrl: string | null, issueKey: string): string {
  if (!baseUrl) {
    return issueKey;
  }
  const trimmed = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
  const href = `${trimmed}/browse/${issueKey}`;
  return `<a href="${href}" style="color:#2563eb;text-decoration:none;">${issueKey}</a>`;
}

function renderUserBriefsHtml(record: ProjectDailySummaryRecord, baseUrl: string | null): string {
  const snapshots = [...record.userSummaries];
  if (!snapshots.length) {
    return "";
  }
  snapshots.sort((a, b) => (b.payload.activityMetrics.worklogMinutes ?? 0) - (a.payload.activityMetrics.worklogMinutes ?? 0));
  const top = snapshots.slice(0, 4);
  const items = top
    .map((snapshot) => {
      const name = snapshot.payload.identity.displayName ?? "Unassigned";
      const status = snapshot.payload.headline ?? "No headline captured.";
      const focus = snapshot.payload.focusNext?.trim();
      const hours = (snapshot.payload.activityMetrics.worklogMinutes ?? 0) / 60;
      const highlight = snapshot.payload.accomplishments?.[0]?.text ?? snapshot.payload.inFlight?.[0]?.note ?? null;
      const risk = snapshot.payload.riskFlags?.length ? snapshot.payload.riskFlags.map((flag) => flag.replace(/_/g, " ")).join(", ") : null;
      const taskKeys: string[] = [];
      if (snapshot.payload.accomplishments?.length) {
        const key = snapshot.payload.accomplishments[0]?.issueKey;
        if (key) taskKeys.push(key);
      }
      if (snapshot.payload.inFlight?.length) {
        const key = snapshot.payload.inFlight[0]?.issueKey;
        if (key) taskKeys.push(key);
      }
      const linkedTasks =
        taskKeys.length && baseUrl
          ? taskKeys
              .map((key) => buildIssueLink(baseUrl, key))
              .join(", ")
          : taskKeys.join(", ");
      return `
        <li style="margin-bottom:12px;">
          <div style="font-weight:600;color:#0f172a;">${sanitizeInline(name)}</div>
          <div style="font-size:12px;color:#475569;line-height:1.5;margin-top:4px;">${sanitizeInline(status)}</div>
          <div style="font-size:11px;color:#64748b;margin-top:4px;">
            ${hours > 0 ? `${hours.toFixed(1)}h logged` : "No recent hours"}${linkedTasks ? ` · ${linkedTasks}` : ""}
          </div>
          ${
            focus
              ? `<div style="font-size:11px;color:#1e3a8a;margin-top:4px;">Focus: ${sanitizeInline(focus)}</div>`
              : ""
          }
          ${
            highlight
              ? `<div style="font-size:11px;color:#0f172a;margin-top:4px;">Highlight: ${sanitizeInline(highlight)}</div>`
              : ""
          }
          ${
            risk
              ? `<div style="font-size:11px;color:#be123c;margin-top:4px;">Risks: ${sanitizeInline(risk)}</div>`
              : ""
          }
        </li>
      `;
    })
    .join("");
  return `
    <section style="margin:0 0 16px 0;">
      <h3 style="margin:0 0 6px 0;font-size:13px;color:#0f172a;">Team spotlights</h3>
      <ul style="margin:0;padding-left:18px;color:#334155;list-style:disc;">${items}</ul>
    </section>
  `;
}

function renderWorkloadChartHtml(record: ProjectDailySummaryRecord): string {
  const snapshots = [...record.userSummaries];
  if (!snapshots.length) {
    return "";
  }
  snapshots.sort((a, b) => (b.payload.activityMetrics.worklogMinutes ?? 0) - (a.payload.activityMetrics.worklogMinutes ?? 0));
  const top = snapshots.slice(0, 5);
  const maxMinutes = Math.max(...top.map((snapshot) => snapshot.payload.activityMetrics.worklogMinutes ?? 0), 1);
  const rows = top
    .map((snapshot) => {
      const name = snapshot.payload.identity.displayName ?? "Unassigned";
      const minutes = snapshot.payload.activityMetrics.worklogMinutes ?? 0;
      const hours = minutes / 60;
      const width = Math.round((minutes / maxMinutes) * 100);
      return `
        <tr>
          <td style="padding:6px 8px;font-size:12px;color:#334155;">${sanitizeInline(name)}</td>
          <td style="padding:6px 8px;">
            <div style="background:#e2e8f0;border-radius:9999px;height:8px;overflow:hidden;">
              <div style="width:${width}%;height:100%;background:#38bdf8;"></div>
            </div>
          </td>
          <td style="padding:6px 0 6px 8px;font-size:12px;color:#0f172a;">${hours.toFixed(1)}h</td>
        </tr>
      `;
    })
    .join("");
  return `
    <section style="margin:0 0 16px 0;">
      <h3 style="margin:0 0 6px 0;font-size:13px;color:#0f172a;">Workload distribution</h3>
      <table style="width:100%;border-collapse:collapse;font-size:12px;background:#f8fafc;border-radius:12px;overflow:hidden;">
        <tbody>
          ${rows}
        </tbody>
      </table>
    </section>
  `;
}

function renderProjectHtml(record: ProjectDailySummaryRecord, baseUrl: string | null): string {
  const payload = record.projectSummary.payload;
  const project = record.projectSummary;
  const team = payload.teamHealthSnapshot;
  const dateLabel = DateTime.fromISO(project.summaryDate).toFormat("DDD");
  const narrative = resolveManagerNarrative(record);
  const narrativeHtml = narrative.text ? sanitizeInline(narrative.text) : null;

  const highlights = payload.topHighlights
    .map(
      (item) =>
        `<li><strong>${buildIssueLink(baseUrl, item.issueKey)}</strong>: ${item.text.replace(/[<>]/g, "")}</li>`,
    )
    .join("");
  const blockers = payload.criticalBlockers
    .map(
      (item) =>
        `<li><strong>${buildIssueLink(baseUrl, item.issueKey)}</strong> (${item.severity.toUpperCase()}): ${item.description.replace(/[<>]/g, "")}</li>`,
    )
    .join("");
  const calls = payload.callsToAction
    .map(
      (item) =>
        `<li><strong>${item.severity.toUpperCase()}</strong>: ${item.text.replace(/[<>]/g, "")}</li>`,
    )
    .join("");
  const risks = payload.atRiskDetails
    .map(
      (item) =>
        `<li><strong>${buildIssueLink(baseUrl, item.issueKey)}</strong> (${item.severity.toUpperCase()}): ${item.reason.replace(/[<>]/g, "")}</li>`,
    )
    .join("");

  return `
    <section style="margin:0 0 32px 0;">
      <header style="margin-bottom:12px;">
        <h2 style="margin:0;font-size:18px;color:#0f172a;">${sanitizeInline(record.projectSummary.projectName ?? payload.projectId)}</h2>
        <p style="margin:4px 0 0 0;font-size:12px;color:#64748b;">${dateLabel} · Snapshot ${project.runId.slice(0, 8)}</p>
      </header>
      <p style="font-size:14px;line-height:20px;color:#334155;margin:0 0 16px 0;">${payload.executiveBrief}</p>
      ${
        narrativeHtml
          ? `<div style="margin:0 0 16px 0;padding:16px;border-radius:12px;background:#eff6ff;border:1px solid #bfdbfe;color:#1e3a8a;font-size:14px;line-height:20px;">
          <strong style="display:block;margin-bottom:6px;">Manager narrative</strong>
          ${narrativeHtml}
        </div>`
          : ""
      }
      <table style="width:100%;border-collapse:collapse;margin:0 0 16px 0;font-size:12px;">
        <thead>
          <tr>
            <th style="text-align:left;padding:8px;background:#f8fafc;border:1px solid #e2e8f0;">Active</th>
            <th style="text-align:left;padding:8px;background:#f8fafc;border:1px solid #e2e8f0;">Idle</th>
            <th style="text-align:left;padding:8px;background:#f8fafc;border:1px solid #e2e8f0;">Out</th>
            <th style="text-align:left;padding:8px;background:#f8fafc;border:1px solid #e2e8f0;">Hours</th>
            <th style="text-align:left;padding:8px;background:#f8fafc;border:1px solid #e2e8f0;">Done</th>
            <th style="text-align:left;padding:8px;background:#f8fafc;border:1px solid #e2e8f0;">Blockers</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style="padding:8px;border:1px solid #e2e8f0;">${team.activeUsers}/${team.trackedUsers}</td>
            <td style="padding:8px;border:1px solid #e2e8f0;">${team.idleUsers} (${Math.round(team.idleRate * 100)}%)</td>
            <td style="padding:8px;border:1px solid #e2e8f0;">${team.offlineUsers}</td>
            <td style="padding:8px;border:1px solid #e2e8f0;">${(team.totalWorklogMinutes / 60).toFixed(1)}h</td>
            <td style="padding:8px;border:1px solid #e2e8f0;">${team.doneCount}</td>
            <td style="padding:8px;border:1px solid #e2e8f0;">${team.blockerCount} (${Math.round(team.blockerRate * 100)}%)</td>
          </tr>
        </tbody>
      </table>
      ${
        highlights
          ? `<section style="margin:0 0 16px 0;">
          <h3 style="margin:0 0 6px 0;font-size:13px;color:#0f172a;">Highlights</h3>
          <ul style="margin:0;padding-left:18px;color:#475569;">${highlights}</ul>
        </section>`
          : ""
      }
      ${
        blockers
          ? `<section style="margin:0 0 16px 0;">
          <h3 style="margin:0 0 6px 0;font-size:13px;color:#b91c1c;">Critical Blockers</h3>
          <ul style="margin:0;padding-left:18px;color:#991b1b;">${blockers}</ul>
        </section>`
          : ""
      }
      ${
        calls
          ? `<section style="margin:0 0 16px 0;">
          <h3 style="margin:0 0 6px 0;font-size:13px;color:#c2410c;">Calls to Action</h3>
          <ul style="margin:0;padding-left:18px;color:#9a3412;">${calls}</ul>
        </section>`
          : ""
      }
      ${
        risks
          ? `<section style="margin:0;">
          <h3 style="margin:0 0 6px 0;font-size:13px;color:#be123c;">At Risk</h3>
          <ul style="margin:0;padding-left:18px;color:#be123c;">${risks}</ul>
        </section>`
          : ""
      }
      ${renderUserBriefsHtml(record, baseUrl)}
      ${renderWorkloadChartHtml(record)}
    </section>
  `;
}

function renderProjectText(record: ProjectDailySummaryRecord, baseUrl: string | null): string {
  const payload = record.projectSummary.payload;
  const team = payload.teamHealthSnapshot;
  const narrative = resolveManagerNarrative(record);
  const trimmedBaseUrl = baseUrl ? baseUrl.replace(/\/+$/, "") : null;
  const summaryLines: string[] = [];
  summaryLines.push(`Project ${payload.projectId}`);
  summaryLines.push(`Executive: ${payload.executiveBrief}`);
  summaryLines.push(
    `Team: ${team.activeUsers}/${team.trackedUsers} active, ${team.idleUsers} idle, ${team.offlineUsers} out`,
  );
  summaryLines.push(
    `Hours ${ (team.totalWorklogMinutes / 60).toFixed(1) }h · Done ${team.doneCount} · Blockers ${team.blockerCount}`,
  );
  if (narrative.text) {
    summaryLines.push("Narrative:");
    summaryLines.push(`  ${narrative.text.replace(/\s+/g, " ").trim()}`);
  }
  if (payload.topHighlights.length) {
    summaryLines.push(
      "Highlights:",
      ...payload.topHighlights.map((item) => {
        const link = trimmedBaseUrl ? `${trimmedBaseUrl}/browse/${item.issueKey}` : null;
        return `  - ${item.issueKey}: ${item.text}${link ? ` (${link})` : ""}`;
      }),
    );
  }
  if (payload.criticalBlockers.length) {
    summaryLines.push(
      "Blockers:",
      ...payload.criticalBlockers.map((item) => {
        const link = trimmedBaseUrl ? `${trimmedBaseUrl}/browse/${item.issueKey}` : null;
        return `  - ${item.issueKey} (${item.severity}): ${item.description}${link ? ` (${link})` : ""}`;
      }),
    );
  }
  if (payload.callsToAction.length) {
    summaryLines.push(
      "Calls to action:",
      ...payload.callsToAction.map((item) => `  - ${item.severity}: ${item.text}`),
    );
  }
  if (payload.atRiskDetails.length) {
    summaryLines.push(
      "At risk:",
      ...payload.atRiskDetails.map((item) => {
        const link = trimmedBaseUrl ? `${trimmedBaseUrl}/browse/${item.issueKey}` : null;
        return `  - ${item.issueKey} (${item.severity}): ${item.reason}${link ? ` (${link})` : ""}`;
      }),
    );
  }
  const snapshots = [...record.userSummaries];
  if (snapshots.length) {
    snapshots.sort((a, b) => (b.payload.activityMetrics.worklogMinutes ?? 0) - (a.payload.activityMetrics.worklogMinutes ?? 0));
    summaryLines.push("Team spotlights:");
    summaryLines.push(
      ...snapshots.slice(0, 4).map((snapshot) => {
        const name = snapshot.payload.identity.displayName ?? "Unassigned";
        const headline = snapshot.payload.headline ?? "No headline captured.";
        const hours = ((snapshot.payload.activityMetrics.worklogMinutes ?? 0) / 60).toFixed(1);
        return `  - ${name}: ${headline} (${hours}h)`;
      }),
    );
  }
  return summaryLines.join("\n");
}

export async function sendDailySummaryNewsletter(
  prisma: PrismaClient,
  tenantId: string,
  dateInput: Date | string,
  options: NewsletterOptions = {},
): Promise<void> {
  const date = resolveDate(dateInput);
  const isoDate = date.toISODate();
  if (!isoDate) {
    throw new Error("Unable to resolve newsletter date");
  }

  const projects = options.projectId
    ? await prisma.jiraProject.findMany({
        where: { id: options.projectId, tenantId },
        include: { site: { select: { baseUrl: true } } },
      })
    : await prisma.jiraProject.findMany({
        where: { tenantId, isActive: true },
        orderBy: { name: "asc" },
        include: { site: { select: { baseUrl: true } } },
      });

  if (!projects.length) {
    console.warn("[Newsletter] No projects available for newsletter generation.");
    return;
  }

  const managers = await prisma.user.findMany({
    where: { tenantId, role: "MANAGER" },
    select: { email: true },
    orderBy: { displayName: "asc" },
  });
  const recipients = collectRecipients(managers);
  if (!recipients.length) {
    console.warn("[Newsletter] No manager recipients resolved; skipping send.");
    return;
  }

  const sectionsHtml: string[] = [];
  const sectionsText: string[] = [];

  for (const project of projects) {
    const summaries = await fetchProjectSummaries(prisma, project.id, { start: isoDate, end: isoDate }, false);
    const record = summaries[0];
    if (!record) {
      continue;
    }
    const baseUrl = project.site?.baseUrl ?? null;
    sectionsHtml.push(renderProjectHtml(record, baseUrl));
    sectionsText.push(renderProjectText(record, baseUrl));
  }

  if (!sectionsHtml.length) {
    console.warn("[Newsletter] No project summaries found for newsletter date", { isoDate });
    return;
  }

  const subject = `Daily Stand-up Brief — ${DateTime.fromISO(isoDate).toFormat("DDD")}`;
  const headerHtml = `
    <div style="padding:16px;background:#0f172a;color:#e2e8f0;border-radius:12px 12px 0 0;">
      <h1 style="margin:0;font-size:20px;">Jira++ Daily Brief</h1>
      <p style="margin:8px 0 0 0;font-size:12px;letter-spacing:0.04em;text-transform:uppercase;">${DateTime.fromISO(isoDate).toFormat("DDD")}</p>
    </div>
  `;
  const footerHtml = `
    <footer style="margin-top:24px;padding:16px;border-top:1px solid #e2e8f0;font-size:11px;color:#94a3b8;">
      Sent automatically by Jira++ · Manage preferences in the admin console.
    </footer>
  `;
  const htmlBody = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f8fafc;padding:24px;">
      <div style="max-width:720px;margin:0 auto;background:#ffffff;border-radius:16px;box-shadow:0 10px 30px rgba(15,23,42,0.08);overflow:hidden;">
        ${headerHtml}
        <div style="padding:24px;">
          ${sectionsHtml.join('<hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0;" />')}
        </div>
        ${footerHtml}
      </div>
    </div>
  `;
  const textBody = sectionsText.join("\n\n---\n\n");

  await sendCommunication({
    payload: {
      to: recipients,
      subject,
      text: textBody,
      html: htmlBody,
    },
  });
}

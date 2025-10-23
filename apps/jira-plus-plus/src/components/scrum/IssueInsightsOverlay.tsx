import { useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import { AlertCircle, ExternalLink, Link2, MessageSquareText, Clock3, FlagTriangleRight } from "lucide-react";
import type {
  DailySummaryRecord,
  DailySummaryWorkItem,
  InsightSignal,
  IssueInsight,
  IssueLinkRef,
} from "../../types/scrum";

interface IssueInsightsOverlayProps {
  open: boolean;
  summary: DailySummaryRecord | null;
  initialIssueId: string | null;
  insights?: Record<string, IssueInsight>;
  loadingIssueId?: string | null;
  insightsLoading?: boolean;
  onRequestInsight?: (issueId: string) => void;
  onClose: () => void;
}

interface FlattenedWorkItem {
  issue: DailySummaryWorkItem["issue"];
  groupStatus: string;
  totalWorklogHours: number;
  recentWorklogs: DailySummaryWorkItem["recentWorklogs"];
  recentComments: DailySummaryWorkItem["recentComments"];
}

const SEVERITY_META: Record<string, { label: string; className: string }> = {
  LOW: { label: "Low", className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200" },
  MEDIUM: { label: "Medium", className: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-200" },
  HIGH: { label: "High", className: "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-200" },
};

export function IssueInsightsOverlay({
  open,
  summary,
  initialIssueId,
  insights,
  loadingIssueId,
  insightsLoading,
  onRequestInsight,
  onClose,
}: IssueInsightsOverlayProps) {
  const flattenedItems = useMemo<FlattenedWorkItem[]>(() => {
    if (!summary) return [];
    return summary.workItems.flatMap((group) =>
      group.items.map((item) => ({
        issue: item.issue,
        groupStatus: group.status,
        totalWorklogHours: item.totalWorklogHours,
        recentWorklogs: item.recentWorklogs,
        recentComments: item.recentComments,
      })),
    );
  }, [summary]);

  const [activeIssueId, setActiveIssueId] = useState<string | null>(initialIssueId);

  useEffect(() => {
    if (!summary) {
      setActiveIssueId(null);
      return;
    }
    if (initialIssueId) {
      setActiveIssueId(initialIssueId);
      return;
    }
    const first = flattenedItems[0]?.issue.id ?? null;
    setActiveIssueId(first);
  }, [summary, initialIssueId, flattenedItems]);

  

  const activeItem = flattenedItems.find((item) => item.issue.id === activeIssueId) ?? flattenedItems[0] ?? null;
  const fallbackInsight =
    (activeItem?.issue as unknown as { insight?: IssueInsight | null } | null)?.insight ?? null;
  const activeInsight =
    (activeItem && insights ? insights[activeItem.issue.id] : null) ?? fallbackInsight;
  const isInsightLoading =
    Boolean(insightsLoading) && !!loadingIssueId && loadingIssueId === activeItem?.issue.id;

  useEffect(() => {
    if (!open || !activeIssueId) {
      return;
    }
    onRequestInsight?.(activeIssueId);
  }, [activeIssueId, onRequestInsight, open]);

  const handleSelectIssue = (issueId: string) => {
    setActiveIssueId(issueId);
    onRequestInsight?.(issueId);
  };

  if (!open) {
    return null;
  }
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/50 px-4 py-6 sm:items-center">
      <div className="relative flex h-[90vh] w-full max-w-6xl flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-xl dark:border-slate-800 dark:bg-slate-950">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 dark:border-slate-800">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Ticket Insights
          </h2>
          <button
            type="button"
            className="rounded-full border border-transparent p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
            onClick={onClose}
          >
            <span className="sr-only">Close insights overlay</span>
            ×
          </button>
        </div>
        <div className="flex flex-1 flex-col overflow-hidden md:grid md:grid-cols-[280px_1fr]">
          <aside className="border-b border-slate-200 bg-slate-50/80 p-4 dark:border-slate-800 dark:bg-slate-900/40 md:border-b-0 md:border-r">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Issues
            </h3>
            <div className="space-y-2 overflow-y-auto pr-1" style={{ maxHeight: "calc(90vh - 8rem)" }}>
              {flattenedItems.map((item) => (
                <button
                  key={item.issue.id}
                  type="button"
                  className={clsx(
                    "w-full rounded-2xl border px-3 py-2 text-left text-sm transition",
                    item.issue.id === activeIssueId
                      ? "border-sky-400 bg-sky-50 dark:border-sky-600 dark:bg-sky-900/30"
                      : "border-slate-200 bg-white hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900/50 dark:hover:border-slate-700",
                  )}
                  onClick={() => handleSelectIssue(item.issue.id)}
                >
                  <div className="flex items-center justify-between text-xs text-slate-400 dark:text-slate-500">
                    <span>{item.groupStatus}</span>
                    {item.totalWorklogHours > 0 ? <span>{item.totalWorklogHours.toFixed(1)}h</span> : null}
                  </div>
                  <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {item.issue.key}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{item.issue.summary ?? "No summary"}</p>
                </button>
              ))}
              {!flattenedItems.length ? (
                <div className="rounded-2xl border border-dashed border-slate-200 p-3 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
                  No Jira issues captured for this teammate.
                </div>
              ) : null}
            </div>
          </aside>
          <section className="flex-1 overflow-y-auto px-6 py-6 text-sm text-slate-600 dark:text-slate-300">
            {activeItem ? (
              <TicketInsightsContent
                item={activeItem}
                insight={activeInsight}
                loading={isInsightLoading}
              />
            ) : (
              <div className="flex h-full items-center justify-center text-slate-500 dark:text-slate-400">
                Select an issue to view its insights.
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

function TicketInsightsContent({
  item,
  insight,
  loading,
}: {
  item: FlattenedWorkItem;
  insight: IssueInsight | null;
  loading: boolean;
}) {
  const issue = item.issue;
  const sentimentLabel = insight?.sentiment?.label ?? "neutral";
  const sentimentScore = insight?.sentiment?.score ?? 0;
  const sentimentProvider = insight?.sentiment?.provider ?? "heuristic";
  const summaryText = insight?.summary?.text ?? (loading ? "Loading AI summary…" : "No AI summary available yet for this issue.");

  const extractedLinks = useMemo(() => {
    const links = new Set<string>();
    const cleaner = (value?: string | null) => {
      if (!value) return;
      const matches = value.match(/https?:\/\/[\w.-]+(?:\/[\w\-./?%&=]*)?/gi);
      matches?.forEach((match) => links.add(match));
    };
    item.recentComments.forEach((comment) => cleaner(comment.body));
    return Array.from(links);
  }, [item.recentComments]);

  const showLinksIn = (issue.linksIn ?? []).filter((link) => !!link.source);
  const showLinksOut = (issue.linksOut ?? []).filter((link) => !!link.target);

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-3">
          <span className="rounded-full bg-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            {issue.status}
          </span>
          {issue.priority ? (
            <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700 dark:bg-amber-900/40 dark:text-amber-200">
              {issue.priority}
            </span>
          ) : null}
          {issue.statusCategory ? (
            <span className="rounded-full bg-sky-100 px-3 py-1 text-xs font-semibold text-sky-700 dark:bg-sky-900/40 dark:text-sky-200">
              {issue.statusCategory}
            </span>
          ) : null}
        </div>
        <h3 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
          {issue.key} · {issue.summary ?? "No summary"}
        </h3>
        <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
          <span>Updated {new Date(issue.jiraUpdatedAt).toLocaleString()}</span>
          {issue.project ? <span>{issue.project.key} · {issue.project.name}</span> : null}
          {issue.browseUrl ? (
            <a
              href={issue.browseUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-sky-600 hover:underline dark:text-sky-300"
            >
              <ExternalLink className="h-3 w-3" /> View in Jira
            </a>
          ) : null}
        </div>
      </header>

      <section className="grid gap-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
          Details
        </h4>
        <dl className="grid gap-3 sm:grid-cols-2">
          <DetailRow label="Assignee" value={issue.assignee?.displayName ?? "Unassigned"} />
          <DetailRow label="Reporter" value={issue.reporter?.displayName ?? "Unknown"} />
          <DetailRow label="Due date" value={issue.dueDate ? new Date(issue.dueDate).toLocaleDateString() : "Not set"} />
          <DetailRow label="Started" value={issue.startedAt ? new Date(issue.startedAt).toLocaleDateString() : "—"} />
          <DetailRow label="Resolved" value={issue.resolvedAt ? new Date(issue.resolvedAt).toLocaleDateString() : "—"} />
          <DetailRow
            label="Parent"
            value={issue.parent ? `${issue.parent.key} · ${issue.parent.summary ?? ""}` : "—"}
          />
        </dl>
      </section>

      <section className="grid gap-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
              Insights
            </h4>
            {loading ? (
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Computing latest insight…</p>
            ) : insight ? (
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                Provider: {insight.summary?.provider ?? "rule_based"} · Sentiment ({sentimentProvider}) = {sentimentLabel} (
                {sentimentScore.toFixed(2)})
              </p>
            ) : (
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                No cached insight cached yet. Reopen this panel to compute on demand.
              </p>
            )}
          </div>
          <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-200">
            Escalation score {(insight?.escalateScore ?? 0).toFixed(2)}
          </div>
        </div>
        <p className="text-base leading-relaxed text-slate-700 dark:text-slate-200">
          {summaryText}
        </p>
        <SignalList signals={insight?.signals ?? []} />
      </section>

      <section className="grid gap-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
          Activity
        </h4>
        <div className="grid gap-4 md:grid-cols-2">
          <ActivityCard
            title="Recent comments"
            icon={MessageSquareText}
            emptyLabel="No comments in the last day"
            entries={item.recentComments.map((comment) => ({
              id: comment.id,
              title: comment.author.displayName,
              body: comment.body,
              timestamp: comment.jiraCreatedAt,
            }))}
          />
          <ActivityCard
            title="Recent worklogs"
            icon={Clock3}
            emptyLabel="No worklogs in the last day"
            entries={item.recentWorklogs.map((log) => ({
              id: log.id,
              title: `${formatHours(log.timeSpent ?? 0)} · ${log.author.displayName}`,
              body: log.description ?? "No description",
              timestamp: log.jiraStartedAt,
            }))}
          />
        </div>
      </section>

      <section className="grid gap-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
          Links & Dependencies
        </h4>
        <div className="space-y-3">
          <LinkList label="Linked outward" icon={Link2} links={showLinksOut} direction="out" />
          <LinkList label="Linked inward" icon={Link2} links={showLinksIn} direction="in" />
          <ExternalUrlList label="Extracted URLs" links={extractedLinks} />
        </div>
      </section>

      <section className="grid gap-3 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
          Sources
        </h4>
        <ul className="space-y-2 text-sm">
          {issue.browseUrl ? (
            <li>
              <a
                href={issue.browseUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 text-sky-600 hover:underline dark:text-sky-300"
              >
                <ExternalLink className="h-4 w-4" />
                {issue.browseUrl}
              </a>
            </li>
          ) : (
            <li className="text-slate-500 dark:text-slate-400">Browse URL not available.</li>
          )}
          {issue.project ? (
            <li className="text-slate-500 dark:text-slate-400">
              Project context: {issue.project.key} · {issue.project.name}
            </li>
          ) : null}
          <li className="text-slate-500 dark:text-slate-400">
            Status updated {new Date(issue.jiraUpdatedAt).toLocaleString()} · {item.totalWorklogHours.toFixed(1)}h logged in this cycle.
          </li>
        </ul>
      </section>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs uppercase tracking-wide text-slate-400 dark:text-slate-500">{label}</span>
      <span className="text-sm text-slate-700 dark:text-slate-200">{value}</span>
    </div>
  );
}

function SignalList({ signals }: { signals: InsightSignal[] }) {
  if (!signals.length) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 p-4 text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900/40 dark:text-slate-400">
        No escalation signals detected for this issue.
      </div>
    );
  }

  return (
    <ul className="space-y-3">
      {signals.map((signal) => {
        const meta = SEVERITY_META[signal.severity] ?? SEVERITY_META.LOW;
        return (
          <li
            key={`${signal.type}-${signal.detail}`}
            className="rounded-2xl border border-slate-200 bg-slate-50/70 p-3 dark:border-slate-800 dark:bg-slate-900/40"
          >
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
              <AlertCircle className="h-4 w-4 text-rose-500" />
              <span>{signal.type}</span>
              <span className={clsx("rounded-full px-2 py-0.5 text-xs font-semibold", meta.className)}>
                {meta.label}
              </span>
            </div>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{signal.detail}</p>
            {signal.metadata ? (
              <pre className="mt-2 overflow-x-auto rounded-xl bg-slate-900/80 p-2 text-xs text-slate-200 dark:bg-slate-900/50">
                {JSON.stringify(signal.metadata, null, 2)}
              </pre>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

function ActivityCard({
  title,
  icon: Icon,
  entries,
  emptyLabel,
}: {
  title: string;
  icon: typeof MessageSquareText;
  entries: Array<{ id: string; title: string; body: string; timestamp: string }>;
  emptyLabel: string;
}) {
  if (!entries.length) {
    return (
      <div className="flex min-h-[160px] flex-col justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 p-4 text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-900/40 dark:text-slate-400">
        <p className="text-center">{emptyLabel}</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <h5 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
        <Icon className="h-4 w-4" />
        {title}
      </h5>
      <ul className="space-y-2">
        {entries.map((entry) => (
          <li key={entry.id} className="rounded-2xl border border-slate-200 bg-white/80 p-3 dark:border-slate-800 dark:bg-slate-900/40">
            <p className="font-medium text-slate-800 dark:text-slate-200">{entry.title}</p>
            <p className="text-sm text-slate-600 dark:text-slate-400">{entry.body}</p>
            <p className="text-xs text-slate-400 dark:text-slate-500">{new Date(entry.timestamp).toLocaleString()}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

function LinkList({
  label,
  icon: Icon,
  links,
  direction,
}: {
  label: string;
  icon: typeof Link2;
  links: IssueLinkRef[];
  direction: "in" | "out";
}) {
  if (!links.length) {
    return null;
  }

  return (
    <div className="space-y-2">
      <h5 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
        <Icon className="h-4 w-4" />
        {label}
      </h5>
      <ul className="space-y-2 text-sm">
        {links.map((link) => {
          const related = direction === "out" ? link.target : link.source;
          return (
            <li key={link.id} className="rounded-2xl border border-slate-200 bg-white/70 p-3 dark:border-slate-800 dark:bg-slate-900/40">
              <div className="flex items-center justify-between text-xs text-slate-400 dark:text-slate-500">
                <span>{link.linkType ?? "Link"}</span>
                {link.direction ? <span>{link.direction}</span> : null}
              </div>
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                {related ? `${related.key ?? related.id} · ${related.summary ?? "(no summary)"}` : "Unknown issue"}
              </p>
              {link.url ? (
                <a
                  href={link.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 text-xs text-sky-600 hover:underline dark:text-sky-300"
                >
                  <ExternalLink className="h-3 w-3" />
                  {link.url}
                </a>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function ExternalUrlList({ label, links }: { label: string; links: string[] }) {
  if (!links.length) {
    return null;
  }
  return (
    <div className="space-y-2">
      <h5 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
        <Link2 className="h-4 w-4" />
        {label}
      </h5>
      <ul className="space-y-1 text-sm">
        {links.map((link) => (
          <li key={link}>
            <a
              href={link}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 text-sky-600 hover:underline dark:text-sky-300"
            >
              <ExternalLink className="h-3 w-3" />
              {link}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

function formatHours(minutes: number | null | undefined): string {
  if (!minutes) return "0.0";
  return (minutes / 60).toFixed(1);
}

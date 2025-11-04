import { useMemo, useState, MouseEvent, type ComponentType } from "react";
import clsx from "clsx";
import {
  AlertCircle,
  ChevronDown,
  MessageSquareText,
  UserPlus,
  Shuffle,
  Clock3,
  CheckCircle2,
  Sparkles,
  Moon,
} from "lucide-react";
import { Button } from "../ui/button";
import type { DailySummaryRecord, DailySummaryWorkItem, IssueInsight } from "../../types/scrum";

export type InlineActionType = "comment" | "reassign" | "status";

export interface InlineActionPayload {
  type: InlineActionType;
  summary: DailySummaryRecord;
  item: DailySummaryWorkItem;
}

interface UserSummaryCardProps {
  summary: DailySummaryRecord;
  expanded: boolean;
  onToggle: () => void;
  onAction: (payload: InlineActionPayload) => void;
  onShowInsights?: (issueId: string) => void;
  insightsByIssueId?: Record<string, IssueInsight | null | undefined>;
}

const STATUS_UI = {
  ON_TRACK: {
    label: "On Track",
    badge: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200",
    icon: CheckCircle2,
    border: "border-emerald-200 dark:border-emerald-800",
  },
  DELAYED: {
    label: "Delayed",
    badge: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-200",
    icon: Clock3,
    border: "border-amber-200 dark:border-amber-800",
  },
  BLOCKED: {
    label: "Blocked",
    badge: "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-200",
    icon: AlertCircle,
    border: "border-rose-200 dark:border-rose-800",
  },
  OFFLINE: {
    label: "Out of office",
    badge: "bg-slate-200 text-slate-700 dark:bg-slate-900/50 dark:text-slate-300",
    icon: Moon,
    border: "border-slate-200 dark:border-slate-700",
  },
} as const;

const ACTION_META: Record<InlineActionType, { label: string; icon: ComponentType<{ className?: string }> }> = {
  comment: { label: "Add comment", icon: MessageSquareText },
  reassign: { label: "Reassign", icon: UserPlus },
  status: { label: "Change status", icon: Shuffle },
};

export function UserSummaryCard({
  summary,
  expanded,
  onToggle,
  onAction,
  onShowInsights,
  insightsByIssueId,
}: UserSummaryCardProps) {
  const ui = STATUS_UI[summary.status];
  const StatusIcon = ui.icon;
  const [expandedIssueIds, setExpandedIssueIds] = useState<Set<string>>(new Set());

  const displayName = summary.user?.displayName ?? summary.trackedUser?.displayName ?? "Unassigned teammate";
  const email = summary.user?.email ?? summary.trackedUser?.email ?? "Not linked to Jira++";
  const isUnmapped = !summary.user;

  const yesterdayLines = useMemo(() => normaliseLines(summary.yesterday), [summary.yesterday]);
  const todayLines = useMemo(() => normaliseLines(summary.today), [summary.today]);
  const blockerLines = useMemo(() => normaliseLines(summary.blockers), [summary.blockers]);

  const toggleIssue = (issueId: string) => {
    setExpandedIssueIds((prev) => {
      const next = new Set(prev);
      if (next.has(issueId)) {
        next.delete(issueId);
      } else {
        next.add(issueId);
      }
      return next;
    });
  };

  const handleAction = (event: MouseEvent<HTMLButtonElement>, type: InlineActionType, item: DailySummaryWorkItem) => {
    event.stopPropagation();
    onAction({ type, summary, item });
  };

  const handleCardClick = () => {
    if (expanded) {
      setExpandedIssueIds(new Set());
    }
    onToggle();
  };

  return (
    <article
      className={clsx(
        "flex h-full flex-col gap-4 rounded-3xl border bg-white p-6 shadow-sm transition hover:shadow-md dark:bg-slate-900/70",
        expanded ? ui.border : "border-slate-200 dark:border-slate-800",
      )}
    >
      <button
        type="button"
        className="flex w-full items-start justify-between gap-3 text-left"
        onClick={handleCardClick}
      >
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{displayName}</h3>
            {isUnmapped ? (
              <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-900/40 dark:text-amber-200">
                Jira only
              </span>
            ) : null}
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400">{email}</p>
          {summary.jiraAccountId ? (
            <p className="text-xs uppercase tracking-wide text-slate-400 dark:text-slate-500">
              Jira Account · {summary.jiraAccountId}
            </p>
          ) : null}
          <p className="text-xs uppercase tracking-wide text-slate-400 dark:text-slate-500">
            {(summary.project?.key ?? "Project").toUpperCase()} · {summary.project?.name ?? "Unknown"}
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <span
            className={clsx(
              "inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium",
              ui.badge,
            )}
          >
            <StatusIcon className="h-3.5 w-3.5" />
            {ui.label}
          </span>
          <ChevronDown
            className={clsx(
              "h-5 w-5 text-slate-400 transition-transform",
              expanded ? "rotate-180" : "",
            )}
          />
        </div>
      </button>

      <div className="grid gap-3 text-sm text-slate-600 dark:text-slate-300 md:grid-cols-3">
        <SummaryList title="Yesterday" lines={yesterdayLines} condensed />
        <SummaryList title="Today" lines={todayLines} condensed />
        <SummaryList title="Blockers" lines={blockerLines} highlight={summary.status === "BLOCKED"} condensed />
      </div>

      <div className="flex flex-wrap gap-3 text-xs font-medium text-slate-500 dark:text-slate-400">
        <MetricPill label="Total hours" value={`${summary.worklogHours.toFixed(1)}h`} />
        <MetricPill label="Done" value={summary.issueCounts.done.toString()} />
        <MetricPill
          label="Pending"
          value={(summary.issueCounts.todo + summary.issueCounts.inProgress).toString()}
        />
        <MetricPill label="Backlog" value={summary.issueCounts.backlog.toString()} />
        <MetricPill label="Blocked" value={summary.issueCounts.blocked.toString()} />
      </div>

      {expanded ? (
        <div className="mt-2 space-y-5">
          {summary.workItems.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">
              No detailed work items recorded in the last 24 hours.
            </p>
          ) : (
            summary.workItems.map((group) => (
              <section key={group.status} className="space-y-3">
                <header className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    {group.status}
                  </h4>
                  <span className="text-xs text-slate-400">{group.items.length} item(s)</span>
                </header>
                <div className="space-y-3">
                  {group.items.map((item) => {
                    const isIssueOpen = expandedIssueIds.has(item.issue.id);
                    const priorityLabel = item.issue.priority?.trim();
                    const hasInsights = Boolean(
                      insightsByIssueId?.[item.issue.id] ?? item.issue.insight,
                    );
                    return (
                      <article
                        key={item.issue.id}
                        className="rounded-2xl border border-slate-200 bg-white/80 p-5 shadow-sm transition hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900/40"
                      >
                        <div className="flex flex-col gap-4">
                             <div className="flex items-start gap-3">
                            <button
                              type="button"
                              onClick={() => toggleIssue(item.issue.id)}
                              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition hover:border-slate-300 hover:text-slate-700 dark:border-slate-700 dark:bg-slate-900/80 dark:text-slate-300"
                              aria-label={isIssueOpen ? "Collapse issue details" : "Expand issue details"}
                            >
                              <ChevronDown
                                className={clsx("h-4 w-4 transition-transform", isIssueOpen ? "rotate-180" : "")}
                              />
                            </button>
                            <div className="flex-1 space-y-2">
                              <div className="flex flex-wrap items-center gap-2">
                                {item.issue.browseUrl ? (
                                  <a
                                    href={item.issue.browseUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-sm font-semibold text-sky-600 underline-offset-4 hover:underline dark:text-sky-300"
                                  >
                                    {item.issue.key}
                                  </a>
                                ) : (
                                  <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                                    {item.issue.key}
                                  </span>
                                )}
                                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium uppercase tracking-wide text-slate-500 dark:bg-slate-800 dark:text-slate-300">
                                  {item.issue.status}
                                </span>
                                {priorityLabel ? (
                                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-900/40 dark:text-amber-200">
                                    {priorityLabel}
                                  </span>
                                ) : null}
                              </div>
                              <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                                {item.issue.summary ?? "No summary provided."}
                              </p>
                              <div className="flex flex-wrap gap-3 text-xs text-slate-400 dark:text-slate-500">
                                <span>Updated {new Date(item.issue.jiraUpdatedAt).toLocaleString()}</span>
                                {item.totalWorklogHours > 0 ? (
                                  <span>{item.totalWorklogHours.toFixed(1)}h logged</span>
                                ) : null}
                              </div>
                            </div>
                          </div>
                              <div className="flex flex-wrap gap-2">
                            {onShowInsights ? (
                              <Button
                                type="button"
                                size="sm"
                                variant={hasInsights ? "secondary" : "outline"}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  onShowInsights(item.issue.id);
                                }}
                              >
                                <Sparkles className="mr-2 h-4 w-4" />
                                Insights
                              </Button>
                            ) : null}
                            {(['comment', 'reassign', 'status'] as InlineActionType[]).map((action) => {
                              const meta = ACTION_META[action];
                              const Icon = meta.icon;
                              return (
                                <Button
                                  key={action}
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  onClick={(event) => handleAction(event, action, item)}
                                >
                                  <Icon className="mr-2 h-4 w-4" />
                                  {meta.label}
                                </Button>
                              );
                            })}
                          </div>
                          <IssueActivityDigest item={item} />
                          {isIssueOpen ? (
                            <div className="space-y-4 rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 p-4 dark:border-slate-700 dark:bg-slate-900/40">
                              <DetailList
                                title="Recent worklogs"
                                emptyLabel="No worklogs in the last day"
                                entries={item.recentWorklogs.map((log) => ({
                                  id: log.id,
                                  primary: `${formatHours(log.timeSpent ?? 0)} – ${log.author.displayName}`,
                                  secondary: log.description ?? "Logged without description",
                                  timestamp: new Date(log.jiraStartedAt).toLocaleString(),
                                }))}
                              />
                              <DetailList
                                title="Recent comments"
                                emptyLabel="No comments in the last day"
                                entries={item.recentComments.map((comment) => ({
                                  id: comment.id,
                                  primary: comment.author.displayName,
                                  secondary: comment.body,
                                  timestamp: new Date(comment.jiraCreatedAt).toLocaleString(),
                                }))}
                              />
                            </div>
                          ) : null}
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>
            ))
          )}
        </div>
      ) : null}
    </article>
  );
}

function SummaryList({
  title,
  lines,
  highlight,
  condensed,
}: {
  title: string;
  lines: string[];
  highlight?: boolean;
  condensed?: boolean;
}) {
  if (!lines.length) {
    return (
      <section className="space-y-1 rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 p-3 dark:border-slate-700 dark:bg-slate-900/40">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
          {title}
        </h4>
        <p className="text-sm text-slate-500 dark:text-slate-400">—</p>
      </section>
    );
  }

  const maxItems = condensed ? 2 : 3;
  const visibleLines = lines.slice(0, maxItems);
  const hiddenCount = Math.max(0, lines.length - visibleLines.length);

  return (
    <section className="space-y-2 rounded-2xl border border-slate-100 bg-white/80 p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900/40">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
        {title}
      </h4>
      <ul
        className={clsx(
          condensed ? "space-y-2 text-xs leading-relaxed" : "space-y-2 text-sm leading-relaxed",
          highlight ? "text-rose-600 dark:text-rose-300" : "text-slate-600 dark:text-slate-300",
        )}
      >
        {visibleLines.map((line, index) => (
          <li key={`${title}-${index}`} className="flex items-start gap-2">
            <span className="mt-1 h-1.5 w-1.5 rounded-full bg-slate-300 dark:bg-slate-600" />
            <span className={condensed ? "whitespace-normal" : "whitespace-pre-line"}>{line}</span>
          </li>
        ))}
        {hiddenCount > 0 ? (
          <li className="flex items-start gap-2 text-xs text-slate-400 dark:text-slate-500">
            <span className="mt-1 h-1.5 w-1.5 rounded-full bg-slate-200 dark:bg-slate-700" />
            <span>+{hiddenCount} more</span>
          </li>
        ) : null}
      </ul>
    </section>
  );
}

function DetailList({
  title,
  emptyLabel,
  entries,
}: {
  title: string;
  emptyLabel: string;
  entries: Array<{ id: string; primary: string; secondary: string; timestamp: string }>;
}) {
  return (
    <section className="space-y-2">
      <h5 className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
        {title}
      </h5>
      {entries.length === 0 ? (
        <p className="text-xs text-slate-500 dark:text-slate-400">{emptyLabel}</p>
      ) : (
        <ul className="space-y-2 text-sm">
          {entries.map((entry) => (
            <li key={entry.id} className="rounded-xl border border-slate-200 bg-white/80 p-3 dark:border-slate-800 dark:bg-slate-900/40">
              <p className="font-medium text-slate-800 dark:text-slate-200">{entry.primary}</p>
              <p className="text-sm text-slate-600 dark:text-slate-400">{entry.secondary}</p>
              <p className="text-xs text-slate-400 dark:text-slate-500">{entry.timestamp}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function MetricPill({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 dark:border-slate-700 dark:bg-slate-900/40">
      <span className="text-xs uppercase tracking-wide text-slate-400 dark:text-slate-500">{label}</span>
      <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">{value}</span>
    </span>
  );
}

function IssueActivityDigest({ item }: { item: DailySummaryWorkItem }) {
  const latestComment = item.recentComments[0] ?? null;
  const commentRemainder = Math.max(0, item.recentComments.length - 1);
  const recentWorklogs = item.recentWorklogs.slice(0, 2);
  const additionalWorklogs = Math.max(0, item.recentWorklogs.length - recentWorklogs.length);

  if (!latestComment && recentWorklogs.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 p-4 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900/30 dark:text-slate-400">
        No recent Jira activity captured in the last day.
      </div>
    );
  }

  return (
    <div className="space-y-3 text-sm text-slate-600 dark:text-slate-300">
      {latestComment ? (
        <div className="rounded-2xl border border-slate-200 bg-white/80 p-3 shadow-sm dark:border-slate-700 dark:bg-slate-900/30">
          <p className="text-xs uppercase tracking-wide text-slate-400 dark:text-slate-500">Latest comment</p>
          <p className="mt-1 text-sm font-medium text-slate-800 dark:text-slate-100">
            {latestComment.author.displayName}
            <span className="ml-1 text-xs font-normal text-slate-400 dark:text-slate-500">
              · {formatRelativeTime(latestComment.jiraCreatedAt)}
            </span>
          </p>
          <p className="mt-1 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
            {truncateText(latestComment.body, 220)}
          </p>
          {commentRemainder > 0 ? (
            <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">+{commentRemainder} more comment(s)</p>
          ) : null}
        </div>
      ) : null}
      {recentWorklogs.length ? (
        <div className="rounded-2xl border border-slate-200 bg-white/80 p-3 shadow-sm dark:border-slate-700 dark:bg-slate-900/30">
          <p className="text-xs uppercase tracking-wide text-slate-400 dark:text-slate-500">Recent worklogs</p>
          <ul className="mt-1 space-y-1 text-xs text-slate-500 dark:text-slate-400">
            {recentWorklogs.map((log) => (
              <li key={log.id}>
                {formatHours(log.timeSpent ?? 0)} by {log.author.displayName} · {formatRelativeTime(log.jiraStartedAt)}
                {log.description ? ` – ${truncateText(log.description, 120)}` : ""}
              </li>
            ))}
            {additionalWorklogs > 0 ? <li>+{additionalWorklogs} additional worklog(s)</li> : null}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function normaliseLines(input?: string | null): string[] {
  if (!input) {
    return [];
  }
  return input
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function formatHours(timeSpent: number): string {
  if (!timeSpent) {
    return "0h";
  }
  const minutes = Math.round(timeSpent / 60);
  if (minutes < 60) {
    return `${minutes}m`;
  }
  return `${(timeSpent / 3600).toFixed(1)}h`;
}

function truncateText(value: string, limit = 140): string {
  if (value.length <= limit) {
    return value;
  }
  return `${value.slice(0, limit - 1)}…`;
}

function formatRelativeTime(dateIso: string): string {
  const target = new Date(dateIso).getTime();
  const diffMs = Date.now() - target;
  const diffMinutes = Math.round(diffMs / 60000);
  if (Number.isNaN(diffMinutes)) {
    return new Date(dateIso).toLocaleString();
  }
  if (Math.abs(diffMinutes) < 60) {
    return `${diffMinutes}m ago`;
  }
  const diffHours = Math.round(diffMinutes / 60);
  if (Math.abs(diffHours) < 24) {
    return `${diffHours}h ago`;
  }
  const diffDays = Math.round(diffHours / 24);
  if (Math.abs(diffDays) < 7) {
    return `${diffDays}d ago`;
  }
  return new Date(dateIso).toLocaleDateString();
}

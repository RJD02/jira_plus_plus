import { useState } from "react";
import type { FocusIssue, FocusIssueEvent } from "../../types/focus";

interface FocusIssueListProps {
  issues: FocusIssue[];
  eventsByIssueId: Record<string, FocusIssueEvent[]>;
  title: string;
  emptyState: string;
}

interface GroupedIssues {
  projectId: string;
  projectKey: string;
  projectName: string;
  items: FocusIssue[];
}

function groupIssuesByProject(issues: FocusIssue[]): GroupedIssues[] {
  const groups = new Map<string, GroupedIssues>();

  for (const issue of issues) {
    const key = issue.project.id;
    if (!groups.has(key)) {
      groups.set(key, {
        projectId: issue.project.id,
        projectKey: issue.project.key,
        projectName: issue.project.name,
        items: [],
      });
    }
    groups.get(key)?.items.push(issue);
  }

  return Array.from(groups.values()).map((group) => ({
    ...group,
    items: [...group.items].sort((a, b) => b.jiraUpdatedAt.localeCompare(a.jiraUpdatedAt)),
  }));
}

function formatRelativeTime(dateIso: string): string {
  const target = new Date(dateIso);
  if (Number.isNaN(target.getTime())) {
    return dateIso;
  }

  const diffMs = Date.now() - target.getTime();
  const diffMinutes = Math.round(diffMs / 60000);

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

  return target.toLocaleString();
}

function truncate(text: string, length = 160): string {
  if (text.length <= length) {
    return text;
  }
  return `${text.slice(0, length - 1)}…`;
}

function formatEventType(event: FocusIssueEvent): string {
  if (event.type === "WORKLOG") {
    const hours = event.hours ?? 0;
    return `${Number(hours.toFixed(2))}h logged`;
  }
  return "Commented";
}

export function FocusIssueList({ issues, eventsByIssueId, title, emptyState }: FocusIssueListProps) {
  const grouped = groupIssuesByProject(issues);
  const [expandedIssues, setExpandedIssues] = useState<Set<string>>(() => new Set());

  const toggleIssue = (issueId: string) => {
    setExpandedIssues((prev) => {
      const next = new Set(prev);
      if (next.has(issueId)) {
        next.delete(issueId);
      } else {
        next.add(issueId);
      }
      return next;
    });
  };

  return (
    <section className="space-y-3">
      <header className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{title}</h3>
        <span className="text-sm text-slate-500 dark:text-slate-400">{issues.length} issue(s)</span>
      </header>
      {issues.length === 0 ? (
        <p className="rounded-3xl border border-slate-200 bg-slate-50/60 p-4 text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-400">
          {emptyState}
        </p>
      ) : (
        grouped.map((group) => (
          <article
            key={group.projectId}
            className="space-y-3 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm shadow-slate-200/50 dark:border-slate-800 dark:bg-slate-900/70 dark:shadow-slate-950/50"
          >
            <header className="flex items-center justify-between">
              <h4 className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                {group.projectKey} · {group.projectName}
              </h4>
              <span className="text-xs text-slate-400 dark:text-slate-500">
                {group.items.length} item(s)
              </span>
            </header>
            <ul className="space-y-2">
              {group.items.map((issue) => {
                const isExpanded = expandedIssues.has(issue.id);
                return (
                  <li
                    key={issue.id}
                    className="rounded-2xl border border-slate-200 bg-slate-50/70 transition hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900/40 dark:hover:border-slate-700"
                  >
                    <button
                      type="button"
                      onClick={() => toggleIssue(issue.id)}
                      className="flex w-full flex-col gap-3 rounded-2xl p-3 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 dark:focus-visible:ring-slate-600"
                      aria-expanded={isExpanded}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="space-y-1">
                          <p className="break-words text-sm font-medium text-slate-900 dark:text-slate-100">
                            {issue.browseUrl ? (
                              <a
                                href={issue.browseUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-slate-900 underline decoration-slate-300 underline-offset-4 transition hover:text-slate-700 hover:decoration-slate-400 dark:text-slate-100 dark:decoration-slate-700 dark:hover:text-slate-200 dark:hover:decoration-slate-500"
                                onClick={(event) => event.stopPropagation()}
                              >
                                {issue.key}
                              </a>
                            ) : (
                              issue.key
                            )}
                            {` · ${issue.summary ?? "No summary provided"}`}
                          </p>
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            Last updated {formatRelativeTime(issue.jiraUpdatedAt)}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 text-xs">
                          <span className="rounded-full border border-slate-300 px-2 py-1 text-slate-600 dark:border-slate-600 dark:text-slate-300">
                            {issue.status ?? "Unknown"}
                          </span>
                          {issue.priority ? (
                            <span className="rounded-full border border-amber-300 bg-amber-100 px-2 py-1 text-amber-700 dark:border-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
                              {issue.priority}
                            </span>
                          ) : null}
                          <span className="rounded-full border border-slate-300 px-2 py-1 text-slate-600 dark:border-slate-600 dark:text-slate-300">
                            {isExpanded ? "Timeline shown" : "Timeline hidden"}
                          </span>
                        </div>
                      </div>

                      {isExpanded ? (
                        <div className="space-y-3 rounded-2xl border border-slate-200/60 bg-white/80 p-3 dark:border-slate-700 dark:bg-slate-900/60">
                          <h5 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                            Timeline
                          </h5>
                          {eventsByIssueId[issue.id]?.length ? (
                            <ul className="space-y-3 border-l border-slate-200 pl-4 dark:border-slate-700">
                              {eventsByIssueId[issue.id].map((event) => (
                                <li key={`${event.type}-${event.id}`} className="relative space-y-1 text-left">
                                  <span className="absolute -left-[9px] top-1 h-2 w-2 rounded-full bg-slate-400 dark:bg-slate-500" />
                                  <div className="flex flex-wrap items-center justify-between gap-2">
                                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                                      <span className="font-semibold text-slate-700 dark:text-slate-100">
                                        {event.author?.displayName ?? "Unknown"}
                                      </span>
                                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                                        {event.type === "WORKLOG" ? "Worklog" : "Comment"}
                                      </span>
                                      <span>{formatEventType(event)}</span>
                                    </div>
                                    <span className="text-xs text-slate-400 dark:text-slate-500">
                                      {formatRelativeTime(event.occurredAt)}
                                    </span>
                                  </div>
                                  {event.type === "COMMENT" && event.body ? (
                                    <p className="text-sm text-slate-600 dark:text-slate-300">
                                      {truncate(event.body, 200)}
                                    </p>
                                  ) : null}
                                  {event.type === "WORKLOG" && event.body ? (
                                    <p className="text-sm text-slate-500 dark:text-slate-400">
                                      {truncate(event.body, 160)}
                                    </p>
                                  ) : null}
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <p className="text-xs text-slate-500 dark:text-slate-400">
                              No activity captured during this range.
                            </p>
                          )}
                        </div>
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          </article>
        ))
      )}
    </section>
  );
}

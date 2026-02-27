import { useEffect, useMemo, useState } from "react";
import { gql, useQuery } from "@apollo/client";
import { AlertTriangle, BarChart3, Loader2, RefreshCcw, Sparkles } from "lucide-react";
import { Button } from "../../ui/button";
import type { ManagerSummary } from "../../../types/manager";

interface ScrumProject {
  id: string;
  key: string;
  name: string;
}

interface SprintSummary {
  id: string;
  name: string;
  state: string;
  startDate?: string | null;
  endDate?: string | null;
}

const SCRUM_PROJECTS_QUERY = gql`
  query ManagerScrumProjects {
    scrumProjects {
      id
      key
      name
    }
  }
`;

const PROJECT_SPRINTS_QUERY = gql`
  query ManagerProjectSprints($projectId: ID!) {
    projectSprints(projectId: $projectId) {
      id
      name
      state
      startDate
      endDate
    }
  }
`;

const MANAGER_SUMMARY_QUERY = gql`
  query ManagerSummary($projectId: ID, $sprintId: ID) {
    managerSummary(projectId: $projectId, sprintId: $sprintId) {
      project {
        id
        key
        name
      }
      sprint {
        id
        name
        state
        startDate
        endDate
      }
      range {
        start
        end
      }
      totals {
        committedIssues
        completedIssues
        completionPercent
        velocity
        activeBlockers
        riskLevel
        riskReason
        timeProgressPercent
      }
      kpis {
        id
        label
        value
        formattedValue
        subtitle
        delta
        trendLabel
      }
      blockers {
        issue {
          id
          key
          summary
          status
          priority
          jiraUpdatedAt
          browseUrl
        }
        assignee {
          id
          displayName
          avatarUrl
        }
        status
        priority
        daysOpen
      }
      aiSummary {
        headline
        body
        highlights
      }
      warnings {
        code
        message
      }
      updatedAt
    }
  }
`;

function formatIsoDate(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function formatRange(range: { start: string; end: string }) {
  const start = formatIsoDate(range.start);
  const end = formatIsoDate(range.end);
  return `${start} → ${end}`;
}

function SummaryKpiCard({ kpi }: { kpi: ManagerSummary["kpis"][number] }) {
  const value = kpi.formattedValue ?? (kpi.value !== null && kpi.value !== undefined ? kpi.value.toString() : "n/a");
  const deltaText =
    kpi.delta !== null && kpi.delta !== undefined ? (kpi.delta >= 0 ? `+${kpi.delta}` : `${kpi.delta}`) : null;
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm shadow-slate-200/60 transition hover:border-slate-300 dark:border-slate-800 dark:bg-slate-950/40 dark:shadow-slate-950/50">
      <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">{kpi.label}</p>
      <p className="mt-2 text-2xl font-semibold text-slate-900 dark:text-slate-100">{value}</p>
      {kpi.subtitle ? <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{kpi.subtitle}</p> : null}
      {kpi.trendLabel || deltaText ? (
        <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
          {[kpi.trendLabel, deltaText].filter(Boolean).join(" • ")}
        </p>
      ) : null}
    </div>
  );
}

function SummaryAiPanel({
  summary,
  onRefresh,
  isRefreshing,
}: {
  summary: ManagerSummary | null;
  onRefresh: () => void;
  isRefreshing: boolean;
}) {
  const narrative = summary?.aiSummary;
  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-200/60 dark:border-slate-800 dark:bg-slate-950/40 dark:shadow-slate-950/50">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">AI Sprint Narrative</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Quick recap blends delivery progress, pace, and blocker signals.
          </p>
        </div>
        <Button type="button" size="sm" variant="outline" onClick={onRefresh} disabled={isRefreshing}>
          {isRefreshing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
          Refresh Narrative
        </Button>
      </div>
      <div className="mt-4 space-y-3">
        {isRefreshing ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">Regenerating summary…</p>
        ) : narrative ? (
          <>
            <p className="text-base font-semibold text-slate-900 dark:text-slate-100">{narrative.headline}</p>
            <p className="text-sm text-slate-600 dark:text-slate-300">{narrative.body}</p>
            <ul className="flex flex-wrap gap-2 text-xs text-slate-500 dark:text-slate-400">
              {narrative.highlights.map((highlight) => (
                <li key={highlight} className="rounded-full border border-slate-200 px-3 py-1 dark:border-slate-700">
                  {highlight}
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Narrative is unavailable until we have sprint metrics to synthesize.
          </p>
        )}
      </div>
    </section>
  );
}

export function ManagerSummaryView() {
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [selectedSprintId, setSelectedSprintId] = useState<string | null>(null);

  const {
    data: projectsData,
    loading: projectsLoading,
    error: projectsError,
  } = useQuery<{ scrumProjects: ScrumProject[] }>(SCRUM_PROJECTS_QUERY, {
    fetchPolicy: "cache-first",
  });

  const projects = useMemo(() => projectsData?.scrumProjects ?? [], [projectsData]);

  useEffect(() => {
    if (!projects.length) {
      setSelectedProjectId(null);
      return;
    }
    if (selectedProjectId && !projects.some((project) => project.id === selectedProjectId)) {
      setSelectedProjectId(projects[0]?.id ?? null);
    }
  }, [projects, selectedProjectId]);

  const {
    data: sprintsData,
    loading: sprintsLoading,
    error: sprintsError,
    refetch: refetchSprints,
  } = useQuery<{ projectSprints: SprintSummary[] }>(PROJECT_SPRINTS_QUERY, {
    variables: selectedProjectId ? { projectId: selectedProjectId } : undefined,
    skip: !selectedProjectId,
    fetchPolicy: "cache-and-network",
  });

  const sprints = useMemo(() => sprintsData?.projectSprints ?? [], [sprintsData]);

  useEffect(() => {
    if (!selectedProjectId) {
      setSelectedSprintId(null);
      return;
    }
    if (!sprints.length) {
      setSelectedSprintId(null);
      return;
    }
    if (!selectedSprintId || !sprints.some((sprint) => sprint.id === selectedSprintId)) {
      const active = sprints.find((sprint) => sprint.state?.toLowerCase().includes("active"));
      setSelectedSprintId(active?.id ?? sprints[0]?.id ?? null);
    }
  }, [sprints, selectedSprintId, selectedProjectId]);

  const summaryVariables = useMemo(
    () => ({
      projectId: selectedProjectId,
      sprintId: selectedProjectId ? selectedSprintId || null : null,
    }),
    [selectedProjectId, selectedSprintId],
  );

  const {
    data: summaryData,
    loading: summaryLoading,
    error: summaryError,
    refetch: refetchSummary,
  } = useQuery<{ managerSummary: ManagerSummary }>(MANAGER_SUMMARY_QUERY, {
    variables: summaryVariables,
    fetchPolicy: "cache-and-network",
  });

  const summary = summaryData?.managerSummary ?? null;

  const selectorError = useMemo(() => {
    const messages = [projectsError, sprintsError].filter(Boolean).map((err) => err?.message ?? "Unknown error");
    if (!messages.length) {
      return null;
    }
    return messages.join(" • ");
  }, [projectsError, sprintsError]);

  const summaryErrorMessage = useMemo(() => {
    if (!summaryError) {
      return null;
    }
    const graphMessage = summaryError.graphQLErrors?.[0]?.message;
    return graphMessage ?? summaryError.message ?? "Unable to load manager summary.";
  }, [summaryError]);

  const handleRefresh = () => {
    void refetchSummary();
    if (selectedProjectId) {
      void refetchSprints({ projectId: selectedProjectId });
    }
  };

  const rangeLabel = summary ? formatRange(summary.range) : null;

  const lastUpdatedLabel = summary
    ? `Updated ${new Date(summary.updatedAt).toLocaleTimeString(undefined, {
        hour: "2-digit",
        minute: "2-digit",
      })}`
    : null;

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-200/60 dark:border-slate-800 dark:bg-slate-950/40 dark:shadow-slate-950/50">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Sprint Overview</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Select a project and sprint to review delivery momentum, blockers, and risk.
            </p>
          </div>
          <Button type="button" size="sm" variant="outline" onClick={handleRefresh} disabled={summaryLoading}>
            {summaryLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCcw className="mr-2 h-4 w-4" />}
            Refresh Data
          </Button>
        </header>

        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <label className="space-y-1 text-sm">
            <span className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Project
            </span>
            <select
              className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:focus:border-sky-400 dark:focus:ring-sky-400/40"
              value={selectedProjectId ?? ""}
              onChange={(event) => {
                const next = event.target.value;
                setSelectedProjectId(next === "" ? null : next);
                setSelectedSprintId(null);
              }}
              disabled={projectsLoading}
            >
              <option value="">All Projects</option>
              {projectsLoading ? <option value="loading">Loading…</option> : null}
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.key} — {project.name}
                </option>
              ))}
            </select>
          </label>

          {selectedProjectId ? (
            <label className="space-y-1 text-sm">
              <span className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Sprint
              </span>
              <select
                className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:focus:border-sky-400 dark:focus:ring-sky-400/40"
                value={selectedSprintId ?? ""}
                onChange={(event) => setSelectedSprintId(event.target.value || null)}
                disabled={sprintsLoading || !sprints.length}
              >
                <option value="">Latest sprint</option>
                {sprints.map((sprint) => (
                  <option key={sprint.id} value={sprint.id}>
                    {sprint.name}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <div className="space-y-1 text-sm">
              <span className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Sprint
              </span>
              <div className="flex h-10 items-center rounded-2xl border border-slate-200 bg-white px-3 text-sm text-slate-600 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
                Portfolio view
              </div>
            </div>
          )}

          <div className="space-y-1 text-sm">
            <span className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Sprint Window
            </span>
            <div className="flex h-10 items-center rounded-2xl border border-slate-200 bg-white px-3 text-sm text-slate-600 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
              {rangeLabel ?? "Range TBD"}
            </div>
          </div>
        </div>

        {selectorError ? (
          <div className="mt-4 flex items-center gap-2 rounded-3xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-400/40 dark:bg-amber-950/40 dark:text-amber-100">
            <AlertTriangle className="h-4 w-4" />
            <span>{selectorError}</span>
          </div>
        ) : null}

        {summaryErrorMessage ? (
          <div className="mt-4 flex items-center justify-between gap-3 rounded-3xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-400/40 dark:bg-rose-950/40 dark:text-rose-100">
            <span>{summaryErrorMessage}</span>
            <Button type="button" size="sm" variant="secondary" onClick={() => void refetchSummary()} disabled={summaryLoading}>
              Retry
            </Button>
          </div>
        ) : null}
      </section>

      {summaryLoading && !summary ? (
        <div className="flex items-center gap-3 rounded-3xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600 shadow-sm shadow-slate-200/60 dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-300 dark:shadow-slate-950/50">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>Loading sprint metrics…</span>
        </div>
      ) : null}

      {summary ? (
        <>
          <section className="grid gap-4 md:grid-cols-4">
            {summary.kpis.map((kpi) => (
              <SummaryKpiCard key={kpi.id} kpi={kpi} />
            ))}
          </section>

          {summary.warnings.map((warning) => (
            <div
              key={warning.code}
              className="flex items-center gap-2 rounded-3xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-400/40 dark:bg-amber-950/40 dark:text-amber-100"
            >
              <AlertTriangle className="h-4 w-4" />
              <span>{warning.message}</span>
            </div>
          ))}

          <div className="grid gap-4 lg:grid-cols-3">
            <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-200/60 dark:border-slate-800 dark:bg-slate-950/40 dark:shadow-slate-950/50 lg:col-span-2">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Blocker Watchlist</h3>
                <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-500 dark:border-slate-700 dark:text-slate-300">
                  <BarChart3 className="h-3.5 w-3.5" />
                  {summary.blockers.length} active
                </span>
              </div>
              <div className="mt-4 overflow-x-auto">
                {summary.blockers.length ? (
                  <table className="min-w-full text-left text-sm">
                    <thead className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      <tr>
                        <th className="px-3 py-2 font-medium">Issue</th>
                        <th className="px-3 py-2 font-medium">Owner</th>
                        <th className="px-3 py-2 font-medium">Priority</th>
                        <th className="px-3 py-2 font-medium">Status</th>
                        <th className="px-3 py-2 font-medium text-right">Days Open</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {summary.blockers.map((blocker) => (
                        <tr key={blocker.issue.id} className="align-top">
                          <td className="px-3 py-3">
                            <div className="flex flex-col">
                              <span className="font-medium text-slate-900 dark:text-slate-100">
                                {blocker.issue.key}
                              </span>
                              <span className="line-clamp-2 text-sm text-slate-500 dark:text-slate-400" title={blocker.issue.summary ?? "No summary available"}>
                                {blocker.issue.summary ?? "No summary available"}
                              </span>
                            </div>
                          </td>
                          <td className="px-3 py-3 text-slate-600 dark:text-slate-300">
                            {blocker.assignee?.displayName ?? "Unassigned"}
                          </td>
                          <td className="px-3 py-3 text-slate-600 dark:text-slate-300">
                            {blocker.priority ?? blocker.issue.priority ?? "—"}
                          </td>
                          <td className="px-3 py-3 text-slate-600 dark:text-slate-300">
                            {blocker.status ?? blocker.issue.status}
                          </td>
                          <td className="px-3 py-3 text-right text-slate-600 dark:text-slate-300">{blocker.daysOpen}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 p-6 text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-950/30 dark:text-slate-400">
                    No blockers flagged for this sprint.
                  </div>
                )}
              </div>
            </section>

            <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-200/60 dark:border-slate-800 dark:bg-slate-950/40 dark:shadow-slate-950/50">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Risk Snapshot</h3>
              <dl className="mt-4 space-y-3 text-sm text-slate-600 dark:text-slate-300">
                <div>
                  <dt className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Risk Level</dt>
                  <dd className="mt-1 text-base font-semibold text-slate-900 dark:text-slate-100">
                    {summary.totals.riskLevel}
                  </dd>
                </div>
                {summary.totals.riskReason ? (
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Reason</dt>
                    <dd className="mt-1">{summary.totals.riskReason}</dd>
                  </div>
                ) : null}
                <div>
                  <dt className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Time Progress</dt>
                  <dd className="mt-1">
                    {summary.totals.timeProgressPercent === null
                      ? "n/a"
                      : `${summary.totals.timeProgressPercent.toFixed(1)}%`}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Completion</dt>
                  <dd className="mt-1">
                    {summary.totals.completionPercent === null
                      ? "n/a"
                      : `${summary.totals.completionPercent.toFixed(1)}%`}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Velocity</dt>
                  <dd className="mt-1">{summary.totals.velocity.toFixed(1)} issues/week</dd>
                </div>
              </dl>
            </section>
          </div>

          <SummaryAiPanel summary={summary} onRefresh={() => void refetchSummary()} isRefreshing={summaryLoading} />

          <p className="text-xs text-slate-400 dark:text-slate-500">{lastUpdatedLabel}</p>
        </>
      ) : null}

      {!summary && !summaryLoading ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-3xl border border-dashed border-slate-300 bg-white/60 p-8 text-center text-slate-500 dark:border-slate-700 dark:bg-slate-950/30 dark:text-slate-400">
          <BarChart3 className="h-10 w-10 text-slate-400 dark:text-slate-600" />
          <div className="max-w-xl space-y-2">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Choose a project to begin.</h3>
            <p className="text-sm">
              Once a sprint is selected we will surface KPI cards, blockers, and an AI-generated narrative tailored to
              your team.
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}

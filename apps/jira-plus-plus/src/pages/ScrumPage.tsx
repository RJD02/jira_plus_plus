import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import clsx from "clsx";
import { gql, useLazyQuery, useMutation, useQuery } from "@apollo/client";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import {
  AISummaryDrawer,
  InlineActionPayload,
  IssueInsightsOverlay,
  ScrumHeader,
  ScrumQuickGlance,
  TeamMetricsBar,
  UserSummaryCard,
} from "../components/scrum";
import type { DailySummaryRecord, IssueInsight } from "../types/scrum";
import { Modal } from "../components/ui/modal";
import { Button } from "../components/ui/button";

const SUMMARY_FIELDS = gql`
  fragment SummaryFields on DailySummary {
    id
    projectId
    project {
      id
      key
      name
    }
    trackedUser {
      id
      jiraAccountId
      displayName
      email
      avatarUrl
      isTracked
    }
    jiraAccountId
    date
    yesterday
    today
    blockers
    createdAt
    updatedAt
    status
    worklogHours
    issueCounts {
      todo
      inProgress
      backlog
      done
      blocked
    }
    user {
      id
      displayName
      email
      role
    }
        workItems {
          status
          items {
            issue {
              id
              key
              summary
              status
              priority
              statusCategory
              dueDate
              resolvedAt
              startedAt
              jiraUpdatedAt
              browseUrl
              assignee {
                id
                displayName
                email
                avatarUrl
              }
              reporter {
                id
                displayName
                email
                avatarUrl
              }
              parent {
                id
                key
                summary
                status
              }
              project {
                id
                key
                name
              }
              linksOut {
                id
                linkType
                direction
                url
                target {
                  id
                  key
                  summary
                  status
                  statusCategory
                  priority
                }
              }
              linksIn {
                id
                linkType
                direction
                url
                source {
                  id
                  key
                  summary
                  status
                  statusCategory
                  priority
                }
              }
            }
            totalWorklogHours
            recentWorklogs {
              id
              description
          timeSpent
          jiraStartedAt
          author {
            id
            displayName
            email
            avatarUrl
          }
        }
        recentComments {
          id
          body
          jiraCreatedAt
          author {
            id
            displayName
            email
            avatarUrl
          }
        }
      }
    }
  }
`;

const SCRUM_PROJECTS_QUERY = gql`
  query ScrumProjects {
    scrumProjects {
      id
      key
      name
    }
  }
`;

const DAILY_SUMMARIES_QUERY = gql`
  ${SUMMARY_FIELDS}
  query DailySummaries($date: Date!, $projectId: ID!) {
    dailySummaries(date: $date, projectId: $projectId) {
      ...SummaryFields
    }
  }
`;

const REGENERATE_SUMMARY_MUTATION = gql`
  ${SUMMARY_FIELDS}
  mutation RegenerateDailySummary($userId: ID!, $date: Date!, $projectId: ID!) {
    regenerateDailySummary(userId: $userId, date: $date, projectId: $projectId) {
      ...SummaryFields
    }
  }
`;

const ISSUE_INSIGHTS_QUERY = gql`
  query IssueInsights($issueId: ID!, $refresh: Boolean = false) {
    issueInsights(issueId: $issueId, refresh: $refresh) {
      summary {
        text
        provider
        confidence
      }
      sentiment {
        label
        score
        tones
        provider
      }
      escalateScore
      signals {
        type
        severity
        detail
        metadata
      }
      computedAt
      expiresAt
      providerMetadata
    }
  }
`;

interface ToastState {
  type: "success" | "error";
  message: string;
}

interface ScrumProject {
  id: string;
  key: string;
  name: string;
}

type ScrumViewMode = "team" | "focus";

const todayIsoDate = () => new Date().toISOString().slice(0, 10);

export function ScrumPage() {
  const [selectedDate, setSelectedDate] = useState<string>(todayIsoDate);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [selectedSummaryId, setSelectedSummaryId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ScrumViewMode>("team");
  const [toast, setToast] = useState<ToastState | null>(null);
  const [actionModal, setActionModal] = useState<InlineActionPayload | null>(null);
  const [autoRefresh, setAutoRefresh] = useState<boolean>(false);
  const [drawerOpen, setDrawerOpen] = useState<boolean>(false);
  const overlayEnabled = (import.meta.env.VITE_FEATURE_OVERLAY_ENABLED ?? "false") === "true";
  const [overlayOpen, setOverlayOpen] = useState<boolean>(false);
  const [overlayIssueId, setOverlayIssueId] = useState<string | null>(null);
  const [insightsByIssueId, setInsightsByIssueId] = useState<Record<string, IssueInsight>>({});
  const [loadingInsightId, setLoadingInsightId] = useState<string | null>(null);
  const inflightInsights = useRef<Set<string>>(new Set());
  const overlayIssueIdRef = useRef<string | null>(null);

  const {
    data: projectsData,
    loading: projectsLoading,
    error: projectsError,
  } = useQuery<{ scrumProjects: ScrumProject[] }>(SCRUM_PROJECTS_QUERY, {
    fetchPolicy: "cache-first",
  });

  const projects = useMemo(
    () => projectsData?.scrumProjects ?? [],
    [projectsData?.scrumProjects],
  );

  useEffect(() => {
    if (!projects.length) {
      setSelectedProjectId(null);
      return;
    }
    if (!selectedProjectId || !projects.some((project) => project.id === selectedProjectId)) {
      setSelectedProjectId(projects[0]?.id ?? null);
    }
  }, [projects, selectedProjectId]);

  const {
    data: summariesData,
    loading: summariesLoading,
    error: summariesError,
    refetch: refetchSummaries,
  } = useQuery<{ dailySummaries: DailySummaryRecord[] }>(DAILY_SUMMARIES_QUERY, {
    variables: selectedProjectId
      ? {
          date: selectedDate,
          projectId: selectedProjectId,
        }
      : undefined,
    skip: !selectedProjectId,
    fetchPolicy: "cache-and-network",
  });

  const summaries = useMemo(
    () => summariesData?.dailySummaries ?? [],
    [summariesData?.dailySummaries],
  );

  const [fetchIssueInsights, { loading: insightsLoading }] = useLazyQuery<
    { issueInsights: IssueInsight }
  >(ISSUE_INSIGHTS_QUERY, {
    fetchPolicy: "network-only",
    onError: (error) => {
      setToast({ type: "error", message: friendlyError(error) });
    },
    onCompleted: (data) => {
      if (!overlayIssueIdRef.current || !data?.issueInsights) {
        return;
      }
      setInsightsByIssueId((current) => ({
        ...current,
        [overlayIssueIdRef.current as string]: data.issueInsights,
      }));
      setLoadingInsightId((current) =>
        current === overlayIssueIdRef.current ? null : current,
      );
    },
  });

  const ensureInsight = useCallback(
    async (issueId: string | null | undefined) => {
      if (!issueId || inflightInsights.current.has(issueId) || insightsByIssueId[issueId]) {
        return;
      }
      inflightInsights.current.add(issueId);
      overlayIssueIdRef.current = issueId;
      try {
        setLoadingInsightId(issueId);
        await fetchIssueInsights({ variables: { issueId } });
      } finally {
        inflightInsights.current.delete(issueId);
        setLoadingInsightId((current) => (current === issueId ? null : current));
      }
    },
    [fetchIssueInsights, insightsByIssueId],
  );

  useEffect(() => {
    setInsightsByIssueId({});
    inflightInsights.current.clear();
    setLoadingInsightId(null);
    overlayIssueIdRef.current = null;
  }, [selectedDate, selectedProjectId]);

  useEffect(() => {
    if (!autoRefresh || !selectedProjectId) {
      return;
    }
    const timer = window.setInterval(() => {
      void refetchSummaries({ date: selectedDate, projectId: selectedProjectId });
    }, 60000);
    return () => window.clearInterval(timer);
  }, [autoRefresh, refetchSummaries, selectedDate, selectedProjectId]);

  useEffect(() => {
    if (!summaries.length) {
      setSelectedSummaryId(null);
      return;
    }
    if (!selectedSummaryId || !summaries.some((summary) => summary.id === selectedSummaryId)) {
      setSelectedSummaryId(summaries[0].id);
    }
  }, [summaries, selectedSummaryId]);

  const getDisplayName = (record: DailySummaryRecord) =>
    record.user?.displayName ?? record.trackedUser?.displayName ?? "Unassigned";

  const selectedSummary = useMemo(
    () => summaries.find((summary) => summary.id === selectedSummaryId) ?? null,
    [summaries, selectedSummaryId],
  );

  useEffect(() => {
    if (!overlayEnabled) {
      return;
    }
    if (!selectedSummary) {
      setOverlayOpen(false);
      setOverlayIssueId(null);
    }
  }, [overlayEnabled, selectedSummary]);

  const teamMetrics = useMemo(() => {
    if (!summaries.length) {
      return {
        hoursLogged: 0,
        pending: 0,
        blocked: 0,
        done: 0,
        backlog: 0,
        headline: null as string | null,
      };
    }

    let hoursLogged = 0;
    let pending = 0;
    let blocked = 0;
    let done = 0;
    let backlog = 0;
    let topByHours: DailySummaryRecord | null = null;
    let topBlocked: DailySummaryRecord | null = null;

    for (const summary of summaries) {
      hoursLogged += summary.worklogHours;
      done += summary.issueCounts.done;
      blocked += summary.issueCounts.blocked;
      pending += summary.issueCounts.todo + summary.issueCounts.inProgress;
      backlog += summary.issueCounts.backlog;

      if (!topByHours || summary.worklogHours > topByHours.worklogHours) {
        topByHours = summary;
      }
      if (!topBlocked && summary.issueCounts.blocked > 0) {
        topBlocked = summary;
      }
    }

    let headline: string | null = null;
    if (topBlocked) {
      headline = `${getDisplayName(topBlocked)} has ${topBlocked.issueCounts.blocked} blocker(s)`;
    } else if (topByHours && topByHours.worklogHours > 0) {
      headline = `Top output: ${getDisplayName(topByHours)} (${topByHours.worklogHours.toFixed(1)}h)`;
    }

    return {
      hoursLogged,
      pending,
      blocked,
      done,
      backlog,
      headline,
    };
  }, [summaries]);

  const lastUpdated = useMemo(() => {
    if (!summaries.length) {
      return null;
    }
    const timestamps = summaries
      .map((summary) => new Date(summary.updatedAt).getTime())
      .filter((value) => !Number.isNaN(value));
    if (!timestamps.length) {
      return null;
    }
    return new Date(Math.max(...timestamps)).toLocaleTimeString();
  }, [summaries]);

  useEffect(() => {
    if (viewMode === "focus" && !selectedSummary && summaries.length) {
      setSelectedSummaryId(summaries[0].id);
    }
  }, [viewMode, selectedSummary, summaries]);

  useEffect(() => {
    if (!toast) {
      return;
    }
    const timeout = window.setTimeout(() => setToast(null), 5000);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  const [regenerateSummary, { loading: regenerating }] = useMutation(REGENERATE_SUMMARY_MUTATION);

  const handleDateChange = (value: string) => {
    setSelectedDate(value);
    setSelectedSummaryId(null);
  };

  const handleProjectChange = (value: string) => {
    setSelectedProjectId(value || null);
    setSelectedSummaryId(null);
  };

  const handleRefresh = async () => {
    if (!selectedProjectId) {
      return;
    }
    try {
      await refetchSummaries({ date: selectedDate, projectId: selectedProjectId });
      setToast({ type: "success", message: "Summaries refreshed" });
    } catch (refreshError) {
      setToast({ type: "error", message: friendlyError(refreshError) });
    }
  };

  const handleRegenerate = async () => {
    if (!selectedSummary || !selectedProjectId) {
      return;
    }
    if (!selectedSummary.user?.id) {
      setToast({ type: "error", message: "Link this teammate to a Jira++ user to regenerate." });
      return;
    }
    try {
      const teammateName =
        selectedSummary.user?.displayName ?? selectedSummary.trackedUser?.displayName ?? "teammate";
      await regenerateSummary({
        variables: {
          userId: selectedSummary.user.id,
          date: selectedDate,
          projectId: selectedProjectId,
        },
      });
      await refetchSummaries({ date: selectedDate, projectId: selectedProjectId });
      setToast({ type: "success", message: `Summary regenerated for ${teammateName}` });
    } catch (mutationError) {
      setToast({ type: "error", message: friendlyError(mutationError) });
    }
  };

  const handleAction = (payload: InlineActionPayload) => {
    setActionModal(payload);
  };

  const openDetailView = (issueId?: string | null) => {
    if (overlayEnabled) {
      let resolvedIssueId = issueId ?? null;
      if (!resolvedIssueId && selectedSummary) {
        for (const group of selectedSummary.workItems) {
          const candidate = group.items[0]?.issue.id;
          if (candidate) {
            resolvedIssueId = candidate;
            break;
          }
        }
      }
      setOverlayIssueId(resolvedIssueId);
      overlayIssueIdRef.current = resolvedIssueId;
      setOverlayOpen(true);
      setDrawerOpen(false);
      void ensureInsight(resolvedIssueId);
      return;
    }
    setDrawerOpen(true);
  };

  const closeDetailView = () => {
    if (overlayEnabled) {
      setOverlayOpen(false);
      setOverlayIssueId(null);
      overlayIssueIdRef.current = null;
      return;
    }
    setDrawerOpen(false);
  };

  const handleActionSubmit = (message: string) => {
    setToast({ type: "success", message });
    setActionModal(null);
  };

  const handleSelectSummary = (summaryId: string) => {
    setSelectedSummaryId(summaryId);
    openDetailView();
  };

  return (
    <div className="space-y-6 px-4 sm:px-6 lg:px-10 xl:px-16">
      <section className="space-y-6">
        <ScrumHeader
          date={selectedDate}
          projectId={selectedProjectId}
          projects={projects}
          onDateChange={handleDateChange}
          onProjectChange={handleProjectChange}
          onRefresh={handleRefresh}
          isRefreshing={summariesLoading}
          projectsLoading={projectsLoading}
          lastUpdated={lastUpdated}
          autoRefresh={autoRefresh}
          onAutoRefreshChange={setAutoRefresh}
        />

        <TeamMetricsBar
          hoursLogged={teamMetrics.hoursLogged}
          pending={teamMetrics.pending}
          blocked={teamMetrics.blocked}
          done={teamMetrics.done}
          backlog={teamMetrics.backlog}
          focusHeadline={teamMetrics.headline}
        />

        {toast ? <ToastBanner toast={toast} onDismiss={() => setToast(null)} /> : null}

        {projectsError ? (
          <div className="rounded-3xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200">
            {friendlyError(projectsError)}
          </div>
        ) : null}

        {summariesError ? (
          <div className="rounded-3xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200">
            {friendlyError(summariesError)}
          </div>
        ) : null}

        {!projectsLoading && projects.length === 0 ? (
          <div className="rounded-3xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-300">
            No Jira projects linked to your account. Map users in the Admin Console to enable scrum summaries.
          </div>
        ) : null}

        {selectedProjectId ? null : projectsLoading ? (
          <div className="rounded-3xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-300">
            Loading projects…
          </div>
        ) : null}

        {selectedProjectId ? (
          <>
            {summaries.length ? (
              <section className="space-y-4">
                <div className="inline-flex rounded-full border border-slate-200 bg-white p-1 shadow-sm shadow-slate-200/60 dark:border-slate-700 dark:bg-slate-950/40 dark:shadow-slate-950/50">
                  {(
                    [
                      { id: "team" as ScrumViewMode, label: "Team Overview" },
                      { id: "focus" as ScrumViewMode, label: "Focus Mode" },
                    ] as const
                  ).map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => {
                        setViewMode(option.id);
                        if (option.id === "focus") {
                          setDrawerOpen(true);
                        }
                      }}
                      disabled={option.id === "focus" && !summaries.length}
                      className={clsx(
                        "rounded-full px-4 py-2 text-sm font-medium transition",
                        viewMode === option.id
                          ? "bg-sky-500 text-white shadow-sm shadow-sky-500/40 dark:bg-sky-400 dark:text-slate-900"
                          : "text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60 dark:text-slate-300 dark:hover:bg-slate-900/60",
                      )}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
                <ScrumQuickGlance
                  summaries={summaries}
                  selectedId={selectedSummaryId}
                  onSelect={handleSelectSummary}
                />
              </section>
            ) : null}

            {viewMode === "team" ? (
              <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
                {summariesLoading && !summaries.length
                  ? Array.from({ length: 4 }).map((_, index) => (
                      <div
                        key={`placeholder-${index}`}
                        className="h-64 rounded-3xl border border-dashed border-slate-200 bg-slate-50/60 dark:border-slate-800 dark:bg-slate-900/40"
                      />
                    ))
                  : null}
                {summaries.map((summary) => (
                  <UserSummaryCard
                    key={summary.id}
                    summary={summary}
                    expanded={false}
                    onToggle={() => {
                      setSelectedSummaryId(summary.id);
                      openDetailView();
                    }}
                    onAction={handleAction}
                    insightsByIssueId={insightsByIssueId}
                    onShowInsights={
                      overlayEnabled
                        ? (issueId) => {
                            setSelectedSummaryId(summary.id);
                            openDetailView(issueId);
                          }
                        : undefined
                    }
                  />
                ))}
                {!summariesLoading && selectedProjectId && !summaries.length ? (
                  <div className="col-span-full rounded-3xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-300">
                    No summaries available for this date.
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="space-y-4">
                {selectedSummary ? (
                  <UserSummaryCard
                    summary={selectedSummary}
                    expanded
                    onToggle={() => openDetailView()}
                    onAction={handleAction}
                    insightsByIssueId={insightsByIssueId}
                    onShowInsights={
                      overlayEnabled
                        ? (issueId) => {
                            openDetailView(issueId);
                          }
                        : undefined
                    }
                  />
                ) : (
                  <div className="rounded-3xl border border-dashed border-slate-200 bg-white p-8 text-center text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-300">
                    Select a teammate from the quick glance to view their full update.
                  </div>
                )}
              </div>
            )}
          </>
        ) : null}

        <ActionModal
          payload={actionModal}
          onClose={() => setActionModal(null)}
          onSubmit={handleActionSubmit}
        />
      </section>
      {overlayEnabled ? (
        <IssueInsightsOverlay
          open={overlayOpen && Boolean(selectedSummary)}
          summary={selectedSummary}
          initialIssueId={overlayIssueId}
          insights={insightsByIssueId}
          loadingIssueId={loadingInsightId}
          insightsLoading={insightsLoading}
          onRequestInsight={(issueId) => {
            overlayIssueIdRef.current = issueId;
            void ensureInsight(issueId);
          }}
          onClose={closeDetailView}
        />
      ) : (
        <AISummaryDrawer
          open={drawerOpen && Boolean(selectedSummary)}
          summary={selectedSummary}
          regenerating={regenerating}
          onRegenerate={handleRegenerate}
          onClose={closeDetailView}
        />
      )}
    </div>
  );
}

function ToastBanner({ toast, onDismiss }: { toast: ToastState; onDismiss: () => void }) {
  const Icon = toast.type === "success" ? CheckCircle2 : AlertCircle;
  return (
    <div
      className={
        toast.type === "success"
          ? "flex items-center gap-2 rounded-3xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200"
          : "flex items-center gap-2 rounded-3xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-200"
      }
    >
      <Icon className="h-4 w-4" />
      <span className="flex-1">{toast.message}</span>
      <button
        type="button"
        className="text-xs font-medium uppercase tracking-wide text-current"
        onClick={onDismiss}
      >
        Dismiss
      </button>
    </div>
  );
}

function ActionModal({
  payload,
  onClose,
  onSubmit,
}: {
  payload: InlineActionPayload | null;
  onClose: () => void;
  onSubmit: (message: string) => void;
}) {
  const [comment, setComment] = useState("");
  const [assignee, setAssignee] = useState("");
  const [status, setStatus] = useState("In Progress");

  useEffect(() => {
    setComment("");
    setAssignee("");
    setStatus("In Progress");
  }, [payload?.item.issue.id, payload?.type]);

  if (!payload) {
    return null;
  }

  const issueKey = payload.item.issue.key;

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (payload.type === "comment") {
      if (!comment.trim()) {
        return;
      }
      onSubmit(`Comment queued for ${issueKey}`);
      return;
    }
    if (payload.type === "reassign") {
      if (!assignee.trim()) {
        return;
      }
      onSubmit(`Reassignment queued for ${issueKey}`);
      return;
    }
    onSubmit(`Status update queued for ${issueKey}`);
  };

  return (
    <Modal
      open={Boolean(payload)}
      onClose={onClose}
      title={modalTitle(payload.type, issueKey)}
      description={`Updates will sync to Jira when integrations are connected.`}
      primaryAction={
        <Button type="submit" form="scrum-action-form">
          Continue
        </Button>
      }
    >
      <form id="scrum-action-form" className="space-y-4" onSubmit={handleSubmit}>
        {payload.type === "comment" ? (
          <label className="block text-sm font-medium text-slate-600 dark:text-slate-300">
            Comment
            <textarea
              value={comment}
              onChange={(event) => setComment(event.target.value)}
              className="mt-2 h-32 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:ring-slate-600"
              placeholder="Share context or blockers..."
            />
          </label>
        ) : null}
        {payload.type === "reassign" ? (
          <label className="block text-sm font-medium text-slate-600 dark:text-slate-300">
            New assignee email
            <input
              type="email"
              value={assignee}
              onChange={(event) => setAssignee(event.target.value)}
              className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:ring-slate-600"
              placeholder="dev@example.com"
            />
          </label>
        ) : null}
        {payload.type === "status" ? (
          <label className="block text-sm font-medium text-slate-600 dark:text-slate-300">
            New status
            <select
              value={status}
              onChange={(event) => setStatus(event.target.value)}
              className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:ring-slate-600"
            >
              <option value="To Do">To Do</option>
              <option value="In Progress">In Progress</option>
              <option value="Blocked">Blocked</option>
              <option value="Review">Review</option>
              <option value="Done">Done</option>
            </select>
          </label>
        ) : null}
      </form>
    </Modal>
  );
}

function modalTitle(action: InlineActionPayload["type"], issueKey: string) {
  if (action === "comment") {
    return `Add comment to ${issueKey}`;
  }
  if (action === "reassign") {
    return `Reassign ${issueKey}`;
  }
  return `Update ${issueKey} status`;
}

function friendlyError(error: unknown): string {
  if (!error) {
    return "Unknown error";
  }
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "string") {
    return error;
  }
  return "An unexpected error occurred";
}

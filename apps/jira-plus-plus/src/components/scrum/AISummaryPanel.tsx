import { Children, useMemo, type ReactNode } from "react";
import {
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Clock3,
  ListChecks,
  Target,
  Users,
  Activity,
  ArrowUpRight,
  Moon,
  type LucideIcon,
} from "lucide-react";
import clsx from "clsx";
import { Button } from "../ui/button";
import type {
  DailySummaryRecord,
  TaskSummarySnapshotRecord,
  TaskTimelineEvent,
  UserSummarySnapshotRecord,
  NarrativeVariant,
  UserNarrativeStructured,
  NarrativeTone,
} from "../../types/scrum";

interface AISummaryPanelProps {
  summary: DailySummaryRecord | null;
  userSnapshot: UserSummarySnapshotRecord | null;
  taskSummaries: TaskSummarySnapshotRecord[];
  regenerating: boolean;
  onRegenerate: () => void;
  onRefreshNarrative?: () => void;
  narrativeRefreshing?: boolean;
  onOpenIssue: (issueId: string) => void;
}

const STATUS_META = {
  onTrack: {
    label: "On Track",
    icon: CheckCircle2,
    className: "text-emerald-600 dark:text-emerald-400",
  },
  idle: {
    label: "Idle",
    icon: Clock3,
    className: "text-amber-600 dark:text-amber-400",
  },
  blocked: {
    label: "Blocked",
    icon: AlertCircle,
    className: "text-rose-600 dark:text-rose-400",
  },
  offline: {
    label: "Out of office",
    icon: Moon,
    className: "text-slate-500 dark:text-slate-400",
  },
} as const;

type NarrativeSection = {
  label: string;
  content: string;
};

const SECTION_REGEX = /\b(Key focus|Wins|In motion|Collaboration|Pending|Next up|Highlights|Risks|Blockers|Focus next|Summary):/gi;

const formatLabel = (value: string) =>
  value
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());

function extractNarrativeSections(text: string): NarrativeSection[] {
  const sections: NarrativeSection[] = [];
  let match: RegExpExecArray | null;
  let lastIndex = 0;
  let currentLabel = "Summary";
  const source = text.startsWith("Summary:") ? text : `Summary: ${text}`;
  const pattern = new RegExp(SECTION_REGEX.source, "gi");

  while ((match = pattern.exec(source)) !== null) {
    const segment = source.slice(lastIndex, match.index).trim();
    if (segment) {
      sections.push({ label: formatLabel(currentLabel), content: segment });
    }
    currentLabel = match[1];
    lastIndex = pattern.lastIndex;
  }

  const tail = source.slice(lastIndex).trim();
  if (tail) {
    sections.push({ label: formatLabel(currentLabel), content: tail });
  }

  return sections;
}

function tokenizeContent(content: string): string[] {
  const cleaned = content.replace(/^[A-Za-z ]+:\s*/i, "").trim();
  if (!cleaned) {
    return [];
  }

  const bulletSplit = cleaned.split(/•/).map((entry) => entry.trim()).filter(Boolean);
  if (bulletSplit.length > 1) {
    return bulletSplit;
  }

  const semicolonSplit = cleaned
    .split(/;\s*/)
    .map((entry) => entry.trim())
    .filter(Boolean);
  if (semicolonSplit.length > 1) {
    return semicolonSplit;
  }

  const sentenceSplit = cleaned
    .split(/\.\s+(?=[A-Z0-9])/)
    .map((entry) => entry.trim())
    .filter(Boolean);
  if (sentenceSplit.length > 1) {
    return sentenceSplit;
  }

  return [cleaned];
}

export function formatNarrativeContent(raw: string | null | undefined): ReactNode {
  const text = raw?.replace(/\u2022/g, "•").trim();
  if (!text) {
    return <p className="leading-relaxed text-slate-700 dark:text-slate-200">—</p>;
  }

  const sections = extractNarrativeSections(text);
  if (!sections.length) {
    return <p className="leading-relaxed text-slate-700 dark:text-slate-200">{text}</p>;
  }

  return (
    <div className="space-y-2">
      {sections.map((section, index) => {
        const items = tokenizeContent(section.content);
        if (section.label === "Summary" && (items.length <= 1 || items[0].length < 120)) {
          return (
            <p key={`summary-${index}`} className="leading-relaxed text-slate-700 dark:text-slate-200">
              {items[0] ?? section.content}
            </p>
          );
        }

        return (
          <section key={`section-${index}`} className="space-y-1">
            <div className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-600 dark:bg-slate-900/60 dark:text-slate-300">
              {section.label}
            </div>
            {items.length > 1 ? (
              <ul className="grid gap-1.5">
                {items.map((item, itemIndex) => (
                  <li
                    key={`chip-${index}-${itemIndex}`}
                    className="rounded-xl bg-slate-50 px-3 py-1.5 text-xs leading-relaxed text-slate-600 shadow-sm dark:bg-slate-900/60 dark:text-slate-300"
                  >
                    {item.replace(/\.$/, "")}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm leading-relaxed text-slate-700 dark:text-slate-200">{items[0]}</p>
            )}
          </section>
        );
      })}
    </div>
  );
}

export function AISummaryPanel({
  summary,
  userSnapshot,
  taskSummaries,
  regenerating,
  onRegenerate,
  onRefreshNarrative,
  narrativeRefreshing,
  onOpenIssue,
}: AISummaryPanelProps) {
  const visibleTasks = useMemo(() => {
    if (!userSnapshot) {
      return [] as TaskSummarySnapshotRecord[];
    }
    const index = new Map(taskSummaries.map((task) => [task.id, task]));
    return userSnapshot.taskSummaryIds
      .map((id) => index.get(id))
      .filter((task): task is TaskSummarySnapshotRecord => Boolean(task));
  }, [taskSummaries, userSnapshot]);

  type AggregatedTimelineEvent = TaskTimelineEvent & {
    issueId: string;
    issueKey: string;
    headline: string;
  };

  const aggregatedTimeline = useMemo<AggregatedTimelineEvent[]>(() => {
    if (!visibleTasks.length) {
      return [];
    }
    const timeline = visibleTasks.flatMap((task) =>
      task.payload.timeline.map((event) => ({
        ...event,
        issueId: task.payload.issueId,
        issueKey: task.payload.issueKey,
        headline: task.payload.headline,
      })),
    );
    timeline.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
    return timeline.slice(0, 12);
  }, [visibleTasks]);

  if (!summary || !userSnapshot) {
    return (
      <aside className="h-full rounded-3xl border border-dashed border-slate-200 bg-slate-50/60 p-6 text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-400">
        Select a teammate to review their AI summary.
      </aside>
    );
  }

  const isUnavailable = summary.isUnavailable || userSnapshot.payload.riskFlags.includes("unavailable");
  const statusKey = deriveStatus(userSnapshot, isUnavailable);
  const statusMeta = STATUS_META[statusKey];
  const StatusIcon = statusMeta.icon;
  const displayName =
    userSnapshot.payload.identity.displayName ??
    summary.user?.displayName ??
    summary.trackedUser?.displayName ??
    "Unassigned teammate";
  const canRegenerate = !isUnavailable && Boolean(userSnapshot.payload.identity.userId ?? summary.user?.id);
  const metrics = userSnapshot.payload.activityMetrics;
  const narrative = userSnapshot.payload;
  const mood = narrative.mood;
  const rich = (userSnapshot.richNarratives as Record<string, NarrativeVariant> | null) ?? null;
  const managerVariant = rich?.manager;
  const structured = extractUserStructuredNarrative(managerVariant?.structured);
  const tone = structured?.tone ?? null;
  const narrativeText =
    structured?.story?.trim() ??
    managerVariant?.text ??
    userSnapshot.narrative ??
    narrative.headline;
  const narrativeGeneratedAt = managerVariant?.generatedAt ?? userSnapshot.narrativeGeneratedAt ?? null;
  const narrativePending = userSnapshot.needsNarrativeRefresh;
  const showRefreshButton = !isUnavailable && Boolean(onRefreshNarrative);

  const header = (
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0 space-y-1">
        <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">AI Summary</p>
        <h3 className="truncate text-xl font-semibold text-slate-900 dark:text-slate-100" title={displayName}>{displayName}</h3>
        <p className="text-xs text-slate-400 dark:text-slate-500">
          {narrativeGeneratedAt
            ? `Story updated ${new Date(narrativeGeneratedAt).toLocaleTimeString()}`
            : "Story pending generation"}
          {narrativePending ? " • Refresh queued" : ""}
        </p>
      </div>
      <div className="flex items-center gap-2">
        {showRefreshButton ? (
          <Button
            type="button"
            variant="outline"
            onClick={onRefreshNarrative}
            disabled={Boolean(narrativeRefreshing)}
          >
            {narrativeRefreshing ? "Refreshing…" : "Refresh story"}
          </Button>
        ) : null}
        <Button type="button" onClick={onRegenerate} disabled={regenerating || !canRegenerate}>
          <RefreshCw className={`mr-2 h-4 w-4 ${regenerating ? "animate-spin" : ""}`} />
          {regenerating ? "Regenerating" : "Regenerate"}
        </Button>
      </div>
    </header>
  );

  if (isUnavailable) {
    return (
      <aside className="flex h-full flex-col gap-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm shadow-slate-200/70 dark:border-slate-800 dark:bg-slate-900/70 dark:shadow-slate-950/50">
        {header}
        <div className="flex items-center gap-2 text-sm">
          <StatusIcon className={`h-4 w-4 ${statusMeta.className}`} />
          <span className={`font-medium ${statusMeta.className}`}>{statusMeta.label}</span>
          <span className="text-slate-400">•</span>
          <span className="text-slate-500 dark:text-slate-400">
            Marked away for today. We will resume stand-up insights when they are back.
          </span>
        </div>
        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-6 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-300">
          No tasks or updates expected while this teammate is out.
        </div>
      </aside>
    );
  }

  return (
    <aside className="flex h-full flex-col gap-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm shadow-slate-200/70 dark:border-slate-800 dark:bg-slate-900/70 dark:shadow-slate-950/50">
      {header}

      <div className="flex items-center gap-2 text-sm">
        <StatusIcon className={`h-4 w-4 ${statusMeta.className}`} />
        <span className={`font-medium ${statusMeta.className}`}>{statusMeta.label}</span>
        <span className="text-slate-400">•</span>
        <span className="text-slate-500 dark:text-slate-400">
          Updated {new Date(summary.updatedAt).toLocaleTimeString()}
        </span>
        {tone ? (
          <>
            <span className="text-slate-400">•</span>
            <span
              className={clsx(
                "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                toneBadgeClass(tone),
              )}
            >
              Tone: {tone.toUpperCase()}
            </span>
          </>
        ) : null}
      </div>

      <InfoCard title="Daily Story" body={formatNarrativeContent(narrativeText)} />

      {structured?.spotlight?.length ? (
        <SummarySection title="Spotlight" emptyLabel="No spotlight items">
          {structured.spotlight.map((entry, index) => (
            <li
              key={`spotlight-${index}`}
              className="rounded-xl border border-slate-100 bg-white p-3 text-sm text-slate-700 dark:border-slate-800 dark:bg-slate-900/80 dark:text-slate-200"
            >
              {entry}
            </li>
          ))}
        </SummarySection>
      ) : null}

      {mood ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-300">
          <header className="flex items-center justify-between gap-2">
            <span className="text-xs uppercase tracking-wide text-slate-400 dark:text-slate-500">Mood</span>
            <span
              className={clsx(
                "rounded-full px-2 py-0.5 text-xs font-medium",
                mood.label === "positive"
                  ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-200"
                  : mood.label === "negative"
                    ? "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-200"
                    : "bg-slate-100 text-slate-600 dark:bg-slate-800/40 dark:text-slate-300",
              )}
            >
              {mood.label.toUpperCase()} ({mood.score.toFixed(2)})
            </span>
          </header>
          {mood.rationale ? (
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">{mood.rationale}</p>
          ) : null}
        </section>
      ) : null}

      <SummarySection title="Accomplishments" emptyLabel="No wins logged yet">
        {narrative.accomplishments.map((item) => (
          <li
            key={item.issueId}
            className="rounded-xl border border-slate-100 bg-white p-3 text-sm text-slate-700 dark:border-slate-800 dark:bg-slate-900/80 dark:text-slate-200"
          >
            <p className="font-medium">{item.text}</p>
            <p className="text-xs text-slate-400">{item.issueKey}</p>
          </li>
        ))}
      </SummarySection>

      <SummarySection title="In Flight" emptyLabel="No active items">
        {narrative.inFlight.map((item) => (
          <li
            key={item.issueId}
            className="rounded-xl border border-slate-100 bg-white p-3 text-sm text-slate-700 dark:border-slate-800 dark:bg-slate-900/80 dark:text-slate-200"
          >
            <p className="font-medium">{item.note}</p>
            <p className="text-xs text-slate-400">
              {item.issueKey} · {formatStatusLabel(item.status)}
            </p>
          </li>
        ))}
      </SummarySection>

      <SummarySection title="Blockers" emptyLabel="No blockers detected">
        {narrative.blockers.map((item) => (
          <li
            key={item.issueId}
            className="rounded-xl border border-rose-200/60 bg-rose-50/60 p-3 text-sm text-rose-700 dark:border-rose-800/60 dark:bg-rose-950/30 dark:text-rose-200"
          >
            <p className="font-medium">{item.description}</p>
            <p className="text-xs uppercase tracking-wide text-rose-500 dark:text-rose-300">
              {item.issueKey} · {item.severity.toUpperCase()}
            </p>
          </li>
        ))}
      </SummarySection>

      <InfoCard
        title="Focus Next"
        body={formatNarrativeContent(narrative.focusNext?.trim() || "No next-step guidance captured.")}
        icon={Target}
      />

      {structured?.risks?.length ? (
        <SummarySection title="Narrative Risks" emptyLabel="No narrative risks">
          {structured.risks.map((entry, index) => (
            <li
              key={`narrative-risk-${index}`}
              className="rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-700 dark:border-slate-800 dark:bg-slate-900/80 dark:text-slate-200"
            >
              {entry}
            </li>
          ))}
        </SummarySection>
      ) : null}

      {structured?.nextMoves?.length ? (
        <SummarySection title="Next Moves" emptyLabel="No next moves">
          {structured.nextMoves.map((entry, index) => (
            <li
              key={`next-move-${index}`}
              className="rounded-xl border border-slate-100 bg-white p-3 text-sm text-slate-700 dark:border-slate-800 dark:bg-slate-900/80 dark:text-slate-200"
            >
              {entry}
            </li>
          ))}
        </SummarySection>
      ) : null}

      {narrative.collaborationNotes?.length ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-300">
          <header className="mb-2 flex items-center gap-2 text-xs uppercase tracking-wide text-slate-400 dark:text-slate-500">
            <Users className="h-4 w-4" /> Collaboration
          </header>
          <ul className="space-y-2">
            {narrative.collaborationNotes.map((note, index) => (
              <li
                key={`${note.partnerUserId ?? note.partnerDisplayName ?? "anon"}-${index}`}
                className="rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-2 text-xs dark:border-slate-800 dark:bg-slate-900/60"
              >
                <p className="font-semibold text-slate-700 dark:text-slate-200">
                  {note.partnerDisplayName ?? "Teammate"}
                  {note.issueKey ? <span className="ml-2 font-normal text-slate-400 dark:text-slate-500">{note.issueKey}</span> : null}
                </p>
                <p className="mt-1 text-slate-600 dark:text-slate-300">{note.note}</p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {narrative.pendingDecisions && (narrative.pendingDecisions.ownedByUser.length || narrative.pendingDecisions.waitingOnOthers.length) ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-300">
          <header className="mb-3 flex items-center gap-2 text-xs uppercase tracking-wide text-slate-400 dark:text-slate-500">
            <Target className="h-4 w-4" /> Pending decisions
          </header>
          <div className="grid gap-3 md:grid-cols-2">
            <DecisionList title="Owned by me" emptyLabel="No follow-ups" decisions={narrative.pendingDecisions.ownedByUser} />
            <DecisionList title="Waiting on others" emptyLabel="No blockers" decisions={narrative.pendingDecisions.waitingOnOthers} />
          </div>
        </section>
      ) : null}

      <section className="space-y-3">
        <header className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
          <ListChecks className="h-4 w-4" />
          <span className="text-xs uppercase tracking-wide">Artifacts</span>
        </header>
        <div className="grid gap-3">
          {visibleTasks.map((task) => (
            <TaskCard key={task.id} task={task} onOpenIssue={onOpenIssue} />
          ))}
          {!visibleTasks.length && (
            <p className="rounded-xl border border-dashed border-slate-200 p-4 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
              No supporting work items captured during this window.
            </p>
          )}
        </div>
      </section>

      {aggregatedTimeline.length ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-300">
          <header className="mb-2 flex items-center gap-2 text-xs uppercase tracking-wide text-slate-400 dark:text-slate-500">
            <Activity className="h-4 w-4" /> Recent timeline
          </header>
          <ul className="space-y-2">
            {aggregatedTimeline.map((event) => (
              <li key={`${event.issueId}-${event.at}-${event.label}`} className="rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-2 dark:border-slate-800 dark:bg-slate-900/60">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
                    {event.issueKey}
                  </span>
                  <span className="text-[11px] text-slate-400 dark:text-slate-500">
                    {new Date(event.at).toLocaleString()}
                  </span>
                </div>
                <p className="mt-1 text-slate-700 dark:text-slate-200">{event.label}</p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <footer className="mt-auto grid grid-cols-2 gap-3 text-center text-sm">
        <Metric label="Hours" value={`${(metrics.worklogMinutes / 60).toFixed(1)}h`} />
        <Metric label="Touched" value={metrics.tasksTouched.toString()} />
        <Metric label="Done" value={metrics.doneCount.toString()} />
        <Metric label="Blockers" value={metrics.blockerCount.toString()} />
      </footer>
    </aside>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-3 dark:border-slate-800 dark:bg-slate-900/50">
      <p className="text-xs uppercase tracking-wide text-slate-400 dark:text-slate-500">{label}</p>
      <p className="text-base font-semibold text-slate-900 dark:text-slate-100">{value}</p>
    </div>
  );
}

function InfoCard({
  title,
  body,
  icon: Icon,
}: {
  title: string;
  body: ReactNode;
  icon?: LucideIcon;
}) {
  const content =
    typeof body === "string" ? (
      <p className="leading-relaxed text-slate-700 dark:text-slate-200">{body}</p>
    ) : (
      body
    );

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-700 dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-300">
      <header className="flex items-center gap-2 text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
        {Icon ? <Icon className="h-4 w-4" /> : null}
        {title}
      </header>
      <div className="mt-2 space-y-2">{content}</div>
    </section>
  );
}

function SummarySection({
  title,
  emptyLabel,
  children,
}: {
  title: string;
  emptyLabel: string;
  children: ReactNode;
}) {
  const nodes = Children.toArray(children);
  const hasContent = nodes.length > 0;
  return (
    <section className="space-y-2">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
        {title}
      </h4>
      {hasContent ? (
        <ul className="grid gap-2">{children}</ul>
      ) : (
        <p className="rounded-xl border border-dashed border-slate-200 p-3 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
          {emptyLabel}
        </p>
      )}
    </section>
  );
}

function extractUserStructuredNarrative(value: unknown): UserNarrativeStructured | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const record = value as Record<string, unknown>;
  if (typeof record.story !== "string") {
    return null;
  }
  return {
    story: record.story,
    spotlight: toStringArray(record.spotlight),
    risks: toStringArray(record.risks),
    nextMoves: toStringArray(record.nextMoves),
    tone: isNarrativeTone(record.tone) ? record.tone : "neutral",
  };
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
    .map((entry) => entry.trim());
}

function isNarrativeTone(value: unknown): value is NarrativeTone {
  return value === "positive" || value === "negative" || value === "neutral";
}

function toneBadgeClass(tone: NarrativeTone) {
  switch (tone) {
    case "positive":
      return "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200";
    case "negative":
      return "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-200";
    default:
      return "bg-slate-100 text-slate-600 dark:bg-slate-800/40 dark:text-slate-300";
  }
}

function DecisionList({
  title,
  decisions,
  emptyLabel,
}: {
  title: string;
  decisions: { issueId: string; issueKey: string; description: string }[];
  emptyLabel: string;
}) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
        {title}
      </p>
      {decisions.length ? (
        <ul className="space-y-2">
          {decisions.map((decision) => (
            <li key={decision.issueId} className="rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-2 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-300">
              <p className="font-medium text-slate-700 dark:text-slate-200">{decision.issueKey}</p>
              <p className="mt-1 text-slate-500 dark:text-slate-400">{decision.description}</p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-xl border border-dashed border-slate-200 px-3 py-2 text-xs text-slate-500 dark:border-slate-700 dark:text-slate-400">
          {emptyLabel}
        </p>
      )}
    </div>
  );
}

function TaskCard({
  task,
  onOpenIssue,
}: {
  task: TaskSummarySnapshotRecord;
  onOpenIssue: (issueId: string) => void;
}) {
  const payload = task.payload;
  const lastEvent: TaskTimelineEvent | undefined = payload.timeline[payload.timeline.length - 1];

  return (
    <article className="space-y-3 rounded-2xl border border-slate-200 bg-white p-3 text-sm text-slate-700 dark:border-slate-800 dark:bg-slate-900/80 dark:text-slate-300">
      <header className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-wide text-slate-400 dark:text-slate-500">{payload.issueKey}</p>
          <p className="truncate font-semibold text-slate-800 dark:text-slate-100" title={payload.headline}>{payload.headline}</p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onOpenIssue(payload.issueId)}
          className="inline-flex items-center gap-1 text-xs"
        >
          View
          <ArrowUpRight className="h-3 w-3" />
        </Button>
      </header>
      <ul className="flex flex-wrap gap-2 text-xs">
        {payload.riskFlags.map((flag) => (
          <li
            key={flag}
            className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-700 dark:bg-amber-900/40 dark:text-amber-200"
          >
            {flag.replace(/_/g, " ")}
          </li>
        ))}
      </ul>
      <div className="grid gap-2 text-xs text-slate-500 dark:text-slate-400">
        <p>
          <span className="font-semibold text-slate-600 dark:text-slate-200">Progress bullets:</span> {payload.activityBullets.join(" · ")}
        </p>
        {lastEvent ? (
          <p>
            <span className="font-semibold text-slate-600 dark:text-slate-200">Last touch:</span> {lastEvent.label}
          </p>
        ) : null}
        <p>
          <span className="font-semibold text-slate-600 dark:text-slate-200">Participants:</span> {payload.participants.map((participant) => participant.displayName).join(", ") || "—"}
        </p>
      </div>
      {payload.linkedResources.length ? (
        <ul className="space-y-1 text-xs text-slate-500 dark:text-slate-400">
          {payload.linkedResources.map((resource) => (
            <li key={`${resource.type}-${resource.url}`}>
              <a
                href={resource.url}
                target="_blank"
                rel="noreferrer"
                className="text-slate-700 underline decoration-slate-400/60 hover:text-slate-900 dark:text-slate-200 dark:decoration-slate-500"
              >
                [{resource.type.toUpperCase()}] {resource.label}
              </a>
            </li>
          ))}
        </ul>
      ) : null}
    </article>
  );
}

function formatStatusLabel(status: string) {
  return status.replace(/_/g, " ").toLowerCase();
}

function deriveStatus(userSummary: UserSummarySnapshotRecord, forceUnavailable = false) {
  if (forceUnavailable || userSummary.payload.riskFlags.includes("unavailable")) {
    return "offline";
  }
  const blockers = userSummary.payload.blockers.length;
  const hasActivity = userSummary.payload.activityMetrics.tasksTouched > 0;
  if (blockers > 0) {
    return "blocked";
  }
  if (!hasActivity) {
    return "idle";
  }
  return "onTrack";
}

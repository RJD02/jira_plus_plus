import { useState } from "react";
import { gql, useQuery } from "@apollo/client";
import clsx from "clsx";

const REPORT_DEFINITIONS_QUERY = gql`
  query ReportDefinitions {
    reportingDefinitions {
      id
      slug
      name
      type
      personaTags
      currentVersion {
        id
        status
        publishedAt
      }
    }
  }
`;

const REPORT_DETAIL_QUERY = gql`
  query ReportDefinition($id: ID!) {
    reportDefinition(id: $id) {
      id
      slug
      name
      description
      type
      personaTags
      versions {
        id
        status
        notes
        publishedAt
        createdAt
      }
      runs {
        id
        reportVersionId
        status
        executedAt
        durationMs
        cacheHit
        payload
        error
      }
    }
  }
`;

type ReportDefinitionSummary = {
  id: string;
  slug: string;
  name: string;
  type: string;
  personaTags: string[];
  currentVersion: { id: string; status: string; publishedAt: string | null } | null;
};

type ReportRunDetail = {
  id: string;
  status: string;
  executedAt: string;
  durationMs: number;
  payload: {
    table?: { columns: string[]; rows: unknown[][] };
    metadata?: Record<string, unknown>;
  } | null;
  error: string | null;
};

type ReportDetail = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  type: string;
  personaTags: string[];
  versions: { id: string; status: string; notes: string | null; publishedAt: string | null; createdAt: string }[];
  runs: ReportRunDetail[];
};

export function ReportsPage() {
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);

  const { data, loading, error } = useQuery<{ reportingDefinitions: ReportDefinitionSummary[] }>(
    REPORT_DEFINITIONS_QUERY,
  );

  const {
    data: detailData,
    loading: detailLoading,
    error: detailError,
  } = useQuery<{ reportDefinition: ReportDetail }>(REPORT_DETAIL_QUERY, {
    variables: { id: selectedReportId },
    skip: !selectedReportId,
  });

  const definitions = data?.reportingDefinitions ?? [];
  const detail = detailData?.reportDefinition ?? null;

  return (
    <section className="space-y-6">
      <header className="space-y-2">
        <h2 className="text-3xl font-semibold text-slate-900 dark:text-slate-100">Reports</h2>
        <p className="text-slate-600 dark:text-slate-300">
          View pre-built reports and data summaries for your projects.
        </p>
      </header>

      {error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700 dark:border-rose-400/30 dark:bg-rose-400/10 dark:text-rose-300">
          {error.message}
        </div>
      ) : null}

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
          <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-slate-600 dark:border-slate-600 dark:border-t-slate-300" />
          Loading reports...
        </div>
      ) : definitions.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
          No reports available. Seed report definitions to get started.
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {definitions.map((def) => (
            <button
              key={def.id}
              type="button"
              onClick={() => setSelectedReportId(def.id === selectedReportId ? null : def.id)}
              className={clsx(
                "rounded-xl border p-5 text-left transition",
                def.id === selectedReportId
                  ? "border-sky-400 bg-sky-50 shadow-sm dark:border-sky-500 dark:bg-sky-950/30"
                  : "border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:hover:border-slate-600",
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-semibold text-slate-900 dark:text-slate-100">{def.name}</h3>
                {def.currentVersion ? (
                  <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                    Published
                  </span>
                ) : (
                  <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                    Draft
                  </span>
                )}
              </div>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                {def.type} &middot; {def.personaTags.join(", ") || "All users"}
              </p>
            </button>
          ))}
        </div>
      )}

      {selectedReportId ? (
        <ReportDetailView detail={detail} loading={detailLoading} error={detailError?.message ?? null} />
      ) : null}
    </section>
  );
}

function ReportDetailView({
  detail,
  loading,
  error,
}: {
  detail: ReportDetail | null;
  loading: boolean;
  error: string | null;
}) {
  if (error) {
    return (
      <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700 dark:border-rose-400/30 dark:bg-rose-400/10 dark:text-rose-300">
        {error}
      </div>
    );
  }

  if (loading || !detail) {
    return (
      <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
        <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-slate-600 dark:border-slate-600 dark:border-t-slate-300" />
        Loading report details...
      </div>
    );
  }

  const latestRun = detail.runs.find((r) => r.status === "COMPLETED" && r.payload?.table);
  const table = latestRun?.payload?.table;

  return (
    <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-700 dark:bg-slate-900">
      <div className="space-y-1">
        <h3 className="text-xl font-semibold text-slate-900 dark:text-slate-100">{detail.name}</h3>
        {detail.description ? (
          <p className="text-sm text-slate-600 dark:text-slate-300">{detail.description}</p>
        ) : null}
        <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
          <span>Type: {detail.type}</span>
          <span>&middot;</span>
          <span>Tags: {detail.personaTags.join(", ") || "none"}</span>
          <span>&middot;</span>
          <span>Versions: {detail.versions.length}</span>
          <span>&middot;</span>
          <span>Runs: {detail.runs.length}</span>
        </div>
      </div>

      {table ? (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-700">
                {table.columns.map((col) => (
                  <th
                    key={col}
                    className="whitespace-nowrap px-3 py-2 font-semibold text-slate-700 dark:text-slate-200"
                  >
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.rows.map((row, i) => (
                <tr
                  key={i}
                  className="border-b border-slate-100 last:border-0 dark:border-slate-800"
                >
                  {row.map((cell, j) => (
                    <td key={j} className="whitespace-nowrap px-3 py-2 text-slate-600 dark:text-slate-300">
                      {String(cell ?? "")}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {latestRun ? (
            <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">
              Run completed at {new Date(latestRun.executedAt).toLocaleString()} &middot; {latestRun.durationMs}ms
            </p>
          ) : null}
        </div>
      ) : (
        <div className="rounded-lg border border-slate-100 bg-slate-50 p-6 text-center text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-800/50 dark:text-slate-400">
          No report data available. Run a report to see results here.
        </div>
      )}
    </div>
  );
}

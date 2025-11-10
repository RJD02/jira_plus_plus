import type { CatalogDataset, CatalogDatasetField } from "@reporting/catalog";
import { randomUUID } from "node:crypto";
import type { AgentSuggestion } from "@reporting/temporal";

export interface AgentHeuristicContext {
  prompt: string;
  persona?: string | null;
  datasets: CatalogDataset[];
}

export function buildHeuristicSuggestions({
  prompt,
  persona,
  datasets,
}: AgentHeuristicContext): AgentSuggestion[] {
  const normalisedPersona = persona?.trim().toUpperCase() || null;
  const primaryDatasets = datasets.length > 0 ? datasets : [];

  if (!primaryDatasets.length) {
    return [buildFallbackSuggestion({ prompt, persona: normalisedPersona })];
  }

  return primaryDatasets.slice(0, 3).flatMap((dataset, index) =>
    buildSuggestionsForDataset(dataset, {
      prompt,
      persona: normalisedPersona,
      rank: index,
    }),
  );
}

export function summariseSuggestions(
  suggestions: AgentSuggestion[],
  persona?: string | null,
): string {
  if (!suggestions.length) {
    return "No actionable insight surfaced.";
  }
  const personaLabel = persona ? persona.toUpperCase() : "your persona";
  const topTitles = suggestions.slice(0, 2).map((item) => `• ${item.title}`);
  return [`Here are the next bets for ${personaLabel}:`, ...topTitles].join("\n");
}

interface DatasetSuggestionArgs {
  prompt: string;
  persona: string | null;
  rank: number;
}

function buildSuggestionsForDataset(
  dataset: CatalogDataset,
  args: DatasetSuggestionArgs,
): AgentSuggestion[] {
  const { prompt, persona, rank } = args;
  const numericFields = dataset.fields.filter((field) => isNumeric(field.type));
  const timeFields = dataset.fields.filter((field) => isTimeField(field.type));
  const categoricalFields = dataset.fields.filter((field) => isCategorical(field.type));

  const primaryFields = selectTopFields(dataset.fields, prompt, 4);
  const metricField =
    selectTopFields(numericFields, prompt, 1)[0] ??
    numericFields[0] ??
    primaryFields.find((field) => isNumeric(field.type));
  const categoryField =
    selectTopFields(categoricalFields, prompt, 1)[0] ??
    categoricalFields[0] ??
    primaryFields.find((field) => isCategorical(field.type));

  const baseFilters: Record<string, unknown> = {
    datasetId: dataset.id,
    persona,
  };

  const suggestions: AgentSuggestion[] = [];

  suggestions.push({
    id: randomUUID(),
    title: `Explore ${dataset.displayName}`,
    summary: buildSummary(dataset, categoryField, metricField, persona),
    query: buildRankingQuery(dataset, categoryField, metricField, primaryFields),
    filters: {
      ...baseFilters,
      defaults: defaultFilterPayload(dataset, timeFields[0] ?? null),
    },
    datasetId: dataset.id,
    persona,
  });

  if (timeFields.length > 0 && metricField) {
    const timeField = selectTopFields(timeFields, prompt, 1)[0] ?? timeFields[0];
    suggestions.push({
      id: randomUUID(),
      title: `Trend ${metricField.name} over time`,
      summary: `Plot ${metricField.name} grouped by ${timeField.name} to track movement for ${dataset.displayName.toLowerCase()}.`,
      query: buildTrendQuery(dataset, timeField, metricField, categoryField),
      filters: {
        ...baseFilters,
        defaults: defaultFilterPayload(dataset, timeField),
        groupBy: timeField.name,
      },
      datasetId: dataset.id,
      persona,
    });
  } else if (rank === 0 && primaryFields.length > 1) {
    suggestions.push({
      id: randomUUID(),
      title: `Slice ${dataset.displayName}`,
      summary: `Compare ${primaryFields
        .slice(0, 2)
        .map((field) => field.name)
        .join(" vs ")} to identify outliers for the selected persona.`,
      query: buildPivotQuery(dataset, primaryFields),
      filters: baseFilters,
      datasetId: dataset.id,
      persona,
    });
  }

  return suggestions;
}

function buildFallbackSuggestion({
  prompt,
  persona,
}: {
  prompt: string;
  persona: string | null;
}): AgentSuggestion {
  const keywords =
    prompt.length > 0
      ? prompt
          .split(/\s+/)
          .filter((word) => word.length > 4)
          .slice(0, 3)
      : ["performance", "risk", "trend"];

  return {
    id: randomUUID(),
    title: "Draft a report blueprint",
    summary: `Start by clarifying which dataset tracks ${keywords.join(", ")} for ${persona ?? "your persona"} and outline the filters you care about.`,
    query: [
      "SELECT",
      "  /* identify relevant metrics */",
      "FROM /* replace_with_dataset */",
      "WHERE /* introduce scope + filters */",
      "LIMIT 50;",
    ].join("\n"),
    filters: {
      persona,
      prompt,
    },
    datasetId: null,
    persona,
  };
}

function buildRankingQuery(
  dataset: CatalogDataset,
  categoryField: CatalogDatasetField | undefined,
  metricField: CatalogDatasetField | undefined,
  primaryFields: CatalogDatasetField[],
): string {
  const selectFields = [
    ...(categoryField ? [categoryField.name] : []),
    ...(metricField ? [`SUM(${metricField.name}) AS total_${metricField.name}`] : []),
  ];

  if (!selectFields.length) {
    selectFields.push(...primaryFields.slice(0, 3).map((field) => field.name));
  }

  const lines = [
    "SELECT",
    `  ${selectFields.join(", ")}`,
    `FROM ${dataset.source ?? dataset.id}`,
    "WHERE 1=1",
    "  -- add scope filters (tenant / project / team)",
  ];

  if (categoryField && metricField) {
    lines.push(`GROUP BY ${categoryField.name}`);
    lines.push(`ORDER BY total_${metricField.name} DESC`);
  } else if (metricField) {
    lines.push(`ORDER BY ${metricField.name} DESC`);
  }

  lines.push("LIMIT 50;");
  return lines.join("\n");
}

function buildTrendQuery(
  dataset: CatalogDataset,
  timeField: CatalogDatasetField,
  metricField: CatalogDatasetField,
  categoryField?: CatalogDatasetField,
): string {
  const lines = [
    "SELECT",
    `  DATE_TRUNC('week', ${timeField.name}) AS week_start,`,
    `  ${categoryField ? `${categoryField.name},` : ""}`,
    `  AVG(${metricField.name}) AS avg_${metricField.name}`,
    `FROM ${dataset.source ?? dataset.id}`,
    "WHERE 1=1",
    "  -- inject scope and dynamic filters",
    "GROUP BY 1" + (categoryField ? ", 2" : ""),
    "ORDER BY week_start DESC",
    "LIMIT 16;",
  ];
  return lines.join("\n");
}

function buildPivotQuery(dataset: CatalogDataset, fields: CatalogDatasetField[]): string {
  const dimensions = fields.slice(0, 2).map((field) => field.name);
  const metric = fields.find((field) => isNumeric(field.type));
  const selectParts = [...dimensions];
  if (metric) {
    selectParts.push(`${metric.name} AS metric_value`);
  }
  const lines = [
    "SELECT",
    `  ${selectParts.join(", ")}`,
    `FROM ${dataset.source ?? dataset.id}`,
    "WHERE 1=1",
    "  -- add filter conditions",
    "ORDER BY 1, 2",
    "LIMIT 200;",
  ];
  return lines.join("\n");
}

function defaultFilterPayload(dataset: CatalogDataset, timeField: CatalogDatasetField | null) {
  const payload: Record<string, unknown> = {
    datasetId: dataset.id,
  };
  if (timeField) {
    payload[timeField.name] = {
      range: "last_30_days",
    };
  }
  return payload;
}

function buildSummary(
  dataset: CatalogDataset,
  categoryField: CatalogDatasetField | undefined,
  metricField: CatalogDatasetField | undefined,
  persona: string | null,
) {
  if (categoryField && metricField) {
    return `Rank ${categoryField.name.toLowerCase()} by ${metricField.name.toLowerCase()} to spotlight where ${persona ?? "your persona"} should focus.`;
  }
  if (metricField) {
    return `Surface top ${dataset.displayName.toLowerCase()} entries sorted by ${metricField.name.toLowerCase()}.`;
  }
  return `Explore ${dataset.displayName.toLowerCase()} using the most relevant fields for ${persona ?? "your persona"}.`;
}

function selectTopFields(
  fields: CatalogDatasetField[],
  prompt: string,
  limit: number,
): CatalogDatasetField[] {
  if (!fields.length) {
    return [];
  }
  if (!prompt.trim()) {
    return fields.slice(0, limit);
  }
  const lowerPrompt = prompt.toLowerCase();
  return fields
    .map((field) => ({
      field,
      score: computeFieldRelevance(field, lowerPrompt),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((item) => item.field);
}

function computeFieldRelevance(field: CatalogDatasetField, prompt: string): number {
  const nameScore = prompt.includes(field.name.toLowerCase()) ? 3 : 0;
  const descriptionScore = field.description
    ? prompt.includes(field.description.toLowerCase())
      ? 2
      : 0
    : 0;
  const typeScore = isNumeric(field.type) ? 1 : 0;
  return nameScore + descriptionScore + typeScore;
}

function isNumeric(type: string): boolean {
  return ["number", "decimal", "float", "double", "int", "integer"].includes(type.toLowerCase());
}

function isTimeField(type: string): boolean {
  const normalised = type.toLowerCase();
  return ["date", "datetime", "timestamp"].includes(normalised);
}

function isCategorical(type: string): boolean {
  const normalised = type.toLowerCase();
  return !isNumeric(normalised) && !isTimeField(normalised);
}

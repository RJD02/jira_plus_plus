import type { CatalogDataset, CatalogDatasetField } from "@reporting/catalog";
import { getCatalogProvider } from "../catalog.js";
import { Prisma } from "../generated/client/index.js";

export interface BuildPreviewPayloadOptions {
  runId: string;
  tenantId: string;
  definitionName: string;
  definitionSlug: string;
  queryTemplate?: string | null;
  defaultFilters?: Prisma.JsonValue | null;
  filters: Record<string, unknown>;
}

export async function buildPreviewPayload({
  runId,
  definitionName,
  definitionSlug,
  queryTemplate,
  defaultFilters,
  filters,
}: BuildPreviewPayloadOptions) {
  const catalog = getCatalogProvider();
  const mergedFilters = {
    ...coerceJsonObject(defaultFilters),
    ...filters,
  };

  const datasetId = extractDatasetId(mergedFilters);

  let dataset: CatalogDataset | null = null;
  if (datasetId) {
    dataset = await catalog.getDataset(datasetId);
  }
  if (!dataset) {
    const datasets = await catalog.listDatasets();
    dataset = datasets[0] ?? null;
  }

  const columns = deriveColumns({ dataset, queryTemplate });
  const rows = generateRows({ runId, columns, dataset });

  return {
    table: {
      columns,
      rows,
    },
    metadata: {
      datasetId: dataset?.id ?? null,
      datasetName: dataset?.displayName ?? null,
      definition: {
        name: definitionName,
        slug: definitionSlug,
      },
      filters: mergedFilters,
      queryTemplate: queryTemplate ?? null,
      generatedAt: new Date().toISOString(),
      mode: "synthetic-preview",
    },
  };
}

export function coerceJsonObject(value: Prisma.JsonValue | null | undefined): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function extractDatasetId(filters: Record<string, unknown>): string | null {
  if (typeof filters.datasetId === "string" && filters.datasetId.trim().length) {
    return filters.datasetId.trim();
  }
  if (typeof filters.dataset === "object" && filters.dataset) {
    const candidate = (filters.dataset as Record<string, unknown>).id;
    if (typeof candidate === "string" && candidate.trim().length) {
      return candidate.trim();
    }
  }
  return null;
}

function deriveColumns({
  dataset,
  queryTemplate,
}: {
  dataset: CatalogDataset | null;
  queryTemplate?: string | null;
}): string[] {
  if (dataset && dataset.fields.length) {
    return dataset.fields.map((field) => field.name).slice(0, 6);
  }
  const fromQuery = extractColumnsFromQuery(queryTemplate);
  if (fromQuery.length) {
    return fromQuery.slice(0, 6);
  }
  return ["metric", "value"];
}

function extractColumnsFromQuery(queryTemplate?: string | null): string[] {
  if (!queryTemplate) {
    return [];
  }
  const match = queryTemplate.match(/select\s+([\s\S]*?)\s+from/i);
  if (!match) {
    return [];
  }
  return match[1]
    .split(",")
    .map((segment) => segment.trim())
    .filter(Boolean)
    .map((segment) => segment.replace(/\s+AS\s+.*$/i, "").replace(/["`]/g, ""))
    .map((segment) => segment.replace(/\bSUM\(|\bAVG\(|\bCOUNT\(/gi, "").replace(/\)$/g, "").trim())
    .filter((segment) => segment.length > 0);
}

function generateRows({
  runId,
  columns,
  dataset,
}: {
  runId: string;
  columns: string[];
  dataset: CatalogDataset | null;
}): unknown[][] {
  const rowCount = Math.max(1, Math.min(3, columns.length ? 3 : 1));
  const seed = deriveSeed(runId);
  const fieldMap = new Map<string, CatalogDatasetField>();
  if (dataset) {
    for (const field of dataset.fields) {
      fieldMap.set(field.name, field);
    }
  }

  return Array.from({ length: rowCount }, (_, rowIndex) =>
    columns.map((column, columnIndex) => {
      const field = fieldMap.get(column);
      return sampleValue({ column, field, rowIndex, columnIndex, seed });
    }),
  );
}

function sampleValue({
  column,
  field,
  rowIndex,
  columnIndex,
  seed,
}: {
  column: string;
  field?: CatalogDatasetField;
  rowIndex: number;
  columnIndex: number;
  seed: number;
}): unknown {
  const type = field?.type?.toLowerCase() ?? "";
  if (["number", "decimal", "float", "double", "int", "integer"].includes(type)) {
    return seed + rowIndex * 11 + columnIndex * 3;
  }
  if (["date"].includes(type)) {
    const date = new Date(Date.now() - (rowIndex + columnIndex) * 24 * 60 * 60 * 1000);
    return date.toISOString().split("T")[0];
  }
  if (["datetime", "timestamp"].includes(type)) {
    const date = new Date(Date.now() - (rowIndex * 60 + columnIndex * 5) * 60 * 1000);
    return date.toISOString();
  }
  if (["boolean", "bool"].includes(type)) {
    return (seed + rowIndex + columnIndex) % 2 === 0;
  }
  if (["ratio", "percent"].includes(type)) {
    return ((seed + rowIndex + columnIndex) % 100) / 100;
  }
  return `Row ${rowIndex + 1} · ${column}`;
}

function deriveSeed(runId: string): number {
  return [...runId].reduce((acc, char) => acc + char.charCodeAt(0), 0) % 97;
}

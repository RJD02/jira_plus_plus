import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  type CatalogDataset,
  type CatalogProvider,
} from "@reporting/catalog";
import { createMetadataClient, MetadataClient, type MetadataClientMode } from "@metadata/client";

const runtimeDir = path.dirname(fileURLToPath(import.meta.url));
const serviceRoot = path.resolve(runtimeDir, "..");
const repoRoot = path.resolve(serviceRoot, "..", "..");

const DEFAULT_CATALOG_PATH = path.resolve(repoRoot, "configs", "reporting", "catalog.json");

const fallbackManifest: CatalogDataset[] = [
  {
    id: "jira_issues_summary",
    displayName: "Jira Issues Summary",
    description: "Curated rollup of Jira issues with project, status, assignee, and sprint metadata.",
    source: "cdm.jira_issues",
    fields: [
      { name: "issue_key", type: "string", description: "Human readable Jira key (e.g. ABC-123)" },
      { name: "project_key", type: "string", description: "Owning Jira project key" },
      { name: "project_name", type: "string", description: "Owning Jira project name" },
      { name: "status", type: "string", description: "Current Jira status" },
      { name: "assignee", type: "string", description: "Current issue assignee display name" },
      { name: "story_points", type: "number", description: "Story points estimate" },
      { name: "updated_at", type: "datetime", description: "Last sync timestamp" },
    ],
  },
  {
    id: "daily_summary_metrics",
    displayName: "Daily Summary Metrics",
    description: "Per-project snapshot of daily standup metrics and sentiment scores.",
    source: "cdm.daily_summary",
    fields: [
      { name: "summary_date", type: "date", description: "Snapshot date (UTC)" },
      { name: "project_id", type: "string", description: "Platform project identifier" },
      { name: "project_name", type: "string", description: "Human readable project name" },
      { name: "active_users", type: "number", description: "Active contributors for the day" },
      { name: "blocker_count", type: "number", description: "Number of blockers detected" },
      { name: "mood_score", type: "number", description: "Average sentiment score" },
    ],
  },
];

let cachedProvider: CatalogProvider | null = null;

export function getCatalogProvider(): CatalogProvider {
  if (!cachedProvider) {
    cachedProvider = createMetadataBackedProvider();
  }
  return cachedProvider;
}

function createMetadataBackedProvider(): CatalogProvider {
  const manifestPath =
    process.env.REPORTING_CATALOG_PATH ??
    path.resolve(repoRoot, "configs", "reporting", "catalog.json");
  const graphqlEndpoint = process.env.METADATA_GRAPHQL_ENDPOINT;
  const mode = process.env.METADATA_CLIENT_MODE as MetadataClientMode | undefined;

  const metadataClient = createMetadataClient({
    mode,
    manifestPath,
    graphqlEndpoint,
  });

  return new MetadataCatalogProvider(metadataClient);
}

class MetadataCatalogProvider implements CatalogProvider {
  constructor(private readonly metadataClient: MetadataClient) {}

  async listDatasets(): Promise<CatalogDataset[]> {
    try {
      const datasets = await this.metadataClient.listDatasets();
      if (!datasets.length) {
        return fallbackManifest;
      }
      return datasets.map(toCatalogDataset);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.warn("Failed to list metadata datasets, using fallback manifest", error);
      return fallbackManifest;
    }
  }

  async getDataset(id: string): Promise<CatalogDataset | null> {
    try {
      const dataset = await this.metadataClient.getDataset(id);
      if (dataset) {
        return toCatalogDataset(dataset);
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.warn(`Failed to fetch dataset ${id} from metadata service`, error);
    }
    return fallbackManifest.find((dataset) => dataset.id === id) ?? null;
  }
}

function toCatalogDataset(dataset: {
  id: string;
  displayName: string;
  description?: string | null;
  source?: string | null;
  fields: Array<{ name: string; type: string; description?: string | null }>;
}): CatalogDataset {
  return {
    id: dataset.id,
    displayName: dataset.displayName,
    description: dataset.description ?? undefined,
    source: dataset.source ?? undefined,
    fields: dataset.fields.map((field) => ({
      name: field.name,
      type: field.type,
      description: field.description ?? undefined,
    })),
  };
}

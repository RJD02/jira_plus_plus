import { type MetadataStore, type MetadataEndpointDescriptor, type HttpVerb } from "@metadata/core";
import sampleData from "../fixtures/sample-metadata.json";

const CATALOG_DATASET_DOMAIN = process.env.METADATA_CATALOG_DOMAIN ?? "catalog.dataset";
const DEFAULT_PROJECT_ID = process.env.METADATA_DEFAULT_PROJECT ?? "global";

type SampleEndpoint = MetadataEndpointDescriptor & { verb?: string };
type SampleDataset = {
  id: string;
  labels?: string[];
  sourceEndpointId?: string;
  projectId?: string;
  payload: Record<string, unknown>;
};

export async function seedMetadataStoreIfEmpty(store: MetadataStore): Promise<void> {
  if (process.env.METADATA_DISABLE_SEED === "1") {
    return;
  }
  const projectId = sampleData.projectId ?? DEFAULT_PROJECT_ID;
  const [existingDatasets, existingEndpoints] = await Promise.all([
    store.listRecords(CATALOG_DATASET_DOMAIN, { projectId, limit: 1 }),
    store.listEndpoints(projectId),
  ]);
  if (existingDatasets.length > 0 || existingEndpoints.length > 0) {
    return;
  }

  const now = new Date().toISOString();
  const endpoints: SampleEndpoint[] = sampleData.endpoints ?? [];
  const datasets: SampleDataset[] = sampleData.datasets ?? [];
  const defaultEndpointId = endpoints[0]?.id;

  for (const endpoint of endpoints) {
    const descriptor: MetadataEndpointDescriptor = {
      ...endpoint,
      projectId: endpoint.projectId ?? projectId,
      verb: (endpoint.verb ?? "POST") as HttpVerb,
    };
    await store.registerEndpoint(descriptor);
  }

  for (const dataset of datasets) {
    const sourceEndpointId = dataset.sourceEndpointId ?? defaultEndpointId;
    const basePayload = { ...dataset.payload };
    const existingMetadata = (basePayload["_metadata"] as Record<string, unknown> | undefined) ?? {};
    const collectedAt = (existingMetadata["collected_at"] as string | undefined) ?? now;
    const payload = {
      ...basePayload,
      metadata_endpoint_id: basePayload["metadata_endpoint_id"] ?? sourceEndpointId,
      _metadata: {
        ...existingMetadata,
        source_endpoint_id: sourceEndpointId,
        source_id: sourceEndpointId,
        collected_at: collectedAt,
      },
    };
    await store.upsertRecord({
      id: dataset.id,
      projectId: dataset.projectId ?? projectId,
      domain: CATALOG_DATASET_DOMAIN,
      labels: dataset.labels ?? sampleData.labels ?? [],
      payload,
    });
  }
}

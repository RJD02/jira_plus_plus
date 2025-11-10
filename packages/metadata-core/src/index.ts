import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

export type MetadataLabel = string;

export type MetadataEndpointFieldValueType =
  | "STRING"
  | "PASSWORD"
  | "NUMBER"
  | "BOOLEAN"
  | "URL"
  | "HOSTNAME"
  | "PORT"
  | "JSON"
  | "ENUM"
  | "LIST";

export type MetadataEndpointFieldSemantic =
  | "HOST"
  | "PORT"
  | "DATABASE"
  | "USERNAME"
  | "PASSWORD"
  | "API_TOKEN"
  | "PROJECT"
  | "SCHEMA"
  | "TABLE"
  | "WAREHOUSE"
  | "ROLE"
  | "ENVIRONMENT"
  | "CLUSTER"
  | "TOPIC"
  | "GENERIC";

export type MetadataEndpointFieldOption = {
  label: string;
  value: string;
  description?: string;
};

export type MetadataEndpointFieldDescriptor = {
  key: string;
  label: string;
  required: boolean;
  valueType: MetadataEndpointFieldValueType;
  semantic?: MetadataEndpointFieldSemantic;
  description?: string;
  placeholder?: string;
  helpText?: string;
  regex?: string;
  min?: number;
  max?: number;
  options?: MetadataEndpointFieldOption[];
};

export type MetadataEndpointCapabilityDescriptor = {
  key: string;
  label: string;
  description?: string;
};

export type MetadataEndpointTemplateDescriptor = {
  id: string;
  family: "JDBC" | "HTTP" | "STREAM";
  title: string;
  vendor: string;
  description?: string;
  domain?: string;
  categories: string[];
  protocols: string[];
  defaultPort?: number;
  driver?: string;
  docsUrl?: string;
  agentPrompt?: string;
  defaultLabels?: string[];
  fields: MetadataEndpointFieldDescriptor[];
  capabilities: MetadataEndpointCapabilityDescriptor[];
  sampleConfig?: Record<string, unknown>;
};

export type MetadataEndpointTestResult = {
  success: boolean;
  message?: string;
  detectedVersion?: string;
  capabilities?: string[];
  details?: Record<string, unknown>;
};

export type MetadataEndpointDescriptor = {
  id?: string;
  sourceId?: string;
  name: string;
  description?: string;
  verb: HttpVerb;
  url: string;
  authPolicy?: string;
  projectId?: string;
  domain?: string;
  labels?: string[];
  config?: Record<string, unknown> | null;
  detectedVersion?: string | null;
  versionHint?: string | null;
  capabilities?: string[];
  createdAt?: string;
  updatedAt?: string;
};

export type HttpVerb = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export type MetadataDomainSummary = {
  key: string;
  title: string;
  description?: string;
  itemCount: number;
};

export type MetadataRecordInput<TPayload> = {
  id?: string;
  projectId: string;
  domain: string;
  labels?: MetadataLabel[];
  payload: TPayload;
};

export type MetadataRecord<TPayload> = MetadataRecordInput<TPayload> & {
  id: string;
  createdAt: string;
  updatedAt: string;
};

export type RecordFilter = {
  projectId?: string;
  labels?: string[];
  search?: string;
  limit?: number;
};

export interface MetadataStore {
  listRecords<T = Record<string, unknown>>(domain: string, filter?: RecordFilter): Promise<MetadataRecord<T>[]>;
  getRecord<T = Record<string, unknown>>(domain: string, id: string): Promise<MetadataRecord<T> | null>;
  upsertRecord<T = Record<string, unknown>>(input: MetadataRecordInput<T>): Promise<MetadataRecord<T>>;
  deleteRecord(domain: string, id: string): Promise<void>;
  listDomains(): Promise<MetadataDomainSummary[]>;
  listEndpoints(projectId?: string): Promise<MetadataEndpointDescriptor[]>;
  registerEndpoint(endpoint: MetadataEndpointDescriptor): Promise<MetadataEndpointDescriptor>;
}

export type FileMetadataStoreOptions = {
  rootDir?: string;
  filename?: string;
};

const DEFAULT_DATA_DIR = path.resolve(process.cwd(), "metadata", "store");
const RECORDS_FILE = "records.json";
const ENDPOINTS_FILE = "endpoints.json";

export class FileMetadataStore implements MetadataStore {
  private readonly rootDir: string;
  private readonly recordsFile: string;
  private readonly endpointsFile: string;

  constructor(options?: FileMetadataStoreOptions) {
    this.rootDir = options?.rootDir ?? DEFAULT_DATA_DIR;
    this.recordsFile = path.resolve(this.rootDir, options?.filename ?? RECORDS_FILE);
    this.endpointsFile = path.resolve(this.rootDir, ENDPOINTS_FILE);
  }

  async listRecords<T = Record<string, unknown>>(domain: string, filter?: RecordFilter): Promise<MetadataRecord<T>[]> {
    const records = await this.loadRecords<T>();
    return records
      .filter((record) => record.domain === domain)
      .filter((record) => {
        if (filter?.projectId && record.projectId !== filter.projectId) {
          return false;
        }
        if (filter?.labels?.length) {
          const labels = record.labels ?? [];
          if (!filter.labels.every((label) => labels.includes(label))) {
            return false;
          }
        }
        if (filter?.search) {
          const haystack = JSON.stringify(record.payload).toLowerCase();
          if (!haystack.includes(filter.search.toLowerCase())) {
            return false;
          }
        }
        return true;
      })
      .slice(0, filter?.limit ?? Number.POSITIVE_INFINITY);
  }

  async getRecord<T = Record<string, unknown>>(domain: string, id: string): Promise<MetadataRecord<T> | null> {
    const records = await this.loadRecords<T>();
    return records.find((record) => record.domain === domain && record.id === id) ?? null;
  }

  async upsertRecord<T = Record<string, unknown>>(input: MetadataRecordInput<T>): Promise<MetadataRecord<T>> {
    const records = await this.loadRecords<T>();
    let record = records.find((entry) => entry.domain === input.domain && entry.id === input.id);
    const now = new Date().toISOString();
    if (!record) {
      record = {
        id: input.id ?? cryptoRandomId(),
        projectId: input.projectId,
        domain: input.domain,
        labels: input.labels ?? [],
        payload: input.payload,
        createdAt: now,
        updatedAt: now,
      } as MetadataRecord<T>;
      records.push(record);
    } else {
      record.projectId = input.projectId;
      record.labels = input.labels ?? [];
      record.payload = input.payload;
      record.updatedAt = now;
    }
    await this.persistRecords(records);
    return record;
  }

  async deleteRecord(domain: string, id: string): Promise<void> {
    const records = await this.loadRecords();
    const next = records.filter((record) => !(record.domain === domain && record.id === id));
    await this.persistRecords(next);
  }

  async listDomains(): Promise<MetadataDomainSummary[]> {
    const records = await this.loadRecords();
    const domainMap = new Map<string, MetadataDomainSummary>();
    records.forEach((record) => {
      const entry = domainMap.get(record.domain) ?? {
        key: record.domain,
        title: record.domain,
        itemCount: 0,
      };
      entry.itemCount += 1;
      domainMap.set(record.domain, entry);
    });
    return Array.from(domainMap.values());
  }

  async listEndpoints(projectId?: string): Promise<MetadataEndpointDescriptor[]> {
    const endpoints = await this.loadEndpoints();
    if (!projectId) {
      return endpoints;
    }
    return endpoints.filter((endpoint) => endpoint.projectId === projectId);
  }

  async registerEndpoint(endpoint: MetadataEndpointDescriptor): Promise<MetadataEndpointDescriptor> {
    const endpoints = await this.loadEndpoints();
    const existingIndex = endpoints.findIndex((entry) => entry.id === endpoint.id);
    const now = new Date().toISOString();
    if (existingIndex >= 0) {
      const existingSourceId = endpoints[existingIndex].sourceId;
      const updated: MetadataEndpointDescriptor = {
        ...endpoints[existingIndex],
        ...endpoint,
        sourceId: endpoint.sourceId ?? existingSourceId ?? generateSourceId(endpoint),
        createdAt: endpoints[existingIndex].createdAt ?? endpoint.createdAt ?? now,
        updatedAt: now,
      };
      endpoints[existingIndex] = updated;
      await this.persistEndpoints(endpoints);
      return updated;
    }
    const descriptor: MetadataEndpointDescriptor = {
      ...endpoint,
      id: endpoint.id ?? cryptoRandomId(),
      sourceId: endpoint.sourceId ?? generateSourceId(endpoint),
      createdAt: endpoint.createdAt ?? now,
      updatedAt: endpoint.updatedAt ?? now,
    };
    endpoints.push(descriptor);
    await this.persistEndpoints(endpoints);
    return descriptor;
  }

  private async loadRecords<T = Record<string, unknown>>(): Promise<MetadataRecord<T>[]> {
    await ensureDir(this.rootDir);
    try {
      const contents = await readFile(this.recordsFile, "utf-8");
      const parsed = JSON.parse(contents) as MetadataRecord<T>[];
      return Array.isArray(parsed) ? parsed : [];
    } catch (error: unknown) {
      if (isENOENT(error)) {
        await this.persistRecords([]);
        return [];
      }
      if (error instanceof SyntaxError) {
        // eslint-disable-next-line no-console
        console.warn(`Metadata store at ${this.recordsFile} is corrupted. Resetting the manifest.`);
        await this.persistRecords([]);
        return [];
      }
      throw error;
    }
  }

  private async persistRecords(records: MetadataRecord<unknown>[]): Promise<void> {
    await ensureDir(this.rootDir);
    await writeFile(this.recordsFile, JSON.stringify(records, null, 2), "utf-8");
  }

  private async loadEndpoints(): Promise<MetadataEndpointDescriptor[]> {
    await ensureDir(this.rootDir);
    try {
      const contents = await readFile(this.endpointsFile, "utf-8");
      const raw = JSON.parse(contents);
      const parsed = Array.isArray(raw) ? (raw as MetadataEndpointDescriptor[]) : [];
      let mutated = false;
      const normalized = parsed.map((entry) => {
        if (entry.sourceId && entry.sourceId.trim().length > 0) {
          return entry;
        }
        mutated = true;
        return { ...entry, sourceId: generateSourceId(entry) };
      });
      if (mutated) {
        await this.persistEndpoints(normalized);
      }
      return normalized;
    } catch (error: unknown) {
      if (isENOENT(error)) {
        await this.persistEndpoints([]);
        return [];
      }
      throw error;
    }
  }

  private async persistEndpoints(endpoints: MetadataEndpointDescriptor[]): Promise<void> {
    await ensureDir(this.rootDir);
    await writeFile(this.endpointsFile, JSON.stringify(endpoints, null, 2), "utf-8");
  }
}

type PrismaMetadataClient = {
  metadataRecord: {
    findMany(args: unknown): Promise<any[]>;
    findUnique(args: unknown): Promise<any | null>;
    create(args: unknown): Promise<any>;
    upsert(args: unknown): Promise<any>;
    delete(args: unknown): Promise<void>;
    groupBy?(args: unknown): Promise<any[]>;
  };
  metadataDomain?: {
    findMany(args?: unknown): Promise<any[]>;
  };
  metadataEndpoint: {
    findUnique?(args: unknown): Promise<any | null>;
    findMany(args?: unknown): Promise<any[]>;
    upsert(args: unknown): Promise<any>;
  };
};

export class PrismaMetadataStore implements MetadataStore {
  constructor(private readonly prisma: PrismaMetadataClient) {}

  async listRecords<T = Record<string, unknown>>(domain: string, filter?: RecordFilter): Promise<MetadataRecord<T>[]> {
    const where: Record<string, unknown> = {
      domain,
      projectId: filter?.projectId,
      labels: filter?.labels?.length ? { hasEvery: filter.labels } : undefined,
    };
    const records = await this.prisma.metadataRecord.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: filter?.search ? undefined : filter?.limit,
    });
    const filtered = filter?.search
      ? records.filter((record) => {
          const haystack = JSON.stringify(record.payload ?? {}).toLowerCase();
          return haystack.includes(filter.search!.toLowerCase());
        })
      : records;
    const limited = filter?.limit ? filtered.slice(0, filter.limit) : filtered;
    return limited.map((record) => mapPrismaRecord<T>(record));
  }

  async getRecord<T = Record<string, unknown>>(domain: string, id: string): Promise<MetadataRecord<T> | null> {
    const record = await this.prisma.metadataRecord.findUnique({ where: { id } });
    if (!record || record.domain !== domain) {
      return null;
    }
    return mapPrismaRecord<T>(record);
  }

  async upsertRecord<T = Record<string, unknown>>(input: MetadataRecordInput<T>): Promise<MetadataRecord<T>> {
    if (input.id) {
      const upserted = await this.prisma.metadataRecord.upsert({
        where: { id: input.id },
        update: {
          projectId: input.projectId,
          domain: input.domain,
          labels: input.labels ?? [],
          payload: input.payload,
        },
        create: {
          id: input.id,
          projectId: input.projectId,
          domain: input.domain,
          labels: input.labels ?? [],
          payload: input.payload,
        },
      });
      return mapPrismaRecord<T>(upserted);
    }
    const created = await this.prisma.metadataRecord.create({
      data: {
        projectId: input.projectId,
        domain: input.domain,
        labels: input.labels ?? [],
        payload: input.payload,
      },
    });
    return mapPrismaRecord<T>(created);
  }

  async deleteRecord(domain: string, id: string): Promise<void> {
    const record = await this.prisma.metadataRecord.findUnique({ where: { id } });
    if (!record || record.domain !== domain) {
      return;
    }
    await this.prisma.metadataRecord.delete({ where: { id } });
  }

  async listDomains(): Promise<MetadataDomainSummary[]> {
    const explicit = (await this.prisma.metadataDomain?.findMany?.()) ?? [];
    if (explicit.length > 0) {
      return explicit.map((domain: any) => ({
        key: domain.key,
        title: domain.title,
        description: domain.description ?? undefined,
        itemCount: domain.itemCount ?? 0,
      }));
    }
    if (typeof this.prisma.metadataRecord.groupBy === "function") {
      const aggregates = await this.prisma.metadataRecord.groupBy({
        by: ["domain"],
        _count: { domain: true },
      });
      return aggregates.map((entry: any) => ({
        key: entry.domain,
        title: entry.domain,
        itemCount: entry._count?.domain ?? 0,
      }));
    }
    const records = await this.prisma.metadataRecord.findMany({
      select: { domain: true },
    });
    const domainCounts = records.reduce<Record<string, number>>((acc, record) => {
      acc[record.domain] = (acc[record.domain] ?? 0) + 1;
      return acc;
    }, {});
    return Object.entries(domainCounts).map(([key, count]) => ({
      key,
      title: key,
      itemCount: count,
    }));
  }

  async listEndpoints(projectId?: string): Promise<MetadataEndpointDescriptor[]> {
    const endpoints = await this.prisma.metadataEndpoint.findMany({
      where: projectId ? { projectId } : undefined,
    });
    return endpoints.map(mapPrismaEndpoint);
  }

  async registerEndpoint(endpoint: MetadataEndpointDescriptor): Promise<MetadataEndpointDescriptor> {
    const endpointId = endpoint.id ?? cryptoRandomId();
    const normalizedSourceId =
      endpoint.sourceId && endpoint.sourceId.trim().length > 0 ? endpoint.sourceId.trim() : undefined;
    const result = await this.prisma.metadataEndpoint.upsert({
      where: { id: endpointId },
      update: {
        name: endpoint.name,
        description: endpoint.description ?? null,
        verb: endpoint.verb,
        url: endpoint.url,
        authPolicy: endpoint.authPolicy ?? null,
        projectId: endpoint.projectId ?? null,
        domain: endpoint.domain ?? null,
        labels: endpoint.labels ?? (endpoint.domain ? [endpoint.domain] : []),
        config: endpoint.config ?? null,
        detectedVersion: endpoint.detectedVersion ?? null,
        versionHint: endpoint.versionHint ?? null,
        capabilities: endpoint.capabilities ?? [],
        ...(normalizedSourceId ? { sourceId: normalizedSourceId } : {}),
      },
      create: {
        id: endpointId,
        sourceId: normalizedSourceId ?? generateSourceId(endpoint),
        name: endpoint.name,
        description: endpoint.description ?? null,
        verb: endpoint.verb,
        url: endpoint.url,
        authPolicy: endpoint.authPolicy ?? null,
        projectId: endpoint.projectId ?? null,
        domain: endpoint.domain ?? null,
        labels: endpoint.labels ?? (endpoint.domain ? [endpoint.domain] : []),
        config: endpoint.config ?? null,
        detectedVersion: endpoint.detectedVersion ?? null,
        versionHint: endpoint.versionHint ?? null,
        capabilities: endpoint.capabilities ?? [],
      },
    });
    return mapPrismaEndpoint(result);
  }
}

function mapPrismaRecord<T>(record: any): MetadataRecord<T> {
  return {
    id: record.id,
    projectId: record.projectId,
    domain: record.domain,
    labels: record.labels ?? [],
    payload: record.payload as T,
    createdAt: (record.createdAt instanceof Date ? record.createdAt : new Date(record.createdAt)).toISOString(),
    updatedAt: (record.updatedAt instanceof Date ? record.updatedAt : new Date(record.updatedAt)).toISOString(),
  };
}

function mapPrismaEndpoint(endpoint: any): MetadataEndpointDescriptor {
  return {
    id: endpoint.id,
    sourceId: endpoint.sourceId ?? undefined,
    name: endpoint.name,
    description: endpoint.description ?? undefined,
    verb: endpoint.verb as HttpVerb,
    url: endpoint.url,
    authPolicy: endpoint.authPolicy ?? undefined,
    projectId: endpoint.projectId ?? undefined,
    domain: endpoint.domain ?? undefined,
    labels: endpoint.labels ?? undefined,
    config: endpoint.config ?? undefined,
    detectedVersion: endpoint.detectedVersion ?? undefined,
    versionHint: endpoint.versionHint ?? undefined,
    capabilities: endpoint.capabilities ?? [],
    createdAt:
      endpoint.createdAt instanceof Date
        ? endpoint.createdAt.toISOString()
        : new Date(endpoint.createdAt ?? Date.now()).toISOString(),
    updatedAt:
      endpoint.updatedAt instanceof Date
        ? endpoint.updatedAt.toISOString()
        : new Date(endpoint.updatedAt ?? Date.now()).toISOString(),
  };
}

function cryptoRandomId(): string {
  return Math.random().toString(36).slice(2, 10);
}

function generateSourceId(endpoint: MetadataEndpointDescriptor): string {
  const projectSlug = slugify(endpoint.projectId ?? "global");
  const nameSlug = slugify(endpoint.name || "endpoint");
  const base = [projectSlug, nameSlug].filter(Boolean).join("-");
  return `${base}-${cryptoRandomId()}`;
}

function slugify(value: string): string {
  return value
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "source";
}

async function ensureDir(dir: string): Promise<void> {
  try {
    await mkdir(dir, { recursive: true });
  } catch (error) {
    if (!isEEXIST(error)) {
      throw error;
    }
  }
}

function isENOENT(error: unknown): boolean {
  return Boolean((error as NodeJS.ErrnoException)?.code === "ENOENT");
}

function isEEXIST(error: unknown): boolean {
  return Boolean((error as NodeJS.ErrnoException)?.code === "EEXIST");
}

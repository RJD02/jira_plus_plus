import { FileMetadataStore, PrismaMetadataStore, type MetadataStore } from "@metadata/core";
import path from "node:path";

let storePromise: Promise<MetadataStore> | null = null;

export function getMetadataStore(): Promise<MetadataStore> {
  if (!storePromise) {
    storePromise = createStore();
  }
  return storePromise;
}

async function createStore(): Promise<MetadataStore> {
  const databaseUrl = resolveMetadataDatabaseUrl();
  if (databaseUrl) {
    const prismaClient = await createPrismaMetadataClient();
    if (prismaClient) {
      return new PrismaMetadataStore(prismaClient as any);
    }
    // eslint-disable-next-line no-console
    console.warn("Metadata Prisma client could not be loaded. Falling back to file store for local development.");
  } else {
    // eslint-disable-next-line no-console
    console.warn("METADATA_DATABASE_URL not set; using local file-backed metadata store (designer will not work in browser).");
  }
  const manifestDir = process.env.METADATA_STORE_DIR
    ? path.resolve(process.env.METADATA_STORE_DIR)
    : path.resolve(process.cwd(), "metadata", "store");
  return new FileMetadataStore({ rootDir: manifestDir });
}

async function createPrismaMetadataClient(): Promise<object | null> {
  const candidatePaths = [
    path.resolve(process.cwd(), "node_modules", ".metadata-client", "index.js"),
    path.resolve(process.cwd(), "..", "..", "node_modules", ".metadata-client", "index.js"),
  ];
  for (const modulePath of candidatePaths) {
    try {
      const metadataModule = await import(modulePath);
      if (metadataModule && typeof metadataModule.PrismaClient === "function") {
        return new metadataModule.PrismaClient();
      }
    } catch {
      // continue trying next candidate
    }
  }
  // eslint-disable-next-line no-console
  console.warn("Failed to load metadata Prisma client from known locations.");
  return null;
}

function resolveMetadataDatabaseUrl(): string | null {
  if (process.env.METADATA_DATABASE_URL) {
    return process.env.METADATA_DATABASE_URL;
  }
  const primary = process.env.DATABASE_URL;
  if (!primary) {
    return null;
  }
  const [base, query] = primary.split("?", 2);
  if (!query) {
    process.env.METADATA_DATABASE_URL = `${primary}?schema=metadata`;
    return process.env.METADATA_DATABASE_URL;
  }
  const params = new URLSearchParams(query);
  if (params.has("schema")) {
    params.set("schema", "metadata");
  } else {
    params.append("schema", "metadata");
  }
  process.env.METADATA_DATABASE_URL = `${base}?${params.toString()}`;
  return process.env.METADATA_DATABASE_URL;
}

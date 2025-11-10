import type { CatalogProvider } from "@reporting/catalog";
import type { PrismaClient } from "./generated/client/index.js";

export type Context = {
  prisma: PrismaClient;
  tenantId: string;
  userId?: string;
  catalog: CatalogProvider;
};

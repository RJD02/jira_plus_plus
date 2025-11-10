import type { IncomingMessage } from "node:http";
import { prisma } from "./prisma.js";
import { getCatalogProvider } from "./catalog.js";
import type { Context } from "./types.js";

type ContextArgs = {
  req: IncomingMessage;
};

export async function createContext({ req }: ContextArgs): Promise<Context> {
  const tenantHeader = req.headers["x-tenant-id"];
  const tenantId = Array.isArray(tenantHeader)
    ? tenantHeader[0] ?? "dev"
    : tenantHeader ?? "dev";

  const userHeader = req.headers["x-user-id"];
  const userId = Array.isArray(userHeader) ? userHeader[0] : userHeader;

  return {
    prisma,
    tenantId,
    userId: userId ?? undefined,
    catalog: getCatalogProvider(),
  };
}

import { PrismaClient } from "./generated/client/index.js";

declare global {
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined;
}

const prismaInstance =
  global.prisma ??
  new PrismaClient({
    log: ["info", "warn", "error"],
  });

if (process.env.NODE_ENV !== "production") {
  global.prisma = prismaInstance;
}

export const prisma = prismaInstance;

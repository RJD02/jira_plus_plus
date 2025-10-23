import type { PrismaClient, Prisma } from "@platform/cdm";

export async function withTenant<T>(
  prisma: PrismaClient,
  tenantId: string,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`select set_config('app.current_tenant', ${tenantId}, true)`;
      return fn(tx);
    },
    {
      maxWait: 10_000,
      timeout: 30_000,
    },
  );
}

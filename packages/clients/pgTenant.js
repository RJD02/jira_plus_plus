/**
 * Helper that wraps a callback in a tenant-scoped transaction.
 * The TypeScript definition lives alongside this JS implementation,
 * so other packages can keep importing from `@platform/clients`.
 */
export async function withTenant(prisma, tenantId, fn) {
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

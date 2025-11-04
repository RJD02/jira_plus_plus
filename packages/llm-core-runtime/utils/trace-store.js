export class PrismaTraceStore {
  constructor(prisma) {
    this.prisma = prisma;
  }

  async recordTrace(record) {
    await this.prisma.llmSkillTrace.create({
      data: {
        id: record.traceId,
        tenantId: record.tenantId,
        traceId: record.traceId,
        skillId: record.skillId,
        skillVersion: record.skillVersion,
        modelProvider: record.modelProvider,
        modelName: record.modelName,
        templateHash: record.templateHash,
        inputHash: record.inputHash,
        latencyMs: record.latencyMs,
        promptTokens: record.usage?.promptTokens ?? null,
        completionTokens: record.usage?.completionTokens ?? null,
        totalTokens: record.usage?.totalTokens ?? null,
        cached: record.cached,
        input: record.input,
        output: record.output,
        metadata: record.metadata,
        createdAt: record.createdAt,
      },
    });
  }

  async findCachedTrace(cacheKey) {
    const existing = await this.prisma.llmSkillTrace.findFirst({
      where: {
        tenantId: cacheKey.tenantId,
        templateHash: cacheKey.templateHash,
        inputHash: cacheKey.inputHash,
        skillId: cacheKey.skillId,
        cached: true,
      },
      orderBy: { createdAt: "desc" },
    });

    if (!existing) {
      return null;
    }

    return {
      traceId: existing.traceId,
      tenantId: existing.tenantId,
      skillId: existing.skillId,
      skillVersion: existing.skillVersion ?? "unknown",
      modelProvider: existing.modelProvider,
      modelName: existing.modelName,
      templateHash: existing.templateHash,
      inputHash: existing.inputHash,
      latencyMs: existing.latencyMs,
      cached: existing.cached,
      input: existing.input,
      output: existing.output,
      metadata: existing.metadata ?? undefined,
      usage: {
        promptTokens: existing.promptTokens ?? undefined,
        completionTokens: existing.completionTokens ?? undefined,
        totalTokens: existing.totalTokens ?? undefined,
      },
      createdAt: existing.createdAt,
    };
  }
}

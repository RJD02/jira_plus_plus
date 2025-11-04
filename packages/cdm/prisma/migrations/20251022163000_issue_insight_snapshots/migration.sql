-- AlterTable
ALTER TABLE "IssueInsight" ADD COLUMN "latestSnapshotId" TEXT;

-- CreateTable
CREATE TABLE "IssueInsightSnapshot" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'dev',
    "issueId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "inputsHash" TEXT NOT NULL,
    "summary" JSONB,
    "sentiments" JSONB,
    "escalationScore" DOUBLE PRECISION,
    "signals" JSONB,
    "providerMetadata" JSONB,
    "deltaSummary" JSONB,
    "commentCursor" TEXT,
    "worklogCursor" TEXT,
    "statusStage" TEXT,
    "stageBreakdown" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IssueInsightSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "IssueInsightSnapshot_tenantId_issueId_createdAt_idx" ON "IssueInsightSnapshot"("tenantId", "issueId", "createdAt");
CREATE INDEX "IssueInsightSnapshot_tenantId_inputsHash_idx" ON "IssueInsightSnapshot"("tenantId", "inputsHash");

-- AddForeignKey
ALTER TABLE "IssueInsightSnapshot" ADD CONSTRAINT "IssueInsightSnapshot_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "Issue"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "IssueInsightSnapshot" ADD CONSTRAINT "IssueInsightSnapshot_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "IssueInsight" ADD CONSTRAINT "IssueInsight_latestSnapshotId_fkey" FOREIGN KEY ("latestSnapshotId") REFERENCES "IssueInsightSnapshot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "LlmSkillTrace" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'dev',
    "traceId" TEXT NOT NULL,
    "skillId" TEXT NOT NULL,
    "skillVersion" TEXT,
    "modelProvider" TEXT NOT NULL,
    "modelName" TEXT NOT NULL,
    "templateHash" TEXT NOT NULL,
    "inputHash" TEXT NOT NULL,
    "latencyMs" INTEGER NOT NULL,
    "promptTokens" INTEGER,
    "completionTokens" INTEGER,
    "totalTokens" INTEGER,
    "cached" BOOLEAN NOT NULL DEFAULT false,
    "input" JSONB NOT NULL,
    "output" JSONB NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LlmSkillTrace_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LlmSkillTrace_traceId_key" ON "LlmSkillTrace"("traceId");
CREATE INDEX "LlmSkillTrace_tenantId_skillId_createdAt_idx" ON "LlmSkillTrace"("tenantId", "skillId", "createdAt");
CREATE INDEX "LlmSkillTrace_tenantId_templateHash_inputHash_idx" ON "LlmSkillTrace"("tenantId", "templateHash", "inputHash");

-- AddForeignKey
ALTER TABLE "LlmSkillTrace" ADD CONSTRAINT "LlmSkillTrace_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

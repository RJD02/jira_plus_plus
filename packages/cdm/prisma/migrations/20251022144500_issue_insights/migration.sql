-- CreateTable
CREATE TABLE "IssueInsight" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'dev',
    "issueId" TEXT NOT NULL,
    "summary" JSONB,
    "sentiments" JSONB,
    "escalationScore" DOUBLE PRECISION,
    "signals" JSONB,
    "providerMetadata" JSONB,
    "lastIssueHash" TEXT NOT NULL,
    "metadata" JSONB,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    CONSTRAINT "IssueInsight_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "IssueInsight_issueId_key" ON "IssueInsight"("issueId");
CREATE INDEX "IssueInsight_tenantId_computedAt_idx" ON "IssueInsight"("tenantId", "computedAt");

-- AddForeignKey
ALTER TABLE "IssueInsight" ADD CONSTRAINT "IssueInsight_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "Issue"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "IssueInsight" ADD CONSTRAINT "IssueInsight_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

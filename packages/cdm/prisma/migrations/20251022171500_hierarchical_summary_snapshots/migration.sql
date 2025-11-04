-- Create hierarchical summary snapshot tables

-- CreateTable TaskSummarySnapshot
CREATE TABLE "TaskSummarySnapshot" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'dev',
    "projectId" TEXT NOT NULL,
    "issueId" TEXT NOT NULL,
    "userId" TEXT,
    "summaryDate" TIMESTAMP(3) NOT NULL,
    "runId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskSummarySnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex TaskSummarySnapshot indexes
CREATE INDEX "TaskSummarySnapshot_tenantId_projectId_summaryDate_idx"
    ON "TaskSummarySnapshot"("tenantId", "projectId", "summaryDate");
CREATE INDEX "TaskSummarySnapshot_tenantId_issueId_summaryDate_idx"
    ON "TaskSummarySnapshot"("tenantId", "issueId", "summaryDate");
CREATE INDEX "TaskSummarySnapshot_tenantId_runId_idx"
    ON "TaskSummarySnapshot"("tenantId", "runId");

-- CreateTable UserSummarySnapshot
CREATE TABLE "UserSummarySnapshot" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'dev',
    "projectId" TEXT NOT NULL,
    "userId" TEXT,
    "summaryDate" TIMESTAMP(3) NOT NULL,
    "runId" TEXT NOT NULL,
    "taskSummaryIds" TEXT[] NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserSummarySnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex UserSummarySnapshot indexes
CREATE INDEX "UserSummarySnapshot_tenantId_projectId_summaryDate_idx"
    ON "UserSummarySnapshot"("tenantId", "projectId", "summaryDate");
CREATE INDEX "UserSummarySnapshot_tenantId_projectId_runId_idx"
    ON "UserSummarySnapshot"("tenantId", "projectId", "runId");

-- CreateTable ProjectSummarySnapshot
CREATE TABLE "ProjectSummarySnapshot" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'dev',
    "projectId" TEXT NOT NULL,
    "summaryDate" TIMESTAMP(3) NOT NULL,
    "runId" TEXT NOT NULL,
    "userSummaryIds" TEXT[] NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectSummarySnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex ProjectSummarySnapshot indexes
CREATE UNIQUE INDEX "ProjectSummarySnapshot_tenantId_projectId_runId_key"
    ON "ProjectSummarySnapshot"("tenantId", "projectId", "runId");
CREATE INDEX "ProjectSummarySnapshot_tenantId_projectId_summaryDate_idx"
    ON "ProjectSummarySnapshot"("tenantId", "projectId", "summaryDate");

-- AddForeignKey TaskSummarySnapshot.projectId -> JiraProject
ALTER TABLE "TaskSummarySnapshot"
    ADD CONSTRAINT "TaskSummarySnapshot_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "JiraProject"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey TaskSummarySnapshot.issueId -> Issue
ALTER TABLE "TaskSummarySnapshot"
    ADD CONSTRAINT "TaskSummarySnapshot_issueId_fkey"
    FOREIGN KEY ("issueId") REFERENCES "Issue"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey TaskSummarySnapshot.userId -> User
ALTER TABLE "TaskSummarySnapshot"
    ADD CONSTRAINT "TaskSummarySnapshot_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey TaskSummarySnapshot.tenantId -> Tenant
ALTER TABLE "TaskSummarySnapshot"
    ADD CONSTRAINT "TaskSummarySnapshot_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey UserSummarySnapshot.projectId -> JiraProject
ALTER TABLE "UserSummarySnapshot"
    ADD CONSTRAINT "UserSummarySnapshot_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "JiraProject"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey UserSummarySnapshot.userId -> User
ALTER TABLE "UserSummarySnapshot"
    ADD CONSTRAINT "UserSummarySnapshot_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey UserSummarySnapshot.tenantId -> Tenant
ALTER TABLE "UserSummarySnapshot"
    ADD CONSTRAINT "UserSummarySnapshot_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey ProjectSummarySnapshot.projectId -> JiraProject
ALTER TABLE "ProjectSummarySnapshot"
    ADD CONSTRAINT "ProjectSummarySnapshot_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "JiraProject"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey ProjectSummarySnapshot.tenantId -> Tenant
ALTER TABLE "ProjectSummarySnapshot"
    ADD CONSTRAINT "ProjectSummarySnapshot_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

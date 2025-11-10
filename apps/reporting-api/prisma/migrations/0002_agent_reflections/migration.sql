-- Agent reflections capture conversational context for the reporting designer agent
CREATE TABLE IF NOT EXISTS reporting."AgentReflection" (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "tenantId" TEXT NOT NULL DEFAULT 'dev',
    "userId" TEXT,
    persona TEXT,
    status TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS agent_reflection_tenant_status_idx
  ON reporting."AgentReflection" ("tenantId", status);

-- Individual agent messages (user + assistant turns) linked to reflections
CREATE TABLE IF NOT EXISTS reporting."AgentMessage" (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "reflectionId" UUID NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    suggestions JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS agent_message_reflection_created_idx
  ON reporting."AgentMessage" ("reflectionId", "createdAt");

ALTER TABLE reporting."AgentMessage"
  ADD CONSTRAINT agent_message_reflection_fk
  FOREIGN KEY ("reflectionId")
  REFERENCES reporting."AgentReflection"(id)
  ON DELETE CASCADE;

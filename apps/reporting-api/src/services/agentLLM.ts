import { randomUUID } from "node:crypto";
import type { CatalogDataset } from "@reporting/catalog";
import type { AgentMessageRecord, AgentSuggestion } from "@reporting/temporal";
import OpenAI from "openai";
import { buildHeuristicSuggestions } from "./agentDesigner.js";

const OPENAI_MODEL =
  process.env.REPORTING_AGENT_OPENAI_MODEL ??
  process.env.OPENAI_MODEL ??
  "gpt-4o-mini";

let openaiClient: OpenAI | null = null;

function getOpenAIClient(): OpenAI | null {
  if (openaiClient) {
    return openaiClient;
  }
  const apiKey = process.env.REPORTING_AGENT_OPENAI_API_KEY ?? process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return null;
  }
  openaiClient = new OpenAI({ apiKey });
  return openaiClient;
}

export interface GenerateAgentSuggestionsArgs {
  tenantId: string;
  prompt: string;
  persona?: string | null;
  datasets: CatalogDataset[];
  conversation: AgentMessageRecord[];
}

export async function generateAgentSuggestionsWithLLM({
  tenantId,
  prompt,
  persona,
  datasets,
  conversation,
}: GenerateAgentSuggestionsArgs): Promise<AgentSuggestion[] | null> {
  const client = getOpenAIClient();
  if (!client) {
    return null;
  }

  const systemPrompt = buildSystemPrompt(tenantId, persona, datasets);
  const historyMessages = mapConversationToChat(conversation, persona);
  const userPrompt = buildUserPrompt(prompt, persona, datasets);

  try {
    const completion = await client.chat.completions.create({
      model: OPENAI_MODEL,
      temperature: 0.4,
      messages: [
        { role: "system", content: systemPrompt },
        ...historyMessages,
        { role: "user", content: userPrompt },
      ],
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) {
      return null;
    }

    const suggestions = parseSuggestionsFromContent(content, { prompt, persona, datasets });
    return suggestions.length ? suggestions : null;
  } catch (error) {
    console.warn("[reporting-agent] OpenAI suggestion generation failed", { error });
    return null;
  }
}

function buildSystemPrompt(tenantId: string, persona: string | null | undefined, datasets: CatalogDataset[]): string {
  const personaLabel = persona ? persona.toUpperCase() : "MIXED";
  const datasetSummary =
    datasets.length === 0
      ? "No catalog metadata was provided."
      : datasets
          .map((dataset) => {
            const fieldList = dataset.fields
              .slice(0, 8)
              .map((field) => `${field.name} (${field.type})`)
              .join(", ");
            return `- ${dataset.displayName} [${dataset.id}] — ${dataset.description ?? "No description"}. Fields: ${fieldList}`;
          })
          .join("\n");

  return [
    "You are the Reporting Designer agent for Jira++.",
    "Produce actionable report or dashboard ideas based on the user's ask, the available catalog datasets, and prior conversation messages.",
    `Tenant context: ${tenantId}. Primary persona: ${personaLabel}.`,
    "Always respond with JSON following this schema:",
    '{ "suggestions": [ { "title": string, "summary": string, "query": string, "filters": object?, "datasetId": string?, "persona": string? } ] }',
    "The SQL in `query` must be parameterised placeholders and reference only listed dataset fields.",
    "If you cannot help, return an empty array.",
    "Available datasets:\n" + datasetSummary,
  ].join("\n");
}

function mapConversationToChat(
  conversation: AgentMessageRecord[],
  persona: string | null | undefined,
) {
  return conversation.slice(-10).map((message) => {
    const base = {
      role: message.role === "assistant" ? "assistant" : "user",
      content: message.content,
    } as const;
    if (message.role === "assistant" && message.suggestions?.length) {
      const summary = message.suggestions
        .map(
          (suggestion) =>
            `Title: ${suggestion.title}\nSummary: ${suggestion.summary}\nDataset: ${
              suggestion.datasetId ?? "unspecified"
            }`,
        )
        .join("\n---\n");
      return {
        role: "assistant" as const,
        content: `${message.content}\nPrevious suggestions:\n${summary}`,
      };
    }
    if (message.role === "user" && persona) {
      return {
        role: "user" as const,
        content: `[Persona ${persona}] ${message.content}`,
      };
    }
    return base;
  });
}

function buildUserPrompt(prompt: string, persona: string | null | undefined, datasets: CatalogDataset[]) {
  const personaLine = persona ? `The admin is designing for persona ${persona}.` : "";
  const datasetHint =
    datasets.length > 0
      ? "When referencing datasets use their IDs so engineers can map them precisely."
      : "No dataset metadata is available—explain what metadata would be required.";
  return [
    personaLine,
    "Produce 1-3 concrete report ideas with SQL templates and filter hints.",
    datasetHint,
    `User request: ${prompt}`,
  ]
    .filter(Boolean)
    .join("\n");
}

function parseSuggestionsFromContent(
  content: string,
  fallbackContext: { prompt: string; persona?: string | null; datasets: CatalogDataset[] },
): AgentSuggestion[] {
  const jsonBlock = extractJson(content);
  if (!jsonBlock) {
    return buildHeuristicSuggestions({
      prompt: fallbackContext.prompt,
      persona: fallbackContext.persona,
      datasets: fallbackContext.datasets,
    });
  }

  try {
    const parsed = JSON.parse(jsonBlock) as { suggestions?: Partial<AgentSuggestion>[] };
    const raw = parsed.suggestions ?? [];
    const normalised = raw
      .map((entry) => normaliseSuggestion(entry, fallbackContext.persona))
      .filter((entry): entry is AgentSuggestion => Boolean(entry));

    if (!normalised.length) {
      return buildHeuristicSuggestions({
        prompt: fallbackContext.prompt,
        persona: fallbackContext.persona,
        datasets: fallbackContext.datasets,
      });
    }
    return normalised;
  } catch (error) {
    console.warn("[reporting-agent] Failed to parse LLM response JSON", { error, content });
    return buildHeuristicSuggestions({
      prompt: fallbackContext.prompt,
      persona: fallbackContext.persona,
      datasets: fallbackContext.datasets,
    });
  }
}

function extractJson(content: string): string | null {
  const match = content.match(/\{[\s\S]*\}$/);
  return match ? match[0] : null;
}

function normaliseSuggestion(
  entry: Partial<AgentSuggestion>,
  persona: string | null | undefined,
): AgentSuggestion | null {
  if (!entry.title || !entry.summary || !entry.query) {
    return null;
  }
  return {
    id: entry.id ?? randomUUID(),
    title: entry.title,
    summary: entry.summary,
    query: entry.query,
    filters: entry.filters ?? {},
    datasetId: entry.datasetId ?? null,
    persona: entry.persona ?? persona ?? null,
  };
}

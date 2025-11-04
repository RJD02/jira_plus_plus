import { fetch } from "undici";

export class OpenAIAdapter {
  constructor(config = {}) {
    this.provider = "openai";
    this.apiKey = config.apiKey ?? process.env.OPENAI_API_KEY;
    this.baseUrl = config.baseUrl ?? process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1";
  }

  async invoke(options) {
    if (!this.apiKey) {
      throw new Error("OPENAI_API_KEY is not configured");
    }
    const base = this.baseUrl.endsWith("/") ? this.baseUrl : `${this.baseUrl}/`;
    const url = new URL("chat/completions", base);
    const body = {
      model: options.skill.model.name,
      messages: [
        { role: "system", content: options.skill.goal },
        { role: "user", content: options.prompt },
      ],
      temperature: options.skill.model.temperature ?? undefined,
      top_p: options.skill.model.topP ?? undefined,
    };

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    const bodyText = await response.text();
    if (!response.ok) {
      throw new Error(`OpenAI request failed (${response.status}): ${bodyText}`);
    }

    let payload;
    try {
      payload = JSON.parse(bodyText);
    } catch (error) {
      throw new Error(`OpenAI response was not valid JSON: ${bodyText}`);
    }

    const content = payload?.choices?.[0]?.message?.content;
    if (typeof content !== "string" || !content.trim()) {
      throw new Error("OpenAI response missing message content");
    }

    return {
      outputText: content,
      rawResponse: payload,
      usage: {
        promptTokens: payload?.usage?.prompt_tokens,
        completionTokens: payload?.usage?.completion_tokens,
        totalTokens: payload?.usage?.total_tokens,
      },
    };
  }
}

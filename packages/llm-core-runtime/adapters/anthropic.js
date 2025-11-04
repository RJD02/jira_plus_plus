import { fetch } from "undici";

export class AnthropicAdapter {
  constructor(config = {}) {
    this.provider = "anthropic";
    this.apiKey = config.apiKey ?? process.env.ANTHROPIC_API_KEY;
    this.baseUrl = config.baseUrl ?? process.env.ANTHROPIC_API_URL ?? "https://api.anthropic.com";
    this.version = config.version ?? process.env.ANTHROPIC_API_VERSION ?? "2023-06-01";
  }

  async invoke(options) {
    if (!this.apiKey) {
      throw new Error("ANTHROPIC_API_KEY is not configured");
    }
    const url = new URL("/v1/messages", this.baseUrl);
    const body = {
      model: options.skill.model.name,
      system: options.skill.goal,
      max_tokens: 1024,
      temperature: options.skill.model.temperature ?? undefined,
      top_p: options.skill.model.topP ?? undefined,
      messages: [
        {
          role: "user",
          content: options.prompt,
        },
      ],
    };

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.apiKey,
        "anthropic-version": this.version,
      },
      body: JSON.stringify(body),
    });

    const bodyText = await response.text();
    if (!response.ok) {
      throw new Error(`Anthropic request failed (${response.status}): ${bodyText}`);
    }

    let payload;
    try {
      payload = JSON.parse(bodyText);
    } catch (error) {
      throw new Error(`Anthropic response was not valid JSON: ${bodyText}`);
    }

    const content = Array.isArray(payload?.content)
      ? payload.content
          .filter((item) => item?.type === "text")
          .map((item) => item.text)
          .join("\n")
          .trim()
      : undefined;
    if (!content) {
      throw new Error("Anthropic response missing message content");
    }

    return {
      outputText: content,
      rawResponse: payload,
      usage: {
        promptTokens: payload?.usage?.input_tokens,
        completionTokens: payload?.usage?.output_tokens,
        totalTokens: payload?.usage?.total_tokens,
      },
    };
  }
}

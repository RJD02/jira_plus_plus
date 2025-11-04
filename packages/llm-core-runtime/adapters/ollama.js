import { fetch } from "undici";

export class OllamaAdapter {
  constructor(config = {}) {
    this.provider = "ollama";
    this.baseUrl = config.baseUrl ?? process.env.OLLAMA_BASE_URL ?? "http://127.0.0.1:11434";
  }

  async invoke(options) {
    const url = new URL("/api/generate", this.baseUrl);
    const body = {
      model: options.skill.model.name,
      prompt: `${options.skill.goal}\n\n${options.prompt}`,
      stream: false,
      options: {
        temperature: options.skill.model.temperature ?? undefined,
        top_p: options.skill.model.topP ?? undefined,
      },
    };

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    const bodyText = await response.text();
    if (!response.ok) {
      throw new Error(`Ollama request failed (${response.status}): ${bodyText}`);
    }

    let payload;
    try {
      payload = JSON.parse(bodyText);
    } catch (error) {
      throw new Error(`Ollama response was not valid JSON: ${bodyText}`);
    }

    const content = typeof payload?.response === "string" ? payload.response.trim() : "";
    if (!content) {
      throw new Error("Ollama response missing text content");
    }

    return {
      outputText: content,
      rawResponse: payload,
      usage: {
        promptTokens: payload?.prompt_eval_count ?? undefined,
        completionTokens: payload?.eval_count ?? undefined,
        totalTokens:
          payload?.prompt_eval_count && payload?.eval_count
            ? payload.prompt_eval_count + payload.eval_count
            : undefined,
      },
    };
  }
}

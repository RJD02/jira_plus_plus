import { Resend } from "resend";
import { getEnv } from "../../../env.js";
import type { CommunicationChannel, CommunicationPayload } from "../types.js";

export class ResendChannel implements CommunicationChannel {
  name = "email" as const;

  private client: Resend | null = null;

  private ensureClient(): Resend {
    if (this.client) return this.client;
    const env = getEnv();
    if (!env.RESEND_API_KEY) {
      throw new Error("RESEND_API_KEY is not configured");
    }
    this.client = new Resend(env.RESEND_API_KEY);
    return this.client;
  }

  async send(payload: CommunicationPayload): Promise<void> {
    if (!payload.to.length) {
      console.warn("[ResendChannel] No recipients specified, skipping send.");
      return;
    }

    const env = getEnv();
    const client = this.ensureClient();
    const from = payload.from ?? env.RESEND_FROM_EMAIL ?? env.ADMIN_EMAIL;

    const { error } = await client.emails.send({
      from,
      to: payload.to,
      subject: payload.subject,
      ...(payload.html ? { html: payload.html } : { text: payload.text ?? "" }),
    });

    if (error) {
      throw new Error(`Resend error: ${error.message}`);
    }
  }
}

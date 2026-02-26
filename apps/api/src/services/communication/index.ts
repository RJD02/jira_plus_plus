import { getEnv } from "../../env.js";
import type {
  CommunicationChannelName,
  CommunicationOptions,
  CommunicationPayload,
} from "./types.js";
import { EmailChannel } from "./channels/emailChannel.js";
import { ResendChannel } from "./channels/resendChannel.js";
import { WhatsAppChannel } from "./channels/whatsappChannel.js";

type ChannelRegistry = Record<CommunicationChannelName, (payload: CommunicationPayload) => Promise<void>>;

let registry: ChannelRegistry | null = null;

function resolveRecipients(raw: string | undefined, fallback: string[] = []): string[] {
  if (!raw) {
    return fallback;
  }
  return raw
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function bootstrapRegistry(): ChannelRegistry {
  const env = getEnv();
  const emailChannel = env.EMAIL_PROVIDER === "resend" ? new ResendChannel() : new EmailChannel();
  const whatsappChannel = new WhatsAppChannel();

  return {
    email: (payload) => emailChannel.send(payload),
    whatsapp: (payload) => whatsappChannel.send(payload),
  };
}

function getRegistry(): ChannelRegistry {
  if (!registry) {
    registry = bootstrapRegistry();
  }
  return registry;
}

export async function sendCommunication(options: Partial<CommunicationOptions> & { payload: CommunicationPayload }) {
  const { payload } = options;
  const channel = options.channel ?? "email";
  const registryInstance = getRegistry();

  const handler = registryInstance[channel];
  if (!handler) {
    throw new Error(`Unsupported communication channel "${channel}"`);
  }

  const env = getEnv();
  const recipients = payload.to.length ? payload.to : resolveRecipients(env.OPS_ALERT_EMAILS);
  if (!recipients.length) {
    console.warn("[Communication] No recipients resolved; skipping message", {
      channel,
      subject: payload.subject,
    });
    return;
  }

  await handler({
    ...payload,
    to: recipients,
  });
}

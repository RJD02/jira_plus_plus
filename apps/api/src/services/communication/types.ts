export type CommunicationChannelName = "email" | "whatsapp";

export interface CommunicationPayload {
  to: string[];
  cc?: string[];
  subject: string;
  text?: string;
  html?: string;
  from?: string;
  metadata?: Record<string, unknown>;
}

export interface CommunicationChannel {
  readonly name: CommunicationChannelName;
  send(payload: CommunicationPayload): Promise<void>;
}

export interface CommunicationOptions {
  channel: CommunicationChannelName;
  payload: CommunicationPayload;
}

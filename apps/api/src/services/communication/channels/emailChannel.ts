import nodemailer from "nodemailer";
import type SMTPTransport from "nodemailer/lib/smtp-transport/index.js";
import { getEnv } from "../../../env.js";
import type { CommunicationChannel, CommunicationPayload } from "../types.js";

export class EmailChannel implements CommunicationChannel {
  name = "email" as const;

  private transporter: nodemailer.Transporter<SMTPTransport.SentMessageInfo> | null = null;

  private ensureTransporter() {
    if (this.transporter) {
      return this.transporter;
    }

    const env = getEnv();
    if (!env.SMTP_HOST || !env.SMTP_PORT || !env.SMTP_USERNAME || !env.SMTP_PASSWORD) {
      throw new Error("SMTP configuration missing; unable to send email");
    }

    this.transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE === "true",
      auth: {
        user: env.SMTP_USERNAME,
        pass: env.SMTP_PASSWORD,
      },
    });
    return this.transporter;
  }

  async send(payload: CommunicationPayload): Promise<void> {
    if (!payload.to.length) {
      console.warn("[EmailChannel] No recipients specified, skipping send.");
      return;
    }

    const env = getEnv();
    const transporter = this.ensureTransporter();

    await transporter.sendMail({
      to: payload.to,
      ...(payload.cc?.length ? { cc: payload.cc } : {}),
      subject: payload.subject,
      text: payload.text,
      html: payload.html,
      from: payload.from ?? env.SMTP_FROM_EMAIL ?? env.ADMIN_EMAIL,
    });
  }
}

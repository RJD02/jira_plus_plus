import { getEnv } from "../../env.js";
import { sendCommunication } from "./index.js";

interface PasswordEmailPayload {
  email: string;
  displayName: string;
  temporaryPassword: string;
}

function renderEmailTemplate(options: {
  greeting: string;
  introLines: string[];
  callout: { label: string; value: string };
  outroLines: string[];
  footer: string;
  appUrl?: string | undefined;
}): string {
  const bodySections = [
    `<p style="margin:0 0 16px 0;font-size:15px;line-height:22px;color:#1f2937;">${options.greeting}</p>`,
    ...options.introLines.map(
      (line) =>
        `<p style="margin:0 0 16px 0;font-size:15px;line-height:22px;color:#4b5563;">${line}</p>`,
    ),
    `<div style="margin:24px 0;padding:16px;border-radius:12px;background-color:#f3f4f6;border:1px solid #e5e7eb;">
        <p style="margin:0 0 8px 0;font-size:13px;letter-spacing:0.08em;font-weight:600;text-transform:uppercase;color:#6366f1;">
          ${options.callout.label}
        </p>
        <p style="margin:0;font-size:18px;font-weight:600;color:#111827;word-break:break-all;">${options.callout.value}</p>
      </div>`,
    ...options.outroLines.map(
      (line) =>
        `<p style="margin:0 0 16px 0;font-size:15px;line-height:22px;color:#4b5563;">${line}</p>`,
    ),
    `<p style="margin:32px 0 0 0;font-size:13px;line-height:20px;color:#9ca3af;">${options.footer}</p>`,
  ];

  return `
  <!DOCTYPE html>
  <html lang="en">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>Jira++ Notification</title>
    </head>
    <body style="margin:0;padding:32px;background-color:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,'Noto Sans',sans-serif;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;margin:0 auto;background-color:#ffffff;border-radius:18px;border:1px solid #e5e7eb;box-shadow:0 10px 30px rgba(15,23,42,0.08);">
        <tr>
          <td style="padding:32px;">
            <div style="margin-bottom:24px;">
              ${
                options.appUrl
                  ? `<a href="${options.appUrl}" target="_blank" style="display:inline-block;padding:8px 14px;border-radius:9999px;background-color:#eef2ff;color:#4338ca;font-size:12px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;text-decoration:none;">Jira++</a>`
                  : `<span style="display:inline-block;padding:8px 14px;border-radius:9999px;background-color:#eef2ff;color:#4338ca;font-size:12px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;">Jira++</span>`
              }
            </div>
            ${bodySections.join("\n")}
          </td>
        </tr>
      </table>
    </body>
  </html>
  `;
}

function buildPasswordEmail(
  payload: PasswordEmailPayload,
  intent: "invite" | "reset",
): { subject: string; text: string; html: string } {
  const env = getEnv();
  const supportEmail = env.SMTP_FROM_EMAIL ?? env.ADMIN_EMAIL;

  if (intent === "invite") {
    const textLines = [
      `Hi ${payload.displayName},`,
      "",
      "Welcome to Jira++. We've created an account for you.",
      "",
      `Temporary password: ${payload.temporaryPassword}`,
      "",
      "Sign in and update your password as soon as possible to keep your account secure.",
      "",
      `If you have any questions, reach out to ${supportEmail}.`,
    ];

    const html = renderEmailTemplate({
      greeting: `Hi ${payload.displayName},`,
      introLines: [
        "Welcome to Jira++. We’ve created an account for you so you can access project insights and collaboration tools.",
        "To get started, sign in with the temporary password below.",
      ],
      callout: { label: "Temporary password", value: payload.temporaryPassword },
      outroLines: [
        "After logging in, head to your profile settings and set a new password that only you know.",
        `Need help? Reply to this email or contact ${supportEmail}.`,
      ],
      footer: "You’re receiving this email because an administrator provisioned an account for you on Jira++.",
      appUrl: env.APP_URL,
    });

    return {
      subject: "You're invited to Jira++",
      text: textLines.join("\n"),
      html,
    };
  }

  const textLines = [
    `Hi ${payload.displayName},`,
    "",
    "An administrator has reset your Jira++ password.",
    "",
    `Temporary password: ${payload.temporaryPassword}`,
    "",
    "Use this password to sign in and update it immediately to protect your account.",
    "",
    `If you did not request this change, contact ${supportEmail} immediately.`,
  ];

  const html = renderEmailTemplate({
    greeting: `Hi ${payload.displayName},`,
    introLines: [
      "An administrator has just reset your Jira++ password.",
      "Use the temporary password below to regain access.",
    ],
    callout: { label: "Temporary password", value: payload.temporaryPassword },
    outroLines: [
      "After signing in, head to your profile settings and choose a new password right away.",
      `Didn’t expect this email? Contact ${supportEmail} immediately so we can help secure your account.`,
    ],
    footer: "This notification was sent to keep your Jira++ account secure.",
    appUrl: env.APP_URL,
  });

  return {
    subject: "Your Jira++ password has been reset",
    text: textLines.join("\n"),
    html,
  };
}

export async function sendUserInviteEmail(payload: PasswordEmailPayload): Promise<void> {
  const message = buildPasswordEmail(payload, "invite");

  await sendCommunication({
    channel: "email",
    payload: {
      to: [payload.email],
      subject: message.subject,
      text: message.text,
      html: message.html,
    },
  });
}

export async function sendPasswordResetEmail(payload: PasswordEmailPayload): Promise<void> {
  const message = buildPasswordEmail(payload, "reset");
  await sendCommunication({
    channel: "email",
    payload: {
      to: [payload.email],
      subject: message.subject,
      text: message.text,
      html: message.html,
    },
  });
}

import { env } from "../env";
import { logError } from "../logger";

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

interface EmailProvider {
  send(message: EmailMessage): Promise<boolean>;
}

class ResendProvider implements EmailProvider {
  constructor(
    private apiKey: string,
    private from: string,
  ) {}

  async send(message: EmailMessage): Promise<boolean> {
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: this.from,
          to: message.to,
          subject: message.subject,
          html: message.html,
          text: message.text,
        }),
      });

      if (!res.ok) {
        const body = await res.text();
        logError("email", `Resend API error: ${res.status} ${body}`);
        return false;
      }
      return true;
    } catch (err) {
      logError(
        "email",
        `Failed to send email: ${err instanceof Error ? err.message : "Unknown error"}`,
      );
      return false;
    }
  }
}

let provider: EmailProvider | null = null;

function getProvider(): EmailProvider | null {
  if (provider) return provider;
  if (!env.RESEND_API_KEY) return null;
  const from = env.NOTIFICATION_FROM_EMAIL || "notifications@agentcenter.cloud";
  provider = new ResendProvider(env.RESEND_API_KEY, from);
  return provider;
}

/**
 * Send an email notification. No-ops if RESEND_API_KEY is not configured.
 */
export async function sendEmail(message: EmailMessage): Promise<boolean> {
  const p = getProvider();
  if (!p) return false;
  return p.send(message);
}

export const dynamic = "force-dynamic";

import { resolveSession } from "../../_lib/resolve-session";
import { successResponse, errorResponse, handleError } from "../../_lib/json-response";
import { sendEmail } from "@/server/services/email";
import { env } from "@/server/env";

const PRIORITY_LABEL: Record<string, string> = {
  nice_to_have: "Nice to have",
  important: "Important",
  critical: "Critical",
};

const PRIORITY_COLOR: Record<string, string> = {
  nice_to_have: "#6b7280",
  important: "#3b82f6",
  critical: "#ef4444",
};

export async function POST(request: Request) {
  try {
    await resolveSession(request);

    const body = await request.json();
    const {
      title,
      useCase,
      priority = "important",
      url,
      timezone,
      userName,
      userEmail,
    } = body as Record<string, string | undefined>;

    if (!title || !useCase) {
      return errorResponse("title and useCase are required", 400);
    }

    const to = env.SUPPORT_EMAIL;
    if (!to) {
      return successResponse({ ok: true });
    }

    const priorityLabel = PRIORITY_LABEL[priority] ?? priority;
    const priorityColor = PRIORITY_COLOR[priority] ?? "#6b7280";

    const html = `
<!DOCTYPE html>
<html>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f9fafb;margin:0;padding:24px;">
  <div style="max-width:600px;margin:0 auto;background:#fff;border-radius:8px;border:1px solid #e5e7eb;overflow:hidden;">
    <div style="background:#111827;padding:20px 24px;">
      <h1 style="margin:0;font-size:18px;color:#fff;">Feature Request</h1>
      <p style="margin:4px 0 0;font-size:13px;color:#9ca3af;">AgentCenter — submitted via in-app support</p>
    </div>
    <div style="padding:24px;">

      <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
        <tr>
          <td style="padding:8px 0;font-size:13px;color:#6b7280;width:120px;">Feature</td>
          <td style="padding:8px 0;font-size:14px;color:#111827;font-weight:600;">${escapeHtml(title)}</td>
        </tr>
        <tr>
          <td style="padding:8px 0;font-size:13px;color:#6b7280;">Priority</td>
          <td style="padding:8px 0;">
            <span style="display:inline-block;padding:2px 8px;border-radius:9999px;background:${priorityColor}20;color:${priorityColor};font-size:12px;font-weight:600;">${priorityLabel}</span>
          </td>
        </tr>
        <tr>
          <td style="padding:8px 0;font-size:13px;color:#6b7280;">Requester</td>
          <td style="padding:8px 0;font-size:14px;color:#111827;">${escapeHtml(userName ?? "")} ${userEmail ? `&lt;${escapeHtml(userEmail)}&gt;` : ""}</td>
        </tr>
        ${
          url
            ? `<tr>
          <td style="padding:8px 0;font-size:13px;color:#6b7280;">Page</td>
          <td style="padding:8px 0;font-size:13px;color:#374151;word-break:break-all;">${escapeHtml(url)}</td>
        </tr>`
            : ""
        }
        ${
          timezone
            ? `<tr>
          <td style="padding:8px 0;font-size:13px;color:#6b7280;">Timezone</td>
          <td style="padding:8px 0;font-size:13px;color:#374151;">${escapeHtml(timezone)}</td>
        </tr>`
            : ""
        }
      </table>

      <h3 style="margin:0 0 8px;font-size:14px;color:#374151;">Problem / Use Case</h3>
      <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:6px;padding:12px 16px;font-size:14px;color:#374151;white-space:pre-wrap;">${escapeHtml(useCase)}</div>

    </div>
  </div>
</body>
</html>`;

    await sendEmail({
      to,
      subject: `[Feature Request] ${priorityLabel}: ${title}`,
      html,
      text: `Feature Request: ${title}\nPriority: ${priorityLabel}\nRequester: ${userName} <${userEmail}>\nPage: ${url}\n\n${useCase}`,
    });

    // Optional Slack notification
    const slackUrl = env.SLACK_SUPPORT_WEBHOOK_URL;
    if (slackUrl) {
      await fetch(slackUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: `*[Feature Request]* ${priorityLabel}: *${title}*\n_${userName}_ | ${url}\n>${useCase?.slice(0, 200)}`,
        }),
      }).catch(() => {});
    }

    return successResponse({ ok: true });
  } catch (err) {
    return handleError(err);
  }
}

function escapeHtml(str: string) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

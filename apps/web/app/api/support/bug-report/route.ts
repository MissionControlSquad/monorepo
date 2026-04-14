export const dynamic = "force-dynamic";

import { resolveSession } from "../../_lib/resolve-session";
import { successResponse, errorResponse, handleError } from "../../_lib/json-response";
import { sendEmail } from "@/server/services/email";
import { env } from "@/server/env";

const SEVERITY_LABEL: Record<string, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  critical: "Critical",
};

const SEVERITY_COLOR: Record<string, string> = {
  low: "#6b7280",
  medium: "#f59e0b",
  high: "#f97316",
  critical: "#ef4444",
};

export async function POST(request: Request) {
  try {
    await resolveSession(request);

    const body = await request.json();
    const {
      title,
      severity = "medium",
      description,
      url,
      browser,
      os,
      screenRes,
      viewport,
      timezone,
      geo,
      userName,
      userEmail,
      screenshotBase64,
    } = body as Record<string, string | undefined>;

    if (!title || !description) {
      return errorResponse("title and description are required", 400);
    }

    const to = env.SUPPORT_EMAIL;
    if (!to) {
      // No email configured — still return 200 so the UI doesn't show an error
      return successResponse({ ok: true });
    }

    const severityLabel = SEVERITY_LABEL[severity] ?? severity;
    const severityColor = SEVERITY_COLOR[severity] ?? "#6b7280";

    const screenshotHtml =
      screenshotBase64 && screenshotBase64.startsWith("data:image")
        ? `<h3 style="margin:24px 0 8px;font-size:14px;color:#374151;">Screenshot</h3>
           <img src="${screenshotBase64}" style="max-width:100%;border:1px solid #e5e7eb;border-radius:6px;" />`
        : "";

    const html = `
<!DOCTYPE html>
<html>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f9fafb;margin:0;padding:24px;">
  <div style="max-width:600px;margin:0 auto;background:#fff;border-radius:8px;border:1px solid #e5e7eb;overflow:hidden;">
    <div style="background:#111827;padding:20px 24px;">
      <h1 style="margin:0;font-size:18px;color:#fff;">Bug Report</h1>
      <p style="margin:4px 0 0;font-size:13px;color:#9ca3af;">AgentCenter — submitted via in-app support</p>
    </div>
    <div style="padding:24px;">

      <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
        <tr>
          <td style="padding:8px 0;font-size:13px;color:#6b7280;width:120px;">Title</td>
          <td style="padding:8px 0;font-size:14px;color:#111827;font-weight:600;">${escapeHtml(title)}</td>
        </tr>
        <tr>
          <td style="padding:8px 0;font-size:13px;color:#6b7280;">Severity</td>
          <td style="padding:8px 0;">
            <span style="display:inline-block;padding:2px 8px;border-radius:9999px;background:${severityColor}20;color:${severityColor};font-size:12px;font-weight:600;">${severityLabel}</span>
          </td>
        </tr>
        <tr>
          <td style="padding:8px 0;font-size:13px;color:#6b7280;">Reporter</td>
          <td style="padding:8px 0;font-size:14px;color:#111827;">${escapeHtml(userName ?? "")} ${userEmail ? `&lt;${escapeHtml(userEmail)}&gt;` : ""}</td>
        </tr>
      </table>

      <h3 style="margin:0 0 8px;font-size:14px;color:#374151;">Description</h3>
      <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:6px;padding:12px 16px;font-size:14px;color:#374151;white-space:pre-wrap;">${escapeHtml(description)}</div>

      <h3 style="margin:24px 0 8px;font-size:14px;color:#374151;">Technical Details</h3>
      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        ${row("URL", url)}
        ${row("Browser", browser)}
        ${row("OS", os)}
        ${row("Screen", screenRes)}
        ${row("Viewport", viewport)}
        ${row("Timezone", timezone)}
        ${geo ? row("Location", geo) : ""}
      </table>

      ${screenshotHtml}

    </div>
  </div>
</body>
</html>`;

    await sendEmail({
      to,
      subject: `[Bug] ${severityLabel}: ${title}`,
      html,
      text: `Bug Report: ${title}\nSeverity: ${severityLabel}\nReporter: ${userName} <${userEmail}>\n\n${description}\n\nURL: ${url}\nBrowser: ${browser}\nOS: ${os}\nTimezone: ${timezone}\nLocation: ${geo}`,
    });

    // Optional Slack notification
    const slackUrl = env.SLACK_SUPPORT_WEBHOOK_URL;
    if (slackUrl) {
      await fetch(slackUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: `*[Bug Report]* ${severityLabel}: *${title}*\n_${userName}_ | ${url}\n>${description?.slice(0, 200)}`,
        }),
      }).catch(() => {});
    }

    return successResponse({ ok: true });
  } catch (err) {
    return handleError(err);
  }
}

function row(label: string, value: string | undefined) {
  if (!value) return "";
  return `<tr>
    <td style="padding:4px 0;color:#6b7280;width:100px;">${label}</td>
    <td style="padding:4px 0;color:#374151;word-break:break-all;">${escapeHtml(value)}</td>
  </tr>`;
}

function escapeHtml(str: string) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

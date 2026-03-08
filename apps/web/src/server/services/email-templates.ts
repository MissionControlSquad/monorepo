import type { UserNotificationType } from "@prisma/client";

interface TemplateData {
  title: string;
  body: string;
  url?: string;
  taskTitle?: string;
}

function baseLayout(content: string): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 0; background: #f5f5f5; }
    .container { max-width: 560px; margin: 0 auto; padding: 24px; }
    .card { background: #fff; border-radius: 8px; padding: 24px; border: 1px solid #e5e5e5; }
    .title { font-size: 18px; font-weight: 600; color: #111; margin: 0 0 8px; }
    .body-text { font-size: 14px; color: #555; line-height: 1.5; margin: 0 0 16px; }
    .btn { display: inline-block; padding: 10px 20px; background: #4f46e5; color: #fff; text-decoration: none; border-radius: 6px; font-size: 14px; font-weight: 500; }
    .footer { font-size: 12px; color: #999; margin-top: 16px; text-align: center; }
  </style>
</head>
<body>
  <div class="container">
    <div class="card">
      ${content}
    </div>
    <p class="footer">Sent by AgentCenter</p>
  </div>
</body>
</html>`;
}

export function renderEmailTemplate(
  _type: UserNotificationType,
  data: TemplateData,
): { html: string; text: string } {
  const cta = data.url ? `<a href="${data.url}" class="btn">View Details</a>` : "";

  const html = baseLayout(`
    <h1 class="title">${escapeHtml(data.title)}</h1>
    <p class="body-text">${escapeHtml(data.body)}</p>
    ${cta}
  `);

  const text = `${data.title}\n\n${data.body}${data.url ? `\n\nView: ${data.url}` : ""}`;

  return { html, text };
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * GET /api/live-gateway/plugin.tgz
 *
 * Serves the agentcenter-bridge OpenClaw plugin archive as a fallback.
 * Preferred install method is ClawHub:
 *   openclaw plugins install clawhub:agentcenter/agentcenter-bridge
 *
 * No auth required — the tgz contains no secrets.
 * The actual secret (token) is entered in OpenClaw after install.
 */

import { readFile } from "node:fs/promises";
import { join } from "node:path";

export async function GET() {
  try {
    const tgzPath = join(process.cwd(), "public", "agentcenter-bridge-0.1.0.tgz");
    const buf = await readFile(tgzPath);
    return new Response(buf, {
      status: 200,
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": 'attachment; filename="agentcenter-bridge.tgz"',
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch {
    return new Response("Plugin package not found", { status: 404 });
  }
}

/**
 * GET /api/live-gateway/plugin.tgz
 *
 * Serves the mc-bridge OpenClaw plugin archive.
 * Users install it with:
 *   openclaw plugins install http://<host>/api/live-gateway/plugin.tgz
 *
 * No auth required — the tgz contains no secrets.
 * The actual secret (token) is entered in OpenClaw after install.
 */

import { readFile } from "node:fs/promises";
import { join } from "node:path";

export async function GET() {
  try {
    const tgzPath = join(process.cwd(), "public", "mc-bridge-0.1.0.tgz");
    const buf = await readFile(tgzPath);
    return new Response(buf, {
      status: 200,
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": 'attachment; filename="mc-bridge.tgz"',
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch {
    return new Response("Plugin package not found", { status: 404 });
  }
}

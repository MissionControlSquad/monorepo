/**
 * GET  /api/live-gateway/tokens — list active install tokens (masked)
 * POST /api/live-gateway/tokens — generate a new install token (raw shown once)
 */

import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { listActiveInstallTokens, createInstallToken } from "@agentcenter/database";
import { successResponse, errorResponse, handleError } from "../../_lib/json-response";
import { resolveSession } from "../../_lib/resolve-session";
import { z } from "zod";

const createTokenSchema = z.object({
  name: z.string().min(1).max(100).optional(),
});

export async function GET(request: Request) {
  try {
    await resolveSession(request);

    const tokens = await listActiveInstallTokens();
    // Return masked view — never expose tokenHash
    const masked = tokens.map(({ id, tokenPrefix, name }) => ({
      id,
      prefix: tokenPrefix,
      name: name ?? null,
      maskedToken: `${tokenPrefix}${"*".repeat(56)}`,
    }));

    return successResponse({ tokens: masked });
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(request: Request) {
  try {
    await resolveSession(request);

    const body = await request.json().catch(() => ({}));
    const parsed = createTokenSchema.safeParse(body);
    if (!parsed.success) return errorResponse("Invalid request body", 400);

    // Generate a 64-char hex token (256 bits entropy)
    const rawToken = randomBytes(32).toString("hex");
    const tokenPrefix = rawToken.slice(0, 8);
    const tokenHash = await bcrypt.hash(rawToken, 12);

    await createInstallToken({
      tokenHash,
      tokenPrefix,
      name: parsed.data.name,
    });

    // Raw token is returned ONCE — never stored in plaintext
    return successResponse({
      token: rawToken,
      prefix: tokenPrefix,
      name: parsed.data.name ?? null,
      warning: "Store this token securely. It will not be shown again.",
    });
  } catch (err) {
    return handleError(err);
  }
}

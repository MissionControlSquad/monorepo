/**
 * GET  /api/live-gateway/tokens — list active install tokens (masked)
 * POST /api/live-gateway/tokens — generate a new install token (raw shown once)
 */

import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { listActiveLiveGatewayTokens, createLiveGatewayToken } from "@agentcenter/database";
import { successResponse, errorResponse, handleError } from "../../_lib/json-response";
import { apiLimiters } from "../../_lib/rate-limit-check";
import { resolveSession } from "../../_lib/resolve-session";
import { withFeature } from "../../_lib/with-feature";
import { withRateLimit } from "../../_lib/with-rate-limit";
import { FLAG_KEYS } from "@agentcenter/utils";
import { z } from "zod";

const createTokenSchema = z.object({
  name: z.string().min(1).max(100).optional(),
});

async function getHandler(request: Request) {
  try {
    await resolveSession(request);

    const tokens = await listActiveLiveGatewayTokens();
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

async function postHandler(request: Request) {
  try {
    await resolveSession(request);

    const body = await request.json().catch(() => ({}));
    const parsed = createTokenSchema.safeParse(body);
    if (!parsed.success) return errorResponse("Invalid request body", 400);

    // Generate 64-char hex token (256 bits of entropy)
    const rawToken = randomBytes(32).toString("hex");
    const tokenPrefix = rawToken.slice(0, 8);
    const tokenHash = await bcrypt.hash(rawToken, 12);

    await createLiveGatewayToken({
      tokenHash,
      tokenPrefix,
      name: parsed.data.name,
    });

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

export const GET = withRateLimit(
  apiLimiters.liveGatewayTokens,
  withFeature(FLAG_KEYS.LIVE_GATEWAY, getHandler),
);
export const POST = withRateLimit(
  apiLimiters.liveGatewayTokens,
  withFeature(FLAG_KEYS.LIVE_GATEWAY, postHandler),
);

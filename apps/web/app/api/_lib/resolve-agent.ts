import { agentModel } from "@/server/models";
import { hashApiKey } from "@/server/api-key";
import { agentCache } from "@/server/cache";
import { isLicenseActive } from "@/server/license";
import { log, logWarn } from "./logger";

interface ResolveOptions {
  allowPendingSetup?: boolean;
}

/**
 * Resolve an agent from a Bearer API key in the Authorization header.
 *
 * Expects: Authorization: Bearer mc_<key>
 *
 * Throws { error, status } on failure.
 */
export async function resolveAgent(request: Request, options?: ResolveOptions) {
  // License gate — no agent operations when license is not active
  const licensed = await isLicenseActive();
  if (!licensed) {
    throw { error: "License not active", status: 403 };
  }

  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    throw {
      error: "Authorization: Bearer <api_key> header is required",
      status: 401,
    };
  }

  const token = authHeader.slice(7);
  const hash = hashApiKey(token);

  let agent = agentCache.get(hash);
  let source: "cache" | "db";
  if (!agent) {
    const found = await agentModel.findOne({
      where: { apiKeyHash: hash },
    });
    if (!found) {
      logWarn("auth", "Invalid API key", request);
      throw { error: "Invalid API key", status: 401 };
    }
    agentCache.set(hash, found);
    agent = found;
    source = "db";
  } else {
    source = "cache";
  }

  if (agent.setupStatus === "deactivated") {
    logWarn("auth", `Agent deactivated: agent="${agent.name}"`, request);
    throw { error: "Agent is deactivated", status: 403 };
  }
  if (agent.setupStatus === "pending_setup" && !options?.allowPendingSetup) {
    logWarn("auth", `Agent setup incomplete: agent="${agent.name}"`, request);
    throw { error: "Agent setup is not complete", status: 403 };
  }

  log(
    "auth",
    `Agent resolved: agent="${agent.name}" id=${agent.id.slice(0, 8)} (${source})`,
    request,
  );
  return agent;
}

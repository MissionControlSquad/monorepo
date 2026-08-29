import { createHmac, timingSafeEqual } from "node:crypto";
import { prisma } from "@/server/prisma";
import { FLAG_KEYS, isPluginEffective, type PluginLifecycleState } from "@agentcenter/utils";
import type { PluginManifest, PluginWebhook } from "@agentcenter/utils";
import { isFeatureEnabled } from "@/server/feature-flags";
import { resolveWorkspaceSecret } from "@/server/services/secrets";
import { assertPluginCapability } from "./plugin-grants";
import { enqueuePluginJob } from "./plugin-jobs";
import { setPluginState, getPluginState } from "./plugin-state";

// Inbound plugin webhook receiver (§3 plugins). A plugin declares webhooks in its manifest; the host
// mounts /api/plugins/<id>/webhooks/<hook>, verifies an HMAC signature against a per-plugin signing
// secret from the workspace vault, and enqueues a PluginJob for the worker to process. FAIL-CLOSED at
// every gate: runtime flag off, plugin ineffective, capability ungranted, missing secret, or a bad
// signature all REFUSE — nothing is enqueued and no plugin code runs. Workspace-scoped (D5).

/** The capability a plugin must hold (granted) for the host to accept its inbound webhooks. */
export const PLUGIN_WEBHOOK_CAPABILITY = "webhooks.receive" as const;

/** Typed refusal (fail-closed). `status` maps straight to the HTTP response so the route stays thin. */
export class PluginWebhookError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "PluginWebhookError";
  }
}

/**
 * Verify an HMAC-SHA256 hex signature over the raw request body. Constant-time comparison — never a
 * plain `===` (avoids a timing side-channel). Tolerates an optional `sha256=` prefix (GitHub-style).
 * Returns false on any shape mismatch rather than throwing, so the caller decides the HTTP code.
 */
export function verifyWebhookSignature(
  secret: string,
  rawBody: string,
  signature: string | null | undefined,
): boolean {
  if (!secret || !signature) return false;
  const provided = signature.startsWith("sha256=") ? signature.slice(7) : signature;
  const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
  // timingSafeEqual throws if lengths differ — guard first (length is not itself secret).
  if (provided.length !== expected.length) return false;
  try {
    return timingSafeEqual(Buffer.from(provided, "hex"), Buffer.from(expected, "hex"));
  } catch {
    return false;
  }
}

/** The vault secret name that holds a webhook's signing key. Manifest may override via `secretName`. */
export function webhookSecretName(pluginId: string, hook: string, decl?: PluginWebhook): string {
  return decl?.secretName ?? `plugin.${pluginId}.webhook.${hook}`;
}

function manifestWebhooks(manifest: unknown): PluginWebhook[] {
  if (!manifest || typeof manifest !== "object") return [];
  const w = (manifest as Partial<PluginManifest>).webhooks;
  return Array.isArray(w) ? (w as PluginWebhook[]) : [];
}

export interface ReceiveWebhookInput {
  workspaceId: string;
  pluginId: string;
  hook: string;
  rawBody: string;
  signature: string | null | undefined;
  /** Optional idempotency key (a delivery id from the sender) — replay-guarded when present. */
  deliveryId?: string | null;
  headers?: Record<string, string>;
}

export interface ReceiveWebhookResult {
  jobId: string;
  jobKey: string;
  duplicate?: boolean;
}

/**
 * Receive + validate an inbound webhook and enqueue it for the plugin worker. Order of gates (all
 * fail-closed):
 *   1. PLUGIN_RUNTIME flag on          → else 403
 *   2. plugin installed + effective    → else 404 (no existence leak for a foreign/absent plugin)
 *   3. manifest declares this hook      → else 404
 *   4. `webhooks.receive` GRANTED       → else 403 (PluginCapabilityDeniedError normalized)
 *   5. signing secret resolvable        → else 401 (can't verify ⇒ reject)
 *   6. HMAC signature valid             → else 401
 *   7. replay guard (deliveryId seen)   → duplicate ⇒ no re-enqueue
 * Only after all pass is a PluginJob enqueued (jobKey = decl.jobKey ?? `webhook:<hook>`).
 */
export async function receivePluginWebhook(
  input: ReceiveWebhookInput,
): Promise<ReceiveWebhookResult> {
  const { workspaceId, pluginId, hook, rawBody, signature } = input;

  if (!(await isFeatureEnabled(FLAG_KEYS.PLUGIN_RUNTIME)))
    throw new PluginWebhookError(403, "FEATURE_DISABLED", "Plugin runtime is not enabled");

  const plugin = await prisma.plugin.findUnique({
    where: { workspaceId_pluginId: { workspaceId, pluginId } },
    select: { status: true, enabled: true, manifest: true },
  });
  // Foreign / absent plugin → 404 (avoid existence leakage — security-review checklist).
  if (!plugin) throw new PluginWebhookError(404, "NOT_FOUND", "Plugin not found");
  const state: PluginLifecycleState = {
    status: plugin.status as PluginLifecycleState["status"],
    enabled: plugin.enabled,
  };
  if (!isPluginEffective(state)) throw new PluginWebhookError(404, "NOT_FOUND", "Plugin not found");

  const decl = manifestWebhooks(plugin.manifest).find((w) => w.hook === hook);
  if (!decl) throw new PluginWebhookError(404, "NOT_FOUND", "Webhook not declared");

  // Fail-closed capability gate. Normalize the typed denial into a 403.
  try {
    await assertPluginCapability(workspaceId, pluginId, PLUGIN_WEBHOOK_CAPABILITY);
  } catch {
    throw new PluginWebhookError(
      403,
      "CAPABILITY_DENIED",
      `plugin '${pluginId}' is not granted '${PLUGIN_WEBHOOK_CAPABILITY}'`,
    );
  }

  const secret = await resolveWorkspaceSecret(
    workspaceId,
    webhookSecretName(pluginId, hook, decl),
    {
      actorType: "system",
      consumerType: "plugin",
      consumerId: pluginId,
    },
  );
  // No secret ⇒ we cannot verify ⇒ reject (fail-closed), never accept an unsigned/unverifiable webhook.
  if (!secret)
    throw new PluginWebhookError(401, "UNVERIFIED", "Webhook signing secret is not configured");

  if (!verifyWebhookSignature(secret, rawBody, signature))
    throw new PluginWebhookError(401, "BAD_SIGNATURE", "Invalid webhook signature");

  // Replay guard: if the sender supplied a delivery id, drop a duplicate (idempotent). Stored in the
  // plugin KV under a dedicated namespace so it is cleaned up on uninstall like all plugin state.
  const jobKey = decl.jobKey ?? `webhook:${hook}`;
  if (input.deliveryId) {
    const seenKey = `${hook}:${input.deliveryId}`;
    const seen = await getPluginState(workspaceId, pluginId, seenKey, "webhook:seen");
    if (seen) {
      return { jobId: String((seen as { jobId?: string }).jobId ?? ""), jobKey, duplicate: true };
    }
  }

  let parsedBody: unknown = rawBody;
  try {
    parsedBody = rawBody ? JSON.parse(rawBody) : null;
  } catch {
    /* not JSON — hand the raw string to the plugin */
  }

  const job = await enqueuePluginJob({
    workspaceId,
    pluginId,
    jobKey,
    payload: {
      hook,
      body: parsedBody,
      headers: input.headers ?? {},
      deliveryId: input.deliveryId ?? null,
    },
  });

  if (input.deliveryId) {
    await setPluginState(
      workspaceId,
      pluginId,
      `${hook}:${input.deliveryId}`,
      { jobId: job.id, at: new Date().toISOString() },
      "webhook:seen",
    );
  }

  return { jobId: job.id, jobKey };
}

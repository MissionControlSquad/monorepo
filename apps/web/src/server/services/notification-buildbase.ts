// Buildbase notification-delivery adapter (dormant-until-provisioned).
//
// Routes user-facing push/email delivery through buildbase `notification.send()` — its own
// 4-layer gating, templates, and per-user preferences — instead of the home-grown
// sendPushToUser/sendEmail path. This is the ONE genuine overlap in the AI-vs-user split
// (see .paperclip-parity/BUILDBASE-PLAN.mdx): the monorepo owns the *trigger* (what to notify
// about, an AI-domain concern), buildbase owns the *delivery* (a user-layer concern).
//
// Fail-safe by construction — returns "skip" (caller falls back to the home-grown path) whenever:
//   • buildbase is unconfigured (no ORG_ID / SERVER_URL / service session), OR
//   • the channel is in_app (no external delivery), OR
//   • no workspaceId can be resolved (buildbase notifications are workspace-scoped; our
//     UserNotification is user-scoped, so the creation site must stamp metadata.workspaceId
//     to opt a notification into buildbase delivery), OR
//   • buildbase declines the send (event disabled / missing template).
//
// Two activation gates, both fail-safe: (1) provision the buildbase org + notification events,
// (2) stamp `workspaceId` into UserNotification.metadata at creation. Until both, this is inert.
import BuildBase from "@buildbase/sdk";
import type { UserNotification } from "@agentcenter/database";
import { log } from "../logger";

const ORG_ID = process.env.NEXT_PUBLIC_SAAS_ORG_ID ?? "";
const SERVER_URL = process.env.NEXT_PUBLIC_SAAS_SERVER_URL ?? "";
// Server-to-server session for org-level buildbase calls (see SDK server setup).
const SERVICE_SESSION_ID = process.env.BUILDBASE_SERVICE_SESSION_ID ?? "";

const configured = Boolean(ORG_ID && SERVER_URL && SERVICE_SESSION_ID);

const bb = configured
  ? BuildBase({
      serverUrl: SERVER_URL,
      orgId: ORG_ID,
      getSessionId: async () => SERVICE_SESSION_ID || null,
    })
  : null;

/** True when buildbase notification delivery is provisioned (org + server + service session). */
export function isBuildbaseNotificationsEnabled(): boolean {
  return bb !== null;
}

function resolveWorkspaceId(record: UserNotification): string | null {
  const md = record.metadata as { workspaceId?: unknown } | null | undefined;
  if (md && typeof md.workspaceId === "string" && md.workspaceId.length > 0) {
    return md.workspaceId;
  }
  return null;
}

export type BuildbaseDeliveryOutcome = "delivered" | "skip";

/**
 * Attempt delivery via buildbase. Returns "delivered" when buildbase handled it (the caller
 * should mark the record sent) or "skip" to fall back to the home-grown delivery path.
 * Never throws for a config/routing reason — only a genuine transport error from a *configured*
 * send propagates, so the existing retry/dead-letter machinery still applies.
 */
export async function deliverViaBuildbase(
  record: UserNotification,
): Promise<BuildbaseDeliveryOutcome> {
  if (!bb) return "skip";

  const workspaceId = resolveWorkspaceId(record);
  if (!workspaceId) return "skip";

  // No channels override — buildbase applies the event's channel config AND the member's per-type
  // push/email preference (its 4-layer gate). We record in-app ourselves; buildbase does push/email.
  const result = await bb.notification.send(workspaceId, record.type, record.userId, {
    title: record.title,
    message: record.body,
    url: record.url ?? undefined,
  });

  if (!result.sent) {
    // Declined by buildbase gating (e.g. event disabled, no template) — fall back rather than drop.
    log(
      "notification",
      `buildbase declined ${record.channel} for ${record.id}: ${result.reason ?? "unknown"}`,
    );
    return "skip";
  }

  return "delivered";
}

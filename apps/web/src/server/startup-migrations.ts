/**
 * One-time data migrations that run on server startup.
 * Each migration is idempotent and guarded by a check so it only does real
 * work when there are rows to fix.
 */
import {
  findProfilesWithR2AvatarUrl,
  updateProfileAvatarUrl,
  ensureFeatureFlagExists,
} from "@agentcenter/database";
import { FLAG_KEYS } from "../lib/feature-flag-keys";

/**
 * Convert raw presigned R2 URLs in Profile.avatarUrl to proxy paths.
 * Agents may have sent their avatar as a direct R2 URL which expires after 1h.
 */
async function normalizeAvatarUrls() {
  // Only fetch profiles whose avatarUrl looks like an R2 presigned URL
  const profiles = await findProfilesWithR2AvatarUrl();

  if (profiles.length === 0) return;

  console.log(`[startup] Normalizing ${profiles.length} avatar URL(s) with raw R2 URLs...`);

  let updated = 0;
  for (const profile of profiles) {
    const raw = profile.avatarUrl!;
    try {
      const url = new URL(raw);
      if (!url.hostname.endsWith("r2.cloudflarestorage.com")) continue;
      const segments = url.pathname.replace(/^\//, "").split("/");
      const storageKey = segments.slice(1).join("/");
      if (!storageKey) continue;

      const normalized = `/api/storage/${storageKey}?public=1`;
      await updateProfileAvatarUrl(profile.id, normalized);
      updated++;
    } catch {
      // Not a valid URL — skip
    }
  }

  if (updated > 0) {
    console.log(`[startup] Normalized ${updated} avatar URL(s).`);
  }
}

/**
 * Ensure all feature flags exist in the database with sensible defaults.
 * Uses upsert so existing flags (and their current enabled state) are not overwritten.
 */
async function ensureFeatureFlags() {
  const defaults: {
    key: string;
    enabled: boolean;
    managedBy: "system" | "user";
    description: string;
  }[] = [
    {
      key: FLAG_KEYS.CHANNELS,
      enabled: true,
      managedBy: "system",
      description: "Team messaging channels and DMs",
    },
    {
      key: FLAG_KEYS.ANALYTICS,
      enabled: true,
      managedBy: "system",
      description: "Analytics dashboard with charts and metrics",
    },
    {
      key: FLAG_KEYS.RECURRING_TASKS,
      enabled: true,
      managedBy: "system",
      description: "Recurring/scheduled task templates",
    },
    {
      key: FLAG_KEYS.CLOUD_VMS,
      enabled: true,
      managedBy: "system",
      description: "Cloud VM provisioning for agents",
    },
    {
      key: FLAG_KEYS.REVIEWS,
      enabled: true,
      managedBy: "system",
      description: "Task review workflow (approve/reject/clarify)",
    },
    {
      key: FLAG_KEYS.DOCUMENTS,
      enabled: true,
      managedBy: "system",
      description: "Document management and project docs",
    },
    {
      key: FLAG_KEYS.AGENT_QUEUE,
      enabled: true,
      managedBy: "user",
      description: "Agent work queue management",
    },
    {
      key: FLAG_KEYS.NOTIFICATIONS,
      enabled: true,
      managedBy: "user",
      description: "Push and email notifications",
    },
  ];

  let created = 0;
  for (const flag of defaults) {
    const didCreate = await ensureFeatureFlagExists(flag);
    if (didCreate) created++;
  }

  if (created > 0) {
    console.log(`[startup] Created ${created} missing feature flag(s).`);
  }
}

export async function runStartupMigrations() {
  try {
    await normalizeAvatarUrls();
    await ensureFeatureFlags();
  } catch (err) {
    // Log but don't crash the server — these are best-effort fixes
    console.error("[startup] Migration error (non-fatal):", err);
  }
}

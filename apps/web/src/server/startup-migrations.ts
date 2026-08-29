/**
 * One-time data migrations that run on server startup.
 * Each migration is idempotent and guarded by a check so it only does real
 * work when there are rows to fix.
 */
import { findProfilesWithR2AvatarUrl, updateProfileAvatarUrl } from "@agentcenter/database";
import { ensureBuiltinAdapters } from "@/server/adapters/registry";

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
    let storageKey: string | null = null;

    // Raw R2 presigned URL → bare key (strip bucket prefix from path)
    try {
      const url = new URL(raw);
      if (url.hostname.endsWith("r2.cloudflarestorage.com")) {
        const segments = url.pathname.replace(/^\//, "").split("/");
        storageKey = segments.slice(1).join("/") || null;
      }
    } catch {
      // Not a valid URL
    }

    // Legacy proxy path /api/storage/avatars/uuid.png?public=1 → bare key
    if (!storageKey && raw.startsWith("/api/storage/")) {
      storageKey = raw.replace("/api/storage/", "").split("?")[0];
    }

    if (!storageKey) continue;
    await updateProfileAvatarUrl(profile.id, storageKey);
    updated++;
  }

  if (updated > 0) {
    console.log(`[startup] Normalized ${updated} avatar URL(s).`);
  }
}

export async function runStartupMigrations() {
  try {
    await normalizeAvatarUrls();
    await ensureBuiltinAdapters();
  } catch (err) {
    // Log but don't crash the server — these are best-effort fixes
    console.error("[startup] Migration error (non-fatal):", err);
  }
}

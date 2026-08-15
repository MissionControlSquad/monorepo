import { updateProfileAvatar } from "@agentcenter/database";
import { uploadFileToR2 } from "@/server/storage/r2";
import { resolveSession } from "../../_lib/resolve-session";
import { successResponse, errorResponse } from "../../_lib/json-response";
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";

const MAX_AVATAR_SIZE = 5 * 1024 * 1024; // 5 MB

const ALLOWED_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);

/**
 * POST /api/profile/avatar
 * Body: multipart/form-data with a `file` field (image only, max 5 MB)
 * Auth: session cookie
 * Returns: { avatarUrl: string }
 *
 * Uploads the image to R2 under the "avatars" prefix, updates the
 * current user's profile.avatarUrl, and returns the serving URL.
 */
export async function POST(request: Request) {
  let profileId: string;
  try {
    const session = await resolveSession(request);
    if (!session.profileId) return errorResponse("Authentication required", 401);
    profileId = session.profileId;
  } catch {
    return errorResponse("Authentication required", 401);
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return errorResponse("Expected multipart/form-data with a 'file' field", 400);
  }

  const file = formData.get("file");
  if (!file || !(file instanceof File)) {
    return errorResponse("'file' field is required", 400);
  }

  if (file.size > MAX_AVATAR_SIZE) {
    return errorResponse("Avatar must be under 5 MB", 400);
  }

  const mimeType = file.type || "application/octet-stream";
  if (!ALLOWED_MIME_TYPES.has(mimeType)) {
    return errorResponse("Only PNG, JPEG, GIF, and WebP images are allowed", 400);
  }

  const fileName = file.name || "avatar";
  const buffer = Buffer.from(await file.arrayBuffer());
  let storageKey: string;

  try {
    storageKey = await uploadFileToR2(fileName, mimeType, buffer, "avatars");
  } catch (err) {
    // R2 unreachable (common in dev) — fall back to local filesystem
    console.warn(
      "[avatar] R2 upload failed, falling back to local storage:",
      (err as Error).message,
    );

    const uploadsDir = join("/tmp", "uploads");
    const subDir = join(uploadsDir, "avatars");
    await mkdir(subDir, { recursive: true });

    const localFileName = `${crypto.randomUUID()}-${fileName}`;
    storageKey = `avatars/${localFileName}`;
    await writeFile(join(subDir, localFileName), buffer);
  }

  // Store the bare storage key — same pattern as deliverables.
  // The proxy URL is computed at render time so it can never be a stale presigned URL.
  await updateProfileAvatar(profileId, storageKey);

  return successResponse({ avatarUrl: storageKey });
}

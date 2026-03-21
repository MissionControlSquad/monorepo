import { NextResponse } from "next/server";
import { updateProfileAvatar } from "@agentcenter/database";
import { uploadFileToR2 } from "@/server/storage/r2";
import { verifySessionToken, COOKIE_NAME } from "@/server/admin-auth";
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
  const cookie = request.headers.get("cookie");
  const match = cookie?.match(new RegExp(`${COOKIE_NAME}=([^;]+)`));
  const sessionToken = match ? match[1].trim() : null;

  let profileId: string | null = null;
  if (sessionToken) {
    const session = await verifySessionToken(sessionToken);
    if (session?.profileId) {
      profileId = session.profileId;
    }
  }

  if (!profileId) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "Expected multipart/form-data with a 'file' field" },
      { status: 400 },
    );
  }

  const file = formData.get("file");
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "'file' field is required" }, { status: 400 });
  }

  if (file.size > MAX_AVATAR_SIZE) {
    return NextResponse.json({ error: "Avatar must be under 5 MB" }, { status: 400 });
  }

  const mimeType = file.type || "application/octet-stream";
  if (!ALLOWED_MIME_TYPES.has(mimeType)) {
    return NextResponse.json(
      { error: "Only PNG, JPEG, GIF, and WebP images are allowed" },
      { status: 400 },
    );
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

  // Build the serving URL
  const avatarUrl = `/api/storage/${storageKey}?public=1`;

  // Update the profile
  await updateProfileAvatar(profileId, avatarUrl);

  return NextResponse.json({ avatarUrl });
}

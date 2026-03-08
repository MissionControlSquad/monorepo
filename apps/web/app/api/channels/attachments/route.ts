import { NextResponse } from "next/server";
import { prisma } from "@/server/prisma";
import { uploadFileToR2 } from "@/server/storage/r2";
import { resolveAgent } from "../../_lib/resolve-agent";
import { verifySessionToken, COOKIE_NAME } from "@/server/admin-auth";
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";

const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25 MB

const BLOCKED_MIME_TYPES = new Set([
  "application/x-msdownload",
  "application/x-executable",
  "application/x-sharedlib",
  "application/x-mach-binary",
]);

/**
 * POST /api/channels/attachments
 * Body: multipart/form-data with a `file` field
 * Auth: session cookie (human) or Bearer token (agent)
 * Returns: { documentId: string, storageKey: string }
 *
 * Uploads the file to R2 via the S3 SDK, then creates a Document record.
 * Falls back to local filesystem storage if R2 is unreachable.
 */
export async function POST(request: Request) {
  let profileId: string | null = null;
  let agentId: string | null = null;

  // Try agent Bearer token first
  const authHeader = request.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    try {
      const agent = await resolveAgent(request);
      agentId = agent.id;
      const profile = await prisma.profile.findUnique({ where: { agentId: agent.id } });
      if (profile) profileId = profile.id;
    } catch {
      // fall through to session check
    }
  }

  // Fall back to session cookie
  if (!agentId && !profileId) {
    const cookie = request.headers.get("cookie");
    const match = cookie?.match(new RegExp(`${COOKIE_NAME}=([^;]+)`));
    const sessionToken = match ? match[1].trim() : null;
    if (sessionToken) {
      const session = await verifySessionToken(sessionToken);
      if (session?.profileId) {
        profileId = session.profileId;
      }
    }
  }

  if (!profileId && !agentId) {
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

  const fileName = file.name || "untitled";
  const mimeType = file.type || "application/octet-stream";
  const fileSize = file.size;

  if (fileSize > MAX_FILE_SIZE) {
    return NextResponse.json({ error: "File size exceeds 25 MB limit" }, { status: 400 });
  }
  if (BLOCKED_MIME_TYPES.has(mimeType)) {
    return NextResponse.json({ error: "Executable file types are not allowed" }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  let storageKey: string;

  try {
    storageKey = await uploadFileToR2(fileName, mimeType, buffer, "attachments");
  } catch (err: unknown) {
    const s3Err = err as {
      $metadata?: { httpStatusCode?: number };
      Code?: string;
      name?: string;
      message?: string;
    };
    console.warn(
      `[attachments] R2 upload failed, falling back to local storage: ` +
        `fileName="${fileName}" mimeType="${mimeType}" size=${fileSize} ` +
        `status=${s3Err.$metadata?.httpStatusCode ?? "?"} code="${s3Err.Code ?? s3Err.name ?? "unknown"}" ` +
        `message="${s3Err.message ?? ""}"`,
    );

    const uploadsDir = join("/tmp", "uploads");
    const subDir = join(uploadsDir, "attachments");
    await mkdir(subDir, { recursive: true });

    const localFileName = `${crypto.randomUUID()}-${fileName}`;
    storageKey = `attachments/${localFileName}`;
    await writeFile(join(subDir, localFileName), buffer);
  }

  // Step 3: Create Document record
  const document = await prisma.document.create({
    data: {
      title: fileName,
      content: "",
      type: "file",
      storageKey,
      fileName,
      mimeType,
      fileSize,
      createdById: agentId ?? null,
      createdByProfileId: profileId ?? null,
    },
  });

  return NextResponse.json({
    documentId: document.id,
    storageKey,
  });
}

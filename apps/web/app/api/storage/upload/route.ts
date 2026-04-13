import { generateUploadUrl } from "@/server/storage/r2";
import { resolveAgent } from "../../_lib/resolve-agent";
import { verifySessionToken, COOKIE_NAME } from "@/server/admin-auth";
import { successResponse, errorResponse } from "../../_lib/json-response";
import { storageUploadSchema } from "../../_lib/validation";
import { StoragePrefix } from "@/server/constants";

/**
 * POST /api/storage/upload
 * Body: { fileName: string, mimeType: string, prefix?: "deliverables" | "attachments" }
 * Auth: Bearer token or session cookie
 * Returns: { key: string, uploadUrl: string }
 *
 * The client uploads the file directly to the returned `uploadUrl` (PUT request),
 * then references `key` as storageKey when submitting the deliverable.
 */
export async function POST(request: Request) {
  let authenticated = false;

  // Try agent Bearer token first
  const authHeader = request.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    try {
      await resolveAgent(request);
      authenticated = true;
    } catch {
      // Bearer token invalid — fall through to session check
    }
  }

  // Fall back to session cookie
  if (!authenticated) {
    const cookie = request.headers.get("cookie");
    const match = cookie?.match(new RegExp(`${COOKIE_NAME}=([^;]+)`));
    const sessionToken = match ? match[1].trim() : null;
    if (sessionToken) {
      const session = await verifySessionToken(sessionToken);
      if (session) {
        authenticated = true;
      }
    }
  }

  if (!authenticated) {
    return errorResponse("Authentication required (Bearer token or session cookie)", 401);
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return errorResponse("Invalid JSON body", 400);
  }

  const parsed = storageUploadSchema.safeParse(rawBody);
  if (!parsed.success) {
    const messages = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
    return errorResponse(messages.join("; "), 400);
  }

  const { fileName, mimeType, prefix } = parsed.data;
  const storagePrefix =
    prefix === StoragePrefix.ATTACHMENTS ? StoragePrefix.ATTACHMENTS : StoragePrefix.DELIVERABLES;

  try {
    const result = await generateUploadUrl(fileName, mimeType, storagePrefix);
    console.info(
      `[storage/upload] Presigned URL issued: fileName="${fileName}" mimeType="${mimeType}" prefix="${storagePrefix}" key="${result.key}"`,
    );
    return successResponse(result);
  } catch (err) {
    console.error(
      `[storage/upload] Failed to generate presigned URL: fileName="${fileName}" mimeType="${mimeType}" prefix="${storagePrefix}"`,
      err,
    );
    return errorResponse(
      "Failed to generate upload URL — check R2 credentials and bucket permissions",
      502,
    );
  }
}

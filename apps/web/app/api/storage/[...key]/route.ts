import { NextResponse } from "next/server";
import { resolveAgent } from "../../_lib/resolve-agent";
import { errorResponse } from "../../_lib/json-response";
import { verifySessionToken, COOKIE_NAME } from "@/server/admin-auth";
import { generateDownloadUrl } from "@/server/storage/r2";
import { env } from "@/server/env";
import { readFile } from "fs/promises";
import { join } from "path";
import { existsSync } from "fs";

const BASE_PREFIXES = ["deliverables/", "attachments/", "avatars/"];

/** Check whether a storage key starts with a valid prefix (with or without R2_PREFIX) */
function hasValidPrefix(storageKey: string): boolean {
  const r2Prefix = env.R2_PREFIX ? `${env.R2_PREFIX}/` : "";
  return BASE_PREFIXES.some(
    (p) => storageKey.startsWith(p) || (r2Prefix && storageKey.startsWith(`${r2Prefix}${p}`)),
  );
}

/** Check whether a storage key is for an asset type that allows public access */
function allowsPublicAccess(storageKey: string): boolean {
  const r2Prefix = env.R2_PREFIX ? `${env.R2_PREFIX}/` : "";
  return (
    storageKey.startsWith("avatars/") ||
    (!!r2Prefix && storageKey.startsWith(`${r2Prefix}avatars/`))
  );
}

/**
 * GET /api/storage/[...key]
 * Auth: Bearer token or session cookie (required unless ?public=1 on allowed prefixes).
 * Redirects to a presigned R2 download URL for the given storage key.
 * Catch-all route so keys with slashes (e.g. "deliverables/1234-file.png") resolve correctly.
 */
export async function GET(request: Request, { params }: { params: Promise<{ key: string[] }> }) {
  const { key } = await params;

  if (!key || key.length === 0) {
    return errorResponse("key is required", 400);
  }

  // Join path segments back into the original storage key
  // e.g. ["deliverables", "1234-file.png"] → "deliverables/1234-file.png"
  const storageKey = key.map(decodeURIComponent).join("/");

  // Path traversal protection: reject keys with ".." or that don't match valid prefixes
  if (storageKey.includes("..") || !hasValidPrefix(storageKey)) {
    return errorResponse("Invalid storage key", 400);
  }

  const { searchParams } = new URL(request.url);
  const isPublic = searchParams.get("public") === "1";

  // ?public=1 only allowed for specific prefixes (e.g. avatars)
  if (isPublic && !allowsPublicAccess(storageKey)) {
    return errorResponse("Public access not allowed for this asset type", 403);
  }

  if (!isPublic) {
    // Try agent Bearer token first, then fall back to admin session cookie
    let authenticated = false;

    const authHeader = request.headers.get("authorization");
    if (authHeader?.startsWith("Bearer ")) {
      try {
        await resolveAgent(request);
        authenticated = true;
      } catch {
        // Bearer token invalid — fall through to session check
      }
    }

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
  }

  // Redirect cache TTL must stay below the presigned URL expiry (3600 s).
  // If the browser caches the redirect longer than the signature lives,
  // it will re-use a 302 pointing at an expired URL and get 403 from R2.
  // 3300 s (55 min) gives a 5-min safety margin before the 60-min signature expires.
  // Local-filesystem responses (dev fallback) serve actual bytes so they can
  // use a longer immutable cache.
  const redirectCacheControl = isPublic ? "public, max-age=3300" : "private, max-age=3300";
  const fileCacheControl = isPublic
    ? "public, max-age=86400, immutable"
    : "private, max-age=86400, immutable";

  // Try local filesystem first (for dev fallback uploads)
  const localPath = join("/tmp", "uploads", storageKey);
  if (existsSync(localPath)) {
    const { stat } = await import("fs/promises");
    const fileStat = await stat(localPath);
    const fileSize = fileStat.size;
    const ext = storageKey.split(".").pop()?.toLowerCase() ?? "";
    const mimeMap: Record<string, string> = {
      png: "image/png",
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      gif: "image/gif",
      webp: "image/webp",
      svg: "image/svg+xml",
      pdf: "application/pdf",
      mp4: "video/mp4",
      webm: "video/webm",
      mp3: "audio/mpeg",
      wav: "audio/wav",
      csv: "text/csv",
      txt: "text/plain",
      json: "application/json",
    };
    const contentType = mimeMap[ext] || "application/octet-stream";

    // Support range requests for video/audio playback
    const rangeHeader = request.headers.get("range");
    if (rangeHeader) {
      const match = rangeHeader.match(/bytes=(\d+)-(\d*)/);
      const start = match ? parseInt(match[1], 10) : 0;
      const end = match && match[2] ? parseInt(match[2], 10) : fileSize - 1;
      const chunkSize = end - start + 1;
      const { createReadStream } = await import("fs");
      const stream = createReadStream(localPath, { start, end });
      const readable = new ReadableStream({
        start(controller) {
          stream.on("data", (chunk: Buffer | string) =>
            controller.enqueue(new Uint8Array(Buffer.from(chunk))),
          );
          stream.on("end", () => controller.close());
          stream.on("error", (err) => controller.error(err));
        },
      });
      return new NextResponse(readable, {
        status: 206,
        headers: {
          "Content-Type": contentType,
          "Content-Range": `bytes ${start}-${end}/${fileSize}`,
          "Content-Length": String(chunkSize),
          "Accept-Ranges": "bytes",
          "Cache-Control": fileCacheControl,
        },
      });
    }

    const fileBuffer = await readFile(localPath);
    return new NextResponse(fileBuffer, {
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(fileSize),
        "Accept-Ranges": "bytes",
        "Cache-Control": fileCacheControl,
      },
    });
  }

  // Redirect to a presigned R2 download URL.
  // The redirect TTL (3300 s) is intentionally shorter than the presigned URL
  // expiry (3600 s) so the browser always re-fetches a fresh redirect before
  // the signature can expire.
  try {
    const downloadUrl = await generateDownloadUrl(storageKey);
    return NextResponse.redirect(downloadUrl, {
      headers: { "Cache-Control": redirectCacheControl },
    });
  } catch (err) {
    console.error(`[storage/download] Failed to generate download URL: key="${storageKey}"`, err);
    return errorResponse(
      "Failed to generate download URL — check R2 credentials and bucket permissions",
      502,
    );
  }
}

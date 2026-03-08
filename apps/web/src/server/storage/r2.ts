import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "../env";

// Use globalThis to survive HMR but allow config changes to take effect on full restart
const globalForR2 = globalThis as unknown as { __r2Client_v2?: S3Client };

function getS3Client(): S3Client {
  if (globalForR2.__r2Client_v2) return globalForR2.__r2Client_v2;

  if (!env.R2_ACCOUNT_ID || !env.R2_ACCESS_KEY_ID || !env.R2_SECRET_ACCESS_KEY) {
    throw new Error(
      "R2 storage credentials (R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY) are required for file operations",
    );
  }

  globalForR2.__r2Client_v2 = new S3Client({
    region: "auto",
    endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: env.R2_ACCESS_KEY_ID,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    },
    // R2 doesn't support the SDK v3 default checksums — disable them
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
    // Use path-style: endpoint/bucket/key instead of bucket.endpoint/key
    // Virtual-hosted-style PUT requests hang on some networks
    forcePathStyle: true,
  });

  return globalForR2.__r2Client_v2;
}

const ALLOWED_PREFIXES = ["deliverables", "attachments", "avatars"] as const;
type StoragePrefix = (typeof ALLOWED_PREFIXES)[number];

/**
 * Generate a presigned URL for uploading a file directly to R2.
 * Returns { key, uploadUrl } — the client uploads to `uploadUrl`,
 * then stores `key` as the deliverable's storageKey.
 */
export async function generateUploadUrl(
  fileName: string,
  mimeType: string,
  prefix: StoragePrefix = "deliverables",
): Promise<{ key: string; uploadUrl: string }> {
  const envPrefix = env.R2_PREFIX ? `${env.R2_PREFIX}/` : "";
  const key = `${envPrefix}${prefix}/${crypto.randomUUID()}-${fileName}`;

  const command = new PutObjectCommand({
    Bucket: env.R2_BUCKET_NAME,
    Key: key,
    ContentType: mimeType,
  });

  try {
    const uploadUrl = await getSignedUrl(getS3Client(), command, { expiresIn: 3600 });
    console.info(
      `[r2] Presigned upload URL generated: key="${key}" contentType="${mimeType}" bucket="${env.R2_BUCKET_NAME}" expiresIn=3600`,
    );
    return { key, uploadUrl };
  } catch (err) {
    console.error(
      `[r2] Failed to generate presigned upload URL: key="${key}" contentType="${mimeType}" bucket="${env.R2_BUCKET_NAME}"`,
      err,
    );
    throw err;
  }
}

/**
 * Generate a presigned URL for downloading/viewing a file from R2.
 */
export async function generateDownloadUrl(key: string): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: env.R2_BUCKET_NAME,
    Key: key,
  });

  try {
    const url = await getSignedUrl(getS3Client(), command, { expiresIn: 3600 });
    return url;
  } catch (err) {
    console.error(
      `[r2] Failed to generate presigned download URL: key="${key}" bucket="${env.R2_BUCKET_NAME}"`,
      err,
    );
    throw err;
  }
}

/**
 * Upload a file buffer to R2 server-side.
 */
export async function uploadFileToR2(
  fileName: string,
  mimeType: string,
  body: Buffer,
  prefix: StoragePrefix = "deliverables",
): Promise<string> {
  const envPrefix = env.R2_PREFIX ? `${env.R2_PREFIX}/` : "";
  const key = `${envPrefix}${prefix}/${crypto.randomUUID()}-${fileName}`;

  try {
    await getS3Client().send(
      new PutObjectCommand({
        Bucket: env.R2_BUCKET_NAME,
        Key: key,
        Body: body,
        ContentType: mimeType,
        ContentLength: body.length,
      }),
    );
    console.info(
      `[r2] Server-side upload succeeded: key="${key}" size=${body.length} contentType="${mimeType}"`,
    );
    return key;
  } catch (err: unknown) {
    const s3Err = err as { $metadata?: { httpStatusCode?: number }; Code?: string; name?: string };
    console.error(
      `[r2] Server-side upload FAILED: key="${key}" size=${body.length} contentType="${mimeType}" ` +
        `bucket="${env.R2_BUCKET_NAME}" status=${s3Err.$metadata?.httpStatusCode ?? "?"} ` +
        `code="${s3Err.Code ?? s3Err.name ?? "unknown"}"`,
      err,
    );
    throw err;
  }
}

/**
 * Delete a file from R2 by its storage key.
 */
export async function deleteFile(key: string): Promise<void> {
  const envPrefix = env.R2_PREFIX ? `${env.R2_PREFIX}/` : "";
  const valid = ALLOWED_PREFIXES.some((p) => key.startsWith(`${envPrefix}${p}/`));
  if (!valid) {
    throw new Error("Invalid storage key");
  }

  const command = new DeleteObjectCommand({
    Bucket: env.R2_BUCKET_NAME,
    Key: key,
  });

  try {
    await getS3Client().send(command);
    console.info(`[r2] Deleted: key="${key}"`);
  } catch (err: unknown) {
    const s3Err = err as { $metadata?: { httpStatusCode?: number }; Code?: string; name?: string };
    console.error(
      `[r2] Delete FAILED: key="${key}" bucket="${env.R2_BUCKET_NAME}" ` +
        `status=${s3Err.$metadata?.httpStatusCode ?? "?"} code="${s3Err.Code ?? s3Err.name ?? "unknown"}"`,
      err,
    );
    throw err;
  }
}

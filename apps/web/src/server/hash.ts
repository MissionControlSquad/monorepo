import { createHash } from "node:crypto";

/** Hex-encoded SHA-256 of a UTF-8 string. Used for content/provenance hashing. */
export function sha256Hex(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

/**
 * Secrets vault crypto (Epic #5). Reuses the EXACT AES-256-GCM envelope shipping in ssh-keys.ts
 * (`iv:authTag:ciphertext`, key = sha256(masterKey)) — authenticated, battle-tested for
 * CloudVM.sshPrivateKey — under a dedicated master key. No new crypto.
 *
 * Plaintext exists only transiently in memory on encrypt/decrypt; it is NEVER persisted or logged.
 */
import { encryptPrivateKey, decryptPrivateKey } from "./ssh-keys";

const DEV_FALLBACK_KEY = "dev-insecure-secret-master-key-change-me-please";

/**
 * Resolve the vault master key. Fail-closed in production (must be a real, high-entropy value);
 * dev/test fall back to a fixed insecure key so the vault is usable without extra setup.
 */
export function getSecretMasterKey(): string {
  const key = process.env.SECRET_ENCRYPTION_KEY;
  if (key && key.length >= 16) return key;
  if (process.env.NODE_ENV === "production") {
    throw new Error("SECRET_ENCRYPTION_KEY must be set (>=32 chars) in production");
  }
  return key || DEV_FALLBACK_KEY;
}

/** Encrypt a plaintext secret value → "iv:authTag:ciphertext" (hex, AES-256-GCM). */
export function encryptSecret(plaintext: string, masterKey: string = getSecretMasterKey()): string {
  return encryptPrivateKey(plaintext, masterKey);
}

/** Decrypt a vault ciphertext. Throws on tampering (GCM auth tag) or wrong key. */
export function decryptSecret(
  ciphertext: string,
  masterKey: string = getSecretMasterKey(),
): string {
  return decryptPrivateKey(ciphertext, masterKey);
}

/** The keyId stored alongside a version, so a future master-key/KMS rotation can be targeted. */
export const CURRENT_KEY_ID = "env";

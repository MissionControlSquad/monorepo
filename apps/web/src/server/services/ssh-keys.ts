import {
  generateKeyPairSync,
  createPublicKey,
  createHash,
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "crypto";

/**
 * Generate an RSA 4096 SSH key pair for VM provisioning.
 * RSA is used over Ed25519 because the ssh2 library cannot parse
 * Ed25519 PKCS8 PEM keys, and Node.js crypto doesn't export OpenSSH format.
 *
 * Returns OpenSSH-format public key and PEM private key (PKCS1, ssh2-compatible).
 */
export function generateSSHKeyPair(): { publicKey: string; privateKey: string } {
  const { publicKey, privateKey } = generateKeyPairSync("rsa", {
    modulusLength: 4096,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs1", format: "pem" },
  });

  // Convert PEM public key to OpenSSH format for Hetzner
  const pubKeyObj = createPublicKey(publicKey);
  const derBuf = pubKeyObj.export({ type: "spki", format: "der" }) as Buffer;
  const opensshPub = `ssh-rsa ${derToOpenSSHRSA(derBuf)} agentcenter-vm`;

  return { publicKey: opensshPub, privateKey };
}

/**
 * Convert a DER-encoded RSA SPKI public key to the OpenSSH wire format base64.
 * OpenSSH wire format for RSA: string "ssh-rsa" + mpint e + mpint n
 */
function derToOpenSSHRSA(derBuf: Buffer): string {
  // Parse the RSA public key from DER to get e and n
  // Re-export as JWK to get the components cleanly
  const pubKey = createPublicKey({ key: derBuf, format: "der", type: "spki" });
  const jwk = pubKey.export({ format: "jwk" }) as { e: string; n: string };

  const e = Buffer.from(jwk.e, "base64url");
  const n = Buffer.from(jwk.n, "base64url");

  // Build OpenSSH wire format
  const typeStr = "ssh-rsa";
  const parts = [wireString(typeStr), wireMpint(e), wireMpint(n)];

  return Buffer.concat(parts).toString("base64");
}

/** Encode a string in SSH wire format: uint32 length + bytes */
function wireString(s: string): Buffer {
  const buf = Buffer.from(s, "utf8");
  const len = Buffer.alloc(4);
  len.writeUInt32BE(buf.length, 0);
  return Buffer.concat([len, buf]);
}

/** Encode a positive integer in SSH mpint format: uint32 length + bytes (with leading 0x00 if high bit set) */
function wireMpint(buf: Buffer): Buffer {
  // Strip leading zeros
  let start = 0;
  while (start < buf.length - 1 && buf[start] === 0) start++;
  buf = buf.subarray(start);

  // Add leading 0x00 if the high bit is set (mpint is always positive)
  const needsPad = buf[0] & 0x80;
  const len = Buffer.alloc(4);
  len.writeUInt32BE(buf.length + (needsPad ? 1 : 0), 0);

  if (needsPad) {
    return Buffer.concat([len, Buffer.from([0x00]), buf]);
  }
  return Buffer.concat([len, buf]);
}

/**
 * Encrypt a private key using AES-256-GCM.
 * Returns "iv:authTag:ciphertext" in hex.
 */
export function encryptPrivateKey(key: string, secret: string): string {
  const encKey = createHash("sha256").update(secret).digest();
  const iv = randomBytes(16);
  const cipher = createCipheriv("aes-256-gcm", encKey, iv);

  let encrypted = cipher.update(key, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag().toString("hex");

  return `${iv.toString("hex")}:${authTag}:${encrypted}`;
}

/**
 * Decrypt a private key encrypted with encryptPrivateKey.
 */
export function decryptPrivateKey(encrypted: string, secret: string): string {
  const [ivHex, authTagHex, ciphertext] = encrypted.split(":");
  const encKey = createHash("sha256").update(secret).digest();
  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");

  const decipher = createDecipheriv("aes-256-gcm", encKey, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(ciphertext, "hex", "utf8");
  decrypted += decipher.final("utf8");

  return decrypted;
}

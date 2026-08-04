import { describe, it, expect } from "vitest";
import {
  generateSSHKeyPair,
  encryptPrivateKey,
  decryptPrivateKey,
} from "../../src/server/services/ssh-keys";

// Gap-fill: ssh-keys.ts hand-rolls the OpenSSH RSA wire encoding (DER → "ssh-rsa" e/n mpints) and
// AES-256-GCM at-rest encryption for provisioning keys — risky, crypto-adjacent, and previously
// unasserted. These lock the wire format + the encrypt/decrypt roundtrip + tamper-detection.

/** Read one SSH wire string (uint32-BE length + bytes) at offset; returns [value, nextOffset]. */
function readWireString(buf: Buffer, offset: number): [Buffer, number] {
  const len = buf.readUInt32BE(offset);
  const start = offset + 4;
  return [buf.subarray(start, start + len), start + len];
}

describe("generateSSHKeyPair", () => {
  it("emits an OpenSSH ssh-rsa public key and a PKCS1 PEM private key", () => {
    const { publicKey, privateKey } = generateSSHKeyPair();

    expect(publicKey.startsWith("ssh-rsa ")).toBe(true);
    expect(publicKey.trimEnd().endsWith("agentcenter-vm")).toBe(true);
    // PKCS1 PEM (ssh2-compatible) — NOT the PKCS8 "BEGIN PRIVATE KEY" header.
    expect(privateKey).toContain("BEGIN RSA PRIVATE KEY");
  });

  it("encodes a valid OpenSSH wire blob whose first field is the 'ssh-rsa' type tag", () => {
    const { publicKey } = generateSSHKeyPair();
    const b64 = publicKey.split(" ")[1];
    const wire = Buffer.from(b64, "base64");

    const [typeTag, afterType] = readWireString(wire, 0);
    expect(typeTag.toString("utf8")).toBe("ssh-rsa");

    // Followed by two mpints (public exponent e, modulus n) — both present and non-empty.
    const [e, afterE] = readWireString(wire, afterType);
    const [n] = readWireString(wire, afterE);
    expect(e.length).toBeGreaterThan(0);
    // 4096-bit modulus ≈ 512 bytes (+ optional 0x00 sign pad).
    expect(n.length).toBeGreaterThanOrEqual(512);
  });

  it("produces a fresh key pair each call", () => {
    expect(generateSSHKeyPair().privateKey).not.toBe(generateSSHKeyPair().privateKey);
  });
});

describe("encryptPrivateKey / decryptPrivateKey", () => {
  const secret = "workspace-vault-secret";
  const plaintext = "-----BEGIN RSA PRIVATE KEY-----\nMIIsecret\n-----END RSA PRIVATE KEY-----";

  it("round-trips through iv:authTag:ciphertext", () => {
    const enc = encryptPrivateKey(plaintext, secret);
    const parts = enc.split(":");
    expect(parts).toHaveLength(3);
    expect(parts.every((p) => /^[0-9a-f]+$/.test(p))).toBe(true); // all hex
    expect(decryptPrivateKey(enc, secret)).toBe(plaintext);
  });

  it("uses a random IV so ciphertext differs across encryptions of the same input", () => {
    expect(encryptPrivateKey(plaintext, secret)).not.toBe(encryptPrivateKey(plaintext, secret));
  });

  it("fails the GCM auth tag when decrypted with the wrong secret", () => {
    const enc = encryptPrivateKey(plaintext, secret);
    expect(() => decryptPrivateKey(enc, "the-wrong-secret")).toThrow();
  });
});

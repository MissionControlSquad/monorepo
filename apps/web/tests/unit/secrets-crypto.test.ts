import { describe, it, expect } from "vitest";
import { encryptSecret, decryptSecret } from "@/server/services/secrets-crypto";
import { mergeEnvBindings } from "@/server/services/secrets";

const KEY = "unit-test-master-key-32-chars-min-length!!";

describe("secrets crypto (AES-256-GCM envelope)", () => {
  it("round-trips encrypt → decrypt", () => {
    const pt = "sk-super-secret-value-123";
    expect(decryptSecret(encryptSecret(pt, KEY), KEY)).toBe(pt);
  });

  it("emits iv:authTag:ciphertext (3 hex segments)", () => {
    const parts = encryptSecret("x", KEY).split(":");
    expect(parts).toHaveLength(3);
    for (const p of parts) expect(p).toMatch(/^[0-9a-f]+$/);
  });

  it("uses a random IV — same plaintext encrypts differently each time", () => {
    expect(encryptSecret("same", KEY)).not.toBe(encryptSecret("same", KEY));
  });

  it("throws on a tampered auth tag (GCM integrity)", () => {
    const [iv, tag, ct] = encryptSecret("value", KEY).split(":");
    const flipped = tag.slice(0, -2) + (tag.slice(-2) === "00" ? "11" : "00");
    expect(() => decryptSecret(`${iv}:${flipped}:${ct}`, KEY)).toThrow();
  });

  it("throws on tampered ciphertext", () => {
    const [iv, tag, ct] = encryptSecret("value", KEY).split(":");
    const flipped = ct.slice(0, -2) + (ct.slice(-2) === "00" ? "11" : "00");
    expect(() => decryptSecret(`${iv}:${tag}:${flipped}`, KEY)).toThrow();
  });

  it("throws when decrypted with the wrong key", () => {
    expect(() =>
      decryptSecret(encryptSecret("v", KEY), "a-different-key-of-sufficient-length!!"),
    ).toThrow();
  });
});

describe("mergeEnvBindings precedence", () => {
  it("agent-scoped bindings override adapter-scoped on the same env var", () => {
    const merged = mergeEnvBindings([
      { envVarName: "API_KEY", value: "adapter-val", scope: "adapter" },
      { envVarName: "API_KEY", value: "agent-val", scope: "agent" },
      { envVarName: "OTHER", value: "only-adapter", scope: "adapter" },
    ]);
    expect(merged).toEqual({ API_KEY: "agent-val", OTHER: "only-adapter" });
  });
});

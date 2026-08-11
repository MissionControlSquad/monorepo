import { describe, it, expect } from "vitest";
import { createHmac } from "node:crypto";
import {
  verifyWebhookSignature,
  webhookSecretName,
} from "../../src/server/services/plugin-webhooks";

// §3 plugins — pure HMAC signature verification for inbound webhooks (fail-closed).

const SECRET = "whsec_test_123";
const BODY = JSON.stringify({ event: "ping", n: 7 });
const sig = (body: string, secret = SECRET) =>
  createHmac("sha256", secret).update(body, "utf8").digest("hex");

describe("verifyWebhookSignature", () => {
  it("accepts a correct signature (bare hex and sha256= prefixed)", () => {
    expect(verifyWebhookSignature(SECRET, BODY, sig(BODY))).toBe(true);
    expect(verifyWebhookSignature(SECRET, BODY, `sha256=${sig(BODY)}`)).toBe(true);
  });

  it("rejects a tampered body (fail-closed)", () => {
    expect(verifyWebhookSignature(SECRET, BODY + " ", sig(BODY))).toBe(false);
  });

  it("rejects a wrong secret", () => {
    expect(verifyWebhookSignature("other-secret", BODY, sig(BODY))).toBe(false);
  });

  it("rejects a missing/empty signature or secret", () => {
    expect(verifyWebhookSignature(SECRET, BODY, null)).toBe(false);
    expect(verifyWebhookSignature(SECRET, BODY, "")).toBe(false);
    expect(verifyWebhookSignature("", BODY, sig(BODY))).toBe(false);
  });

  it("rejects a malformed (non-hex / wrong-length) signature without throwing", () => {
    expect(verifyWebhookSignature(SECRET, BODY, "not-hex")).toBe(false);
    expect(verifyWebhookSignature(SECRET, BODY, "deadbeef")).toBe(false);
  });
});

describe("webhookSecretName", () => {
  it("defaults to a per-plugin conventional name", () => {
    expect(webhookSecretName("acme", "inbound")).toBe("plugin.acme.webhook.inbound");
  });
  it("honors a manifest-declared secretName override", () => {
    expect(webhookSecretName("acme", "inbound", { hook: "inbound", secretName: "ACME_WH" })).toBe(
      "ACME_WH",
    );
  });
});

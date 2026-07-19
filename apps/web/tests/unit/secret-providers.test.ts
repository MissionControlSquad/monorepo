import { describe, it, expect } from "vitest";
import {
  getSecretProviderModule,
  validateSecretProviderConfig,
  checkSecretProviderConfigHealth,
} from "@agentcenter/utils";

describe("secret provider modules (Domain 7 P2)", () => {
  it("env is implemented + always healthy with no config", () => {
    const mod = getSecretProviderModule("env");
    expect(mod?.implemented).toBe(true);
    expect(validateSecretProviderConfig("env", {})).toMatchObject({ ok: true });
    expect(checkSecretProviderConfigHealth("env", {})).toMatchObject({
      healthy: true,
      error: null,
    });
  });

  it("aws/vault validate required config and report coming_soon health", () => {
    expect(validateSecretProviderConfig("aws", {})).toMatchObject({ ok: false });
    expect(validateSecretProviderConfig("aws", { region: "us-east-1" })).toMatchObject({
      ok: true,
    });
    const awsHealth = checkSecretProviderConfigHealth("aws", { region: "us-east-1" });
    expect(awsHealth.healthy).toBe(false);
    expect(awsHealth.error).toMatch(/coming soon/i);

    expect(validateSecretProviderConfig("vault", { address: "x" })).toMatchObject({ ok: false });
    expect(validateSecretProviderConfig("vault", { address: "x", path: "kv" })).toMatchObject({
      ok: true,
    });
    expect(getSecretProviderModule("aws")?.implemented).toBe(false);
  });

  it("an unknown kind is invalid + unhealthy", () => {
    expect(validateSecretProviderConfig("nope", {})).toMatchObject({ ok: false });
    expect(checkSecretProviderConfigHealth("nope", {})).toMatchObject({ healthy: false });
  });
});

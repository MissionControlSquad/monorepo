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

  it("aws/vault are implemented, validate required config, and are healthy once configured", () => {
    expect(validateSecretProviderConfig("aws", {})).toMatchObject({ ok: false });
    expect(validateSecretProviderConfig("aws", { region: "us-east-1" })).toMatchObject({
      ok: true,
    });
    const awsHealth = checkSecretProviderConfigHealth("aws", { region: "us-east-1" });
    expect(awsHealth.healthy).toBe(true);
    expect(awsHealth.error).toBeNull();

    expect(validateSecretProviderConfig("vault", { address: "x" })).toMatchObject({ ok: false });
    expect(validateSecretProviderConfig("vault", { address: "x", path: "kv" })).toMatchObject({
      ok: true,
    });
    expect(getSecretProviderModule("aws")?.implemented).toBe(true);
    expect(getSecretProviderModule("vault")?.implemented).toBe(true);
  });

  it("rejects inline (non-secretRef) credentials in provider config", () => {
    expect(
      validateSecretProviderConfig("aws", { region: "us-east-1", secretAccessKey: "AKIAINLINE" }),
    ).toMatchObject({ ok: false });
    expect(
      validateSecretProviderConfig("vault", { address: "x", path: "kv", token: "s.rawtoken" }),
    ).toMatchObject({ ok: false });
  });

  it("an unknown kind is invalid + unhealthy", () => {
    expect(validateSecretProviderConfig("nope", {})).toMatchObject({ ok: false });
    expect(checkSecretProviderConfigHealth("nope", {})).toMatchObject({ healthy: false });
  });
});

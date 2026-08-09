import { describe, it, expect } from "vitest";
import { parseJsonSchema, validateJsonSchemaForm } from "@agentcenter/utils";
import { selectPrimaryProjectWorkspace } from "@/lib/work-detail";
import {
  HERMES_GATEWAY_CONFIG_SCHEMA,
  hermesGatewaySecretRefName,
} from "@/server/adapters/hermes-gateway";

// ── Feature 1: ProjectWorkspace selection ────────────────────────────────────
describe("selectPrimaryProjectWorkspace", () => {
  const ws = (over: Partial<{ id: string; isPrimary: boolean; createdAt: string }>) => ({
    id: "w",
    isPrimary: false,
    createdAt: "2024-01-01T00:00:00Z",
    ...over,
  });

  it("returns null for empty / missing lists", () => {
    expect(selectPrimaryProjectWorkspace([])).toBeNull();
    expect(selectPrimaryProjectWorkspace(undefined)).toBeNull();
    expect(selectPrimaryProjectWorkspace(null)).toBeNull();
  });

  it("prefers the primary workspace regardless of order", () => {
    const list = [
      ws({ id: "a", isPrimary: false, createdAt: "2024-01-01T00:00:00Z" }),
      ws({ id: "b", isPrimary: true, createdAt: "2024-06-01T00:00:00Z" }),
    ];
    expect(selectPrimaryProjectWorkspace(list)?.id).toBe("b");
  });

  it("falls back to the oldest workspace when none is primary", () => {
    const list = [
      ws({ id: "new", createdAt: "2024-09-01T00:00:00Z" }),
      ws({ id: "old", createdAt: "2024-01-01T00:00:00Z" }),
    ];
    expect(selectPrimaryProjectWorkspace(list)?.id).toBe("old");
  });

  it("does not mutate the input list", () => {
    const list = [ws({ id: "a" }), ws({ id: "b", isPrimary: true })];
    const snapshot = list.map((w) => w.id);
    selectPrimaryProjectWorkspace(list);
    expect(list.map((w) => w.id)).toEqual(snapshot);
  });
});

// ── Feature 2: Hermes gateway adapter config schema derivation ────────────────
describe("HERMES_GATEWAY_CONFIG_SCHEMA derivation", () => {
  const fields = parseJsonSchema(HERMES_GATEWAY_CONFIG_SCHEMA);
  const byKey = Object.fromEntries(fields.map((f) => [f.key, f]));

  it("renders apiBaseUrl as a required plain string input", () => {
    const f = byKey.apiBaseUrl;
    expect(f.type).toBe("string");
    expect(f.required).toBe(true);
    expect(f.secret).toBe(false);
    expect(f.secretRef).toBe(false);
  });

  it("binds apiKeySecretRef via the secret-ref input, not a masked free-text field", () => {
    const f = byKey.apiKeySecretRef;
    expect(f.required).toBe(true);
    expect(f.secretRef).toBe(true);
    // Must NOT be a masked secret input even though the key matches /secret|key/.
    expect(f.secret).toBe(false);
  });

  it("derives the optional tuning fields", () => {
    expect(byKey.sessionKeyStrategy.type).toBe("enum");
    expect(byKey.sessionKeyStrategy.enumValues).toEqual(["issue", "agent", "run", "none"]);
    expect(byKey.timeoutSec.type).toBe("number");
    expect(byKey.dangerouslyAllowInsecureRemoteHttp.type).toBe("boolean");
  });

  it("requires apiBaseUrl + a bound secret-ref, and passes once both are set", () => {
    expect(
      validateJsonSchemaForm(HERMES_GATEWAY_CONFIG_SCHEMA, {})
        .map((e) => e.key)
        .sort(),
    ).toEqual(["apiBaseUrl", "apiKeySecretRef"]);
    const ok = validateJsonSchemaForm(HERMES_GATEWAY_CONFIG_SCHEMA, {
      apiBaseUrl: "https://hermes.internal/api",
      apiKeySecretRef: { secretRef: { name: "hermes-key" } },
    });
    expect(ok).toEqual([]);
  });
});

describe("hermesGatewaySecretRefName", () => {
  it("reads the name from a { secretRef: { name } } vault pointer", () => {
    expect(hermesGatewaySecretRefName({ secretRef: { name: "hermes-key" } })).toBe("hermes-key");
  });

  it("accepts a bare string name for back-compat and trims it", () => {
    expect(hermesGatewaySecretRefName("  legacy-name  ")).toBe("legacy-name");
  });

  it("returns null for empty / malformed values", () => {
    expect(hermesGatewaySecretRefName("")).toBeNull();
    expect(hermesGatewaySecretRefName("   ")).toBeNull();
    expect(hermesGatewaySecretRefName(null)).toBeNull();
    expect(hermesGatewaySecretRefName({ secretRef: {} })).toBeNull();
    expect(hermesGatewaySecretRefName({ secretRef: { name: "" } })).toBeNull();
  });
});

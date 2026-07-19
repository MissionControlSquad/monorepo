import { describe, it, expect } from "vitest";
import { validateAdapterConfig } from "@/server/adapters/registry";

const CLAUDE_SCHEMA = {
  $schema: "http://json-schema.org/draft-07/schema#",
  type: "object",
  properties: { model: { type: "string" }, maxTurnsPerRun: { type: "number" } },
};

describe("validateAdapterConfig", () => {
  it("accepts a schema-valid config", () => {
    expect(validateAdapterConfig(CLAUDE_SCHEMA, { model: "claude-opus-4-8" })).toEqual({
      valid: true,
      errors: [],
    });
  });

  it("accepts an empty config when nothing is required", () => {
    expect(validateAdapterConfig(CLAUDE_SCHEMA, {}).valid).toBe(true);
  });

  it("rejects a wrong-typed field", () => {
    const r = validateAdapterConfig(CLAUDE_SCHEMA, { model: 123 });
    expect(r.valid).toBe(false);
    expect(r.errors.length).toBeGreaterThan(0);
  });

  it("rejects an unknown extra field (additionalProperties forced false)", () => {
    const r = validateAdapterConfig(CLAUDE_SCHEMA, { model: "x", bogus: 1 });
    expect(r.valid).toBe(false);
  });

  it("enforces required fields (openclaw-gateway needs agentCenterUrl + token)", () => {
    const openclaw = {
      type: "object",
      required: ["agentCenterUrl", "token"],
      properties: { agentCenterUrl: { type: "string" }, token: { type: "string" } },
    };
    expect(validateAdapterConfig(openclaw, { agentCenterUrl: "wss://x", token: "t" }).valid).toBe(
      true,
    );
    expect(validateAdapterConfig(openclaw, { agentCenterUrl: "wss://x" }).valid).toBe(false);
  });
});

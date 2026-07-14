import { describe, it, expect } from "vitest";
import { adapterConfigFields } from "@agentcenter/utils";

describe("adapterConfigFields (Epic #2)", () => {
  it("returns [] for missing / non-object / property-less schemas", () => {
    expect(adapterConfigFields(null)).toEqual([]);
    expect(adapterConfigFields("nope")).toEqual([]);
    expect(adapterConfigFields({})).toEqual([]);
    expect(adapterConfigFields({ type: "object" })).toEqual([]);
  });

  it("derives typed fields, required flags, defaults and descriptions", () => {
    const fields = adapterConfigFields({
      type: "object",
      required: ["token"],
      properties: {
        token: { type: "string", description: "API token" },
        maxTokens: { type: "integer", default: 4096 },
        streaming: { type: "boolean", default: true },
        model: { enum: ["a", "b"], default: "a", title: "Model" },
      },
    });
    const byKey = Object.fromEntries(fields.map((f) => [f.key, f]));

    expect(byKey.token).toMatchObject({ type: "string", required: true, description: "API token" });
    expect(byKey.maxTokens).toMatchObject({ type: "number", required: false, default: 4096 });
    expect(byKey.streaming).toMatchObject({ type: "boolean", default: true });
    expect(byKey.model).toMatchObject({
      type: "enum",
      enumValues: ["a", "b"],
      default: "a",
      label: "Model",
    });
  });

  it("marks token/secret/key/password fields (and writeOnly/format:password) as secret", () => {
    const fields = adapterConfigFields({
      properties: {
        apiKey: { type: "string" },
        password: { type: "string" },
        note: { type: "string" },
        hidden: { type: "string", writeOnly: true },
        pin: { type: "string", format: "password" },
      },
    });
    const byKey = Object.fromEntries(fields.map((f) => [f.key, f]));
    expect(byKey.apiKey.secret).toBe(true);
    expect(byKey.password.secret).toBe(true);
    expect(byKey.hidden.secret).toBe(true);
    expect(byKey.pin.secret).toBe(true);
    expect(byKey.note.secret).toBe(false);
  });

  it("ignores malformed property entries and empty enums", () => {
    const fields = adapterConfigFields({
      properties: { good: { type: "string" }, bad: null, emptyEnum: { enum: [] } },
    });
    expect(fields.map((f) => f.key).sort()).toEqual(["emptyEnum", "good"]);
    // empty enum falls back to string, not enum
    expect(fields.find((f) => f.key === "emptyEnum")?.type).toBe("string");
  });
});

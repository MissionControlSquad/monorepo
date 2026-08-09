import { describe, it, expect } from "vitest";
import {
  parseJsonSchema,
  validateJsonSchemaForm,
  applyJsonSchemaDefaults,
} from "@agentcenter/utils";

describe("parseJsonSchema (keystone #3)", () => {
  it("returns [] for missing / non-object / property-less schemas", () => {
    expect(parseJsonSchema(null)).toEqual([]);
    expect(parseJsonSchema("nope")).toEqual([]);
    expect(parseJsonSchema([])).toEqual([]);
    expect(parseJsonSchema({})).toEqual([]);
    expect(parseJsonSchema({ type: "object" })).toEqual([]);
  });

  it("derives typed fields with required flags, defaults, descriptions and constraints", () => {
    const fields = parseJsonSchema({
      type: "object",
      required: ["host"],
      properties: {
        host: { type: "string", description: "Hostname", minLength: 1, maxLength: 253 },
        port: { type: "integer", default: 22, minimum: 1, maximum: 65535 },
        streaming: { type: "boolean", default: true },
        mode: { enum: ["fast", "slow"], default: "fast", title: "Mode" },
      },
    });
    const byKey = Object.fromEntries(fields.map((f) => [f.key, f]));
    expect(byKey.host).toMatchObject({
      type: "string",
      required: true,
      minLength: 1,
      maxLength: 253,
    });
    expect(byKey.port).toMatchObject({ type: "number", default: 22, min: 1, max: 65535 });
    expect(byKey.streaming).toMatchObject({ type: "boolean", default: true });
    expect(byKey.mode).toMatchObject({ type: "enum", enumValues: ["fast", "slow"], label: "Mode" });
  });

  it("marks secret fields and distinguishes secretRef vault pointers", () => {
    const fields = parseJsonSchema({
      properties: {
        apiKey: { type: "string" },
        note: { type: "string" },
        sshKey: { type: "string", format: "secret-ref" },
        dbPass: { type: "string", "x-secret-ref": true },
      },
    });
    const byKey = Object.fromEntries(fields.map((f) => [f.key, f]));
    expect(byKey.apiKey).toMatchObject({ secret: true, secretRef: false });
    expect(byKey.note).toMatchObject({ secret: false, secretRef: false });
    // a secretRef field is NOT also flagged secret (it renders a binding, not a masked value)
    expect(byKey.sshKey).toMatchObject({ secret: false, secretRef: true });
    expect(byKey.dbPass).toMatchObject({ secret: false, secretRef: true });
  });
});

describe("validateJsonSchemaForm", () => {
  const schema = {
    type: "object",
    required: ["host", "creds"],
    properties: {
      host: { type: "string", minLength: 3, pattern: "^[a-z]" },
      port: { type: "integer", minimum: 1, maximum: 65535 },
      mode: { enum: ["fast", "slow"] },
      creds: { type: "string", format: "secret-ref" },
    },
  };

  it("returns [] for a valid values object", () => {
    expect(
      validateJsonSchemaForm(schema, {
        host: "abc",
        port: 22,
        mode: "fast",
        creds: { secretRef: { name: "ssh-key" } },
      }),
    ).toEqual([]);
  });

  it("flags missing required fields (including an unbound secretRef)", () => {
    const errs = validateJsonSchemaForm(schema, { port: 22 });
    const keys = errs.map((e) => e.key).sort();
    expect(keys).toEqual(["creds", "host"]);
  });

  it("enforces numeric min/max, length, pattern and enum membership", () => {
    expect(
      validateJsonSchemaForm(schema, { host: "ab", creds: { secretRef: { name: "x" } } }),
    ).toEqual([{ key: "host", message: expect.stringContaining("at least 3") }]);

    expect(
      validateJsonSchemaForm(schema, {
        host: "9bad",
        creds: { secretRef: { name: "x" } },
      }).some((e) => e.key === "host" && /format/.test(e.message)),
    ).toBe(true);

    expect(
      validateJsonSchemaForm(schema, {
        host: "abc",
        port: 70000,
        creds: { secretRef: { name: "x" } },
      }).some((e) => e.key === "port"),
    ).toBe(true);

    expect(
      validateJsonSchemaForm(schema, {
        host: "abc",
        mode: "nope",
        creds: { secretRef: { name: "x" } },
      }).some((e) => e.key === "mode"),
    ).toBe(true);
  });

  it("does not validate absent optional fields", () => {
    expect(
      validateJsonSchemaForm(schema, { host: "abc", creds: { secretRef: { name: "x" } } }),
    ).toEqual([]);
  });
});

describe("applyJsonSchemaDefaults", () => {
  it("fills declared defaults only where absent, never for secretRef", () => {
    const schema = {
      properties: {
        port: { type: "integer", default: 22 },
        streaming: { type: "boolean", default: true },
        creds: { type: "string", format: "secret-ref", default: "nope" },
      },
    };
    expect(applyJsonSchemaDefaults(schema, { port: 2222 })).toEqual({
      port: 2222,
      streaming: true,
    });
  });
});

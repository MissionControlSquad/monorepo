import { describe, it, expect } from "vitest";
import { discoverSecretRefFields, discoverSecretRefPaths } from "@agentcenter/utils";

/**
 * Secret-ref discovery (parity §3 secrets depth). Pure: walks a JSON Schema and returns the dotted
 * paths of every field marked with the repo's vault-pointer convention (`format:"secret-ref"` or
 * `x-secret-ref:true`) — so a config screen can auto-offer a binding for each. No DB, no I/O.
 */
describe("discoverSecretRefFields", () => {
  it("finds secret-ref fields nested through objects and arrays, with correct dotted paths", () => {
    const schema = {
      type: "object",
      required: ["auth"],
      properties: {
        endpoint: { type: "string" }, // not a secret-ref
        auth: {
          type: "object",
          required: ["token"],
          properties: {
            token: { type: "string", format: "secret-ref", title: "API token" },
            fallback: { type: "string", "x-secret-ref": true },
          },
        },
        hooks: {
          type: "array",
          items: {
            type: "object",
            properties: {
              url: { type: "string" },
              secret: { type: "string", format: "secret-ref" },
            },
          },
        },
      },
    };

    const paths = discoverSecretRefPaths(schema);
    expect(paths).toEqual(["auth.token", "auth.fallback", "hooks[].secret"]);

    // Full field info carries hints + the required flag from the OWNING object's required array.
    const fields = discoverSecretRefFields(schema);
    expect(fields).toEqual([
      { path: "auth.token", title: "API token", description: undefined, required: true },
      { path: "auth.fallback", title: undefined, description: undefined, required: false },
      { path: "hooks[].secret", title: undefined, description: undefined, required: false },
    ]);
  });

  it("returns [] for schemas with no secret-ref fields and for invalid input", () => {
    expect(
      discoverSecretRefPaths({ type: "object", properties: { a: { type: "string" } } }),
    ).toEqual([]);
    expect(discoverSecretRefPaths(null)).toEqual([]);
    expect(discoverSecretRefPaths("nope")).toEqual([]);
    expect(discoverSecretRefPaths(undefined)).toEqual([]);
  });

  it("supports tuple-style array items and does not infinitely recurse on a cyclic schema", () => {
    const tuple = {
      type: "object",
      properties: {
        pair: {
          type: "array",
          items: [{ type: "string" }, { type: "string", format: "secret-ref" }],
        },
      },
    };
    expect(discoverSecretRefPaths(tuple)).toEqual(["pair[]"]);

    // Cycle guard: a self-referential node must not loop forever.
    const node: Record<string, unknown> = { type: "object", properties: {} };
    (node.properties as Record<string, unknown>).self = node;
    (node.properties as Record<string, unknown>).key = { type: "string", format: "secret-ref" };
    expect(discoverSecretRefPaths(node)).toContain("key");
  });
});

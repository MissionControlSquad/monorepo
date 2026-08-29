import { describe, it, expect } from "vitest";
import {
  PLUGIN_UI_PROTOCOL_VERSION,
  OPAQUE_ORIGIN,
  isTrustedSlotOrigin,
  parsePluginToHost,
  parseHostToPlugin,
  hostContext,
  hostActionResult,
} from "@agentcenter/utils";

// §3 plugins — the sandboxed-iframe postMessage bridge. Pure protocol guards; no DOM.

const V = PLUGIN_UI_PROTOCOL_VERSION;

describe("isTrustedSlotOrigin (origin check)", () => {
  it("accepts the opaque origin a sandboxed frame reports", () => {
    expect(isTrustedSlotOrigin(OPAQUE_ORIGIN)).toBe(true);
    expect(isTrustedSlotOrigin("null")).toBe(true);
  });
  it("accepts an explicitly allowed origin", () => {
    expect(isTrustedSlotOrigin("https://app.example", ["https://app.example"])).toBe(true);
  });
  it("rejects any other origin — never a wildcard", () => {
    expect(isTrustedSlotOrigin("https://evil.example")).toBe(false);
    expect(isTrustedSlotOrigin("https://evil.example", ["https://app.example"])).toBe(false);
    expect(isTrustedSlotOrigin("*")).toBe(false);
    expect(isTrustedSlotOrigin("")).toBe(false);
  });
});

describe("parsePluginToHost (plugin → host)", () => {
  it("parses ready / resize / action-request", () => {
    expect(parsePluginToHost({ type: "plugin:ready", version: V })).toEqual({
      type: "plugin:ready",
      version: V,
    });
    expect(parsePluginToHost({ type: "plugin:resize", version: V, height: 240 })).toEqual({
      type: "plugin:resize",
      version: V,
      height: 240,
    });
    expect(
      parsePluginToHost({
        type: "plugin:action-request",
        version: V,
        requestId: "r1",
        action: "ping",
        payload: { a: 1 },
      }),
    ).toMatchObject({ type: "plugin:action-request", requestId: "r1", action: "ping" });
  });

  it("rejects a wrong protocol version", () => {
    expect(parsePluginToHost({ type: "plugin:ready", version: 999 })).toBeNull();
  });

  it("rejects unknown types and malformed payloads", () => {
    expect(parsePluginToHost({ type: "plugin:evil", version: V })).toBeNull();
    expect(parsePluginToHost({ type: "plugin:resize", version: V, height: -5 })).toBeNull();
    expect(parsePluginToHost({ type: "plugin:resize", version: V, height: "tall" })).toBeNull();
    expect(
      parsePluginToHost({ type: "plugin:action-request", version: V, action: "x" }),
    ).toBeNull();
    expect(parsePluginToHost(null)).toBeNull();
    expect(parsePluginToHost("ready")).toBeNull();
    expect(parsePluginToHost(42)).toBeNull();
  });
});

describe("parseHostToPlugin (host → plugin) + builders", () => {
  it("round-trips a host:context built by the helper", () => {
    const msg = hostContext({ slot: "s", pluginId: "p", workspaceId: "w", theme: "dark" });
    const parsed = parseHostToPlugin(msg);
    expect(parsed).toMatchObject({ type: "host:context", context: { slot: "s", pluginId: "p" } });
  });
  it("round-trips a host:action-result built by the helper", () => {
    const msg = hostActionResult("r1", true, { result: { pong: true } });
    expect(parseHostToPlugin(msg)).toMatchObject({
      type: "host:action-result",
      ok: true,
      requestId: "r1",
    });
  });
  it("rejects a context missing required ids", () => {
    expect(
      parseHostToPlugin({ type: "host:context", version: V, context: { slot: "s" } }),
    ).toBeNull();
    expect(parseHostToPlugin({ type: "host:context", version: 2, context: {} })).toBeNull();
  });
});

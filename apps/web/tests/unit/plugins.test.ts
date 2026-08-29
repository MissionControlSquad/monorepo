import { describe, it, expect } from "vitest";
import { validateManifest, isValidCron } from "@agentcenter/utils";

// Epic #6: pure manifest validation + cron. No DB.

const valid = {
  apiVersion: 1,
  id: "acme-connector",
  version: "1.0.0",
  displayName: "Acme Connector",
  description: "Syncs Acme",
  category: "connector",
  capabilities: ["projects.read", "issues.create"],
  tools: [{ name: "sync", displayName: "Sync", description: "Sync now" }],
  jobs: [{ jobKey: "nightly", displayName: "Nightly", schedule: "0 3 * * *" }],
};

describe("validateManifest", () => {
  it("accepts a well-formed manifest", () => {
    const r = validateManifest(valid);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.manifest.id).toBe("acme-connector");
  });

  it("ignores unknown top-level keys (forward-compat)", () => {
    const r = validateManifest({ ...valid, futureField: { anything: true } });
    expect(r.ok).toBe(true);
  });

  it("rejects a wrong apiVersion", () => {
    const r = validateManifest({ ...valid, apiVersion: 2 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join()).toMatch(/apiVersion/);
  });

  it("rejects a non-slug id", () => {
    const r = validateManifest({ ...valid, id: "Acme Connector!" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join()).toMatch(/id/);
  });

  it("rejects an unknown category", () => {
    const r = validateManifest({ ...valid, category: "wormhole" });
    expect(r.ok).toBe(false);
  });

  it("rejects an unknown capability", () => {
    const r = validateManifest({ ...valid, capabilities: ["projects.read", "root.access"] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join()).toMatch(/capability/);
  });

  it("rejects a malformed tool", () => {
    const r = validateManifest({ ...valid, tools: [{ name: "x" }] });
    expect(r.ok).toBe(false);
  });

  it("rejects a job with a bad cron schedule", () => {
    const r = validateManifest({
      ...valid,
      jobs: [{ jobKey: "j", displayName: "J", schedule: "not a cron" }],
    });
    expect(r.ok).toBe(false);
  });

  it("defaults capabilities to an empty array when omitted", () => {
    const { capabilities, ...noCaps } = valid;
    void capabilities;
    const r = validateManifest(noCaps);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.manifest.capabilities).toEqual([]);
  });
});

// Extensibility residuals (§3) — ui / apiRoutes / webhooks are all additive + optional.
describe("validateManifest — extensibility (ui/apiRoutes/webhooks)", () => {
  it("keeps a legacy manifest (no ui/apiRoutes/webhooks) valid", () => {
    const r = validateManifest(valid);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.manifest.ui).toBeUndefined();
      expect(r.manifest.apiRoutes).toBeUndefined();
      expect(r.manifest.webhooks).toBeUndefined();
    }
  });

  it("accepts a manifest with ui slots, api routes, and webhooks", () => {
    const r = validateManifest({
      ...valid,
      ui: [{ slot: "plugin.detail.panel", entry: "/plugin-slots/echo.html", title: "Panel" }],
      apiRoutes: [
        { path: "/status", method: "GET", capability: "projects.read" },
        { path: "/echo", method: "POST" },
      ],
      webhooks: [{ hook: "inbound", jobKey: "webhook:inbound" }],
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      // method defaults to GET when omitted.
      expect(r.manifest.apiRoutes?.[1].method).toBe("POST");
      expect(r.manifest.ui?.[0].slot).toBe("plugin.detail.panel");
    }
  });

  it("defaults an api route method to GET", () => {
    const r = validateManifest({ ...valid, apiRoutes: [{ path: "/ping" }] });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.manifest.apiRoutes?.[0].method).toBe("GET");
  });

  it("rejects a ui entry that is neither a same-origin path nor https", () => {
    const r = validateManifest({
      ...valid,
      ui: [{ slot: "s", entry: "http://evil.example/x" }],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join()).toMatch(/entry/);
  });

  it("rejects an api route declaring an unknown capability", () => {
    const r = validateManifest({
      ...valid,
      apiRoutes: [{ path: "/x", capability: "root.access" }],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join()).toMatch(/capability/);
  });

  it("rejects a webhook hook that is not a slug", () => {
    const r = validateManifest({ ...valid, webhooks: [{ hook: "Not A Slug" }] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join()).toMatch(/hook/);
  });

  it("rejects a malformed api route path (no leading slash)", () => {
    const r = validateManifest({ ...valid, apiRoutes: [{ path: "status" }] });
    expect(r.ok).toBe(false);
  });
});

describe("isValidCron", () => {
  it("accepts 5-field expressions", () => {
    expect(isValidCron("*/15 * * * *")).toBe(true);
    expect(isValidCron("0 3 * * 1-5")).toBe(true);
    expect(isValidCron("0,30 9-17 * * *")).toBe(true);
  });
  it("rejects wrong field counts and garbage", () => {
    expect(isValidCron("* * * *")).toBe(false);
    expect(isValidCron("* * * * * *")).toBe(false);
    expect(isValidCron("not a cron")).toBe(false);
    expect(isValidCron("")).toBe(false);
  });
});

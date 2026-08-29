import { describe, it, expect } from "vitest";
import {
  evaluateImageAllowlist,
  parseImageAllowlist,
  imageMatchesPattern,
  DEFAULT_IMAGE_ALLOWLIST,
} from "@agentcenter/utils";

// Sandbox security hardening — Item 2. The k8s image allowlist is a PURE glob/registry evaluator the
// provider consults before booting a pod. Allowed image passes; a disallowed one is refused.
describe("k8s image allowlist (Item 2)", () => {
  it("allows an image that matches an allow glob", () => {
    expect(evaluateImageAllowlist(["ubuntu:*"], "ubuntu:22.04").allowed).toBe(true);
    expect(evaluateImageAllowlist(["ghcr.io/*"], "ghcr.io/acme/base:1").allowed).toBe(true);
    expect(evaluateImageAllowlist(["ubuntu:22.04"], "ubuntu:22.04").allowed).toBe(true);
  });

  it("refuses an image outside the allowlist with a readable reason", () => {
    const d = evaluateImageAllowlist(["ubuntu:*"], "evil.io/malware:latest");
    expect(d.allowed).toBe(false);
    expect(d.reason).toMatch(/not on the workspace image allowlist/i);
    expect(d.reason).toContain("evil.io/malware:latest");
  });

  it("deny rules win over allow rules", () => {
    const allowlist = ["*", "!*:latest"]; // allow all but never a floating :latest tag
    expect(evaluateImageAllowlist(allowlist, "ubuntu:22.04").allowed).toBe(true);
    const denied = evaluateImageAllowlist(allowlist, "ubuntu:latest");
    expect(denied.allowed).toBe(false);
    expect(denied.reason).toMatch(/explicitly denied/i);
  });

  it("fails closed when no allow rules are configured", () => {
    expect(evaluateImageAllowlist([], "ubuntu:22.04").allowed).toBe(false);
    expect(evaluateImageAllowlist(["!foo"], "ubuntu:22.04").allowed).toBe(false);
  });

  it("refuses a blank image ref", () => {
    expect(evaluateImageAllowlist(["*"], "   ").allowed).toBe(false);
  });

  it("the default allowlist permits common base images but not an arbitrary registry", () => {
    expect(evaluateImageAllowlist(DEFAULT_IMAGE_ALLOWLIST, "ubuntu:22.04").allowed).toBe(true);
    expect(evaluateImageAllowlist(DEFAULT_IMAGE_ALLOWLIST, "node:20-alpine").allowed).toBe(true);
    expect(evaluateImageAllowlist(DEFAULT_IMAGE_ALLOWLIST, "evil.example.com/x:1").allowed).toBe(
      false,
    );
  });

  it("imageMatchesPattern handles * and ? wildcards", () => {
    expect(imageMatchesPattern("ubuntu:22.04", "ubuntu:*")).toBe(true);
    expect(imageMatchesPattern("ubuntu:22.04", "ubuntu:22.0?")).toBe(true);
    expect(imageMatchesPattern("ubuntu:22.04", "debian:*")).toBe(false);
  });

  it("parseImageAllowlist splits on commas/space/newlines and falls back to the default", () => {
    expect(parseImageAllowlist("ubuntu:*, ghcr.io/*\nnode:*")).toEqual([
      "ubuntu:*",
      "ghcr.io/*",
      "node:*",
    ]);
    expect(parseImageAllowlist(null)).toEqual([...DEFAULT_IMAGE_ALLOWLIST]);
    expect(parseImageAllowlist("   ")).toEqual([...DEFAULT_IMAGE_ALLOWLIST]);
  });
});

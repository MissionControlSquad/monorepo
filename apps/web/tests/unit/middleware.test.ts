import { describe, it, expect } from "vitest";
import { requiresAdminAuth } from "../../middleware";

describe("requiresAdminAuth", () => {
  it("returns false for auth pages", () => {
    expect(requiresAdminAuth("/login")).toBe(false);
    expect(requiresAdminAuth("/setup")).toBe(false);
  });

  it("returns false for the public buildbase billing surfaces", () => {
    // Prospective users (no session) must reach the pricing page and the post-checkout return —
    // gating these to /login would break marketing pricing and 404/deadend a Stripe return.
    expect(requiresAdminAuth("/pricing")).toBe(false);
    expect(requiresAdminAuth("/billing")).toBe(false);
  });

  it("returns false for auth API", () => {
    expect(requiresAdminAuth("/api/auth/login")).toBe(false);
    expect(requiresAdminAuth("/api/auth/setup")).toBe(false);
    expect(requiresAdminAuth("/api/auth/logout")).toBe(false);
  });

  it("returns false for static assets", () => {
    expect(requiresAdminAuth("/_next/static/chunk.js")).toBe(false);
    expect(requiresAdminAuth("/favicon.ico")).toBe(false);
    expect(requiresAdminAuth("/logo.png")).toBe(false);
    expect(requiresAdminAuth("/robots.txt")).toBe(false);
    expect(requiresAdminAuth("/manifest.json")).toBe(false);
  });

  it("returns true for dashboard-only API routes", () => {
    expect(requiresAdminAuth("/api/graphql")).toBe(true);
    expect(requiresAdminAuth("/api/agents/create")).toBe(true);
    expect(requiresAdminAuth("/api/agents/templates")).toBe(true);
  });

  it("returns true for agent regenerate-key, setup, config-bundle, request-config-upgrade", () => {
    expect(requiresAdminAuth("/api/agents/abc123/regenerate-key")).toBe(true);
    expect(requiresAdminAuth("/api/agents/xyz/setup")).toBe(true);
    expect(requiresAdminAuth("/api/agents/xyz/config-bundle")).toBe(true);
    expect(requiresAdminAuth("/api/agents/xyz/request-config-upgrade")).toBe(true);
  });

  it("returns false for other API routes (agent Bearer auth)", () => {
    expect(requiresAdminAuth("/api/agents")).toBe(false);
    expect(requiresAdminAuth("/api/agents/me")).toBe(false);
    expect(requiresAdminAuth("/api/agents/me/config-bundle")).toBe(false);
    expect(requiresAdminAuth("/api/agents/me/request-config-upgrade")).toBe(false);
    expect(requiresAdminAuth("/api/tasks")).toBe(false);
    expect(requiresAdminAuth("/api/notifications")).toBe(false);
  });

  it("returns true for dashboard pages", () => {
    expect(requiresAdminAuth("/")).toBe(true);
    expect(requiresAdminAuth("/kanban")).toBe(true);
    expect(requiresAdminAuth("/agents")).toBe(true);
    expect(requiresAdminAuth("/task/123")).toBe(true);
  });
});

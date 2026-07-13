import { describe, it, expect } from "vitest";
import { agentCan, defaultCapabilitiesForRole } from "@/server/services/agent-authz";

// Epic #21: the pure agentCan decision (open vs restricted mode) + role defaults. No DB.

const restricted = (executionAllowlist: string[] = []) => ({
  changeConsentRequired: true,
  executionAllowlist,
});

describe("agentCan — open mode (default)", () => {
  it("allows anything when there is no trust profile", () => {
    expect(agentCan("host.write", { role: "worker", trustProfile: null, grants: [] }).allowed).toBe(
      true,
    );
  });
  it("allows anything when changeConsentRequired is false", () => {
    const d = agentCan("host.write", {
      role: "worker",
      trustProfile: { changeConsentRequired: false, executionAllowlist: [] },
      grants: [],
    });
    expect(d.allowed).toBe(true);
  });
});

describe("agentCan — restricted mode", () => {
  it("denies an ungranted capability", () => {
    const d = agentCan("host.write", { role: "worker", trustProfile: restricted(), grants: [] });
    expect(d.allowed).toBe(false);
    expect(d.reason).toMatch(/lacks capability/);
  });

  it("allows a role-default capability", () => {
    // docs.write is a base capability for any role
    expect(
      agentCan("docs.write", { role: "worker", trustProfile: restricted(), grants: [] }).allowed,
    ).toBe(true);
  });

  it("allows an execution-allowlisted capability", () => {
    expect(
      agentCan("host.write", {
        role: "worker",
        trustProfile: restricted(["host.write"]),
        grants: [],
      }).allowed,
    ).toBe(true);
  });

  it("allows an explicitly-granted capability", () => {
    expect(
      agentCan("host.write", {
        role: "worker",
        trustProfile: restricted(),
        grants: [{ capability: "host.write", projectScope: null }],
      }).allowed,
    ).toBe(true);
  });

  it("honors project scope on a grant", () => {
    const grants = [{ capability: "host.write", projectScope: "proj-1" }];
    // right project → allowed
    expect(
      agentCan("host.write", {
        role: "worker",
        trustProfile: restricted(),
        grants,
        scope: { projectId: "proj-1" },
      }).allowed,
    ).toBe(true);
    // wrong project → denied
    expect(
      agentCan("host.write", {
        role: "worker",
        trustProfile: restricted(),
        grants,
        scope: { projectId: "proj-2" },
      }).allowed,
    ).toBe(false);
  });
});

describe("defaultCapabilitiesForRole", () => {
  it("gives a base set to a normal role, without agents.invoke", () => {
    const caps = defaultCapabilitiesForRole("engineer");
    expect(caps).toContain("docs.write");
    expect(caps).not.toContain("agents.invoke");
  });
  it("adds elevated capabilities for a lead/ceo role", () => {
    expect(defaultCapabilitiesForRole("CEO")).toContain("agents.invoke");
    expect(defaultCapabilitiesForRole("Squad Lead")).toContain("agents.invoke");
  });
});

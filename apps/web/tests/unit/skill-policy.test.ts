import { describe, it, expect } from "vitest";
import {
  evaluateSkillPolicy,
  isSkillAction,
  normalizeSkillPolicySourceLocator,
  isSafeSourceLocator,
  type SkillPolicy,
} from "@agentcenter/utils";

describe("evaluateSkillPolicy (Domain 5 GAP-F)", () => {
  it("defaults to allow with no policy / no rules", () => {
    expect(evaluateSkillPolicy(null, { action: "create", principal: {} }).allowed).toBe(true);
    expect(
      evaluateSkillPolicy(
        { defaultEffect: "allow", rules: [] },
        { action: "create", principal: {} },
      ).allowed,
    ).toBe(true);
  });

  it("honors a deny defaultEffect", () => {
    const d = evaluateSkillPolicy(
      { defaultEffect: "deny", rules: [] },
      { action: "create", principal: {} },
    );
    expect(d.allowed).toBe(false);
    expect(d.matchedRuleId).toBeNull();
  });

  it("matches by action + subject role and returns the remediation", () => {
    const policy: SkillPolicy = {
      defaultEffect: "allow",
      rules: [
        {
          id: "no-member-create",
          effect: "deny",
          actions: ["create"],
          subjects: [{ type: "roles", roles: ["member"] }],
          remediation: "ask an admin",
        },
      ],
    };
    const denied = evaluateSkillPolicy(policy, { action: "create", principal: { role: "member" } });
    expect(denied).toMatchObject({
      allowed: false,
      matchedRuleId: "no-member-create",
      remediation: "ask an admin",
    });
    // an admin is not in the subject → falls through to default allow
    expect(
      evaluateSkillPolicy(policy, { action: "create", principal: { role: "admin" } }).allowed,
    ).toBe(true);
    // a different action is unaffected
    expect(
      evaluateSkillPolicy(policy, { action: "edit", principal: { role: "member" } }).allowed,
    ).toBe(true);
  });

  it("priority: higher-priority rule wins over a conflicting lower one", () => {
    const policy: SkillPolicy = {
      defaultEffect: "allow",
      rules: [
        { id: "low-allow", effect: "allow", priority: 1, actions: ["install"] },
        { id: "high-deny", effect: "deny", priority: 10, actions: ["install"] },
      ],
    };
    expect(evaluateSkillPolicy(policy, { action: "install", principal: {} })).toMatchObject({
      allowed: false,
      matchedRuleId: "high-deny",
    });
  });

  it("matches resource selectors (skillKey / sourceType); unset dimensions match anything", () => {
    const policy: SkillPolicy = {
      defaultEffect: "allow",
      rules: [
        {
          id: "deny-github-import",
          effect: "deny",
          actions: ["import"],
          resources: { sourceTypes: ["github"] },
        },
      ],
    };
    expect(
      evaluateSkillPolicy(policy, {
        action: "import",
        principal: {},
        resource: { sourceType: "github" },
      }).allowed,
    ).toBe(false);
    expect(
      evaluateSkillPolicy(policy, {
        action: "import",
        principal: {},
        resource: { sourceType: "url" },
      }).allowed,
    ).toBe(true);
  });

  it("all_agents subject and '*' action wildcard match broadly", () => {
    const policy: SkillPolicy = {
      defaultEffect: "allow",
      rules: [
        { id: "lockdown", effect: "deny", actions: ["*"], subjects: [{ type: "all_agents" }] },
      ],
    };
    for (const action of ["create", "edit", "remove", "install"] as const) {
      expect(evaluateSkillPolicy(policy, { action, principal: { agentId: "a1" } }).allowed).toBe(
        false,
      );
    }
  });
});

describe("source locator scrubbing", () => {
  it("isSkillAction validates the action vocabulary", () => {
    expect(isSkillAction("create")).toBe(true);
    expect(isSkillAction("nope")).toBe(false);
  });

  it("strips credentials from a locator and flags unsafe ones", () => {
    expect(normalizeSkillPolicySourceLocator("https://user:pass@github.com/x/y")).toBe(
      "https://github.com/x/y",
    );
    expect(normalizeSkillPolicySourceLocator("https://x.com/s?token=abc123")).toBe(
      "https://x.com/s?token=***",
    );
    expect(isSafeSourceLocator("https://github.com/x/y")).toBe(true);
    expect(isSafeSourceLocator("https://user:pass@github.com/x/y")).toBe(false);
    expect(isSafeSourceLocator("https://x.com/s?api_key=abc")).toBe(false);
  });
});

import { describe, it, expect } from "vitest";
import {
  approvalTrustRank,
  conditionMatches,
  evaluateApprovalPolicy,
  isApprovalDenied,
  subjectMatches,
  type ApprovalPolicyContext,
  type ApprovalPolicyRule,
} from "@agentcenter/utils";

// Rule-based approval-policy engine (governance depth). PURE evaluator — priority order, condition
// matching for each supported condition, default-allow, and every effect.

const rule = (
  over: Partial<ApprovalPolicyRule> & Pick<ApprovalPolicyRule, "id">,
): ApprovalPolicyRule => ({
  priority: 0,
  action: "*",
  effect: "require_approval",
  subject: null,
  condition: null,
  enabled: true,
  ...over,
});

const ctx = (over: Partial<ApprovalPolicyContext> = {}): ApprovalPolicyContext => ({
  action: "run",
  ...over,
});

describe("approval-policy evaluator", () => {
  describe("default-allow", () => {
    it("allows when there are no policies", () => {
      expect(evaluateApprovalPolicy([], ctx())).toEqual({ effect: "allow", matchedPolicyId: null });
    });
    it("allows when no policy matches the action", () => {
      const rules = [rule({ id: "r1", action: "hire_agent", effect: "deny" })];
      expect(evaluateApprovalPolicy(rules, ctx({ action: "run" }))).toEqual({
        effect: "allow",
        matchedPolicyId: null,
      });
    });
    it("is the convenience isApprovalDenied's negative case", () => {
      expect(isApprovalDenied([], ctx())).toBe(false);
    });
  });

  describe("action matching", () => {
    it("a '*' policy matches any action", () => {
      const rules = [rule({ id: "star", action: "*", effect: "deny" })];
      expect(evaluateApprovalPolicy(rules, ctx({ action: "tool_call" }))).toMatchObject({
        effect: "deny",
        matchedPolicyId: "star",
      });
    });
    it("an exact-action policy matches only that action", () => {
      const rules = [rule({ id: "run", action: "run", effect: "require_approval" })];
      expect(evaluateApprovalPolicy(rules, ctx({ action: "run" })).matchedPolicyId).toBe("run");
      expect(
        evaluateApprovalPolicy(rules, ctx({ action: "spend_over" })).matchedPolicyId,
      ).toBeNull();
    });
  });

  describe("every effect surfaces", () => {
    it("returns allow / require_approval / deny per the matched policy", () => {
      expect(evaluateApprovalPolicy([rule({ id: "a", effect: "allow" })], ctx()).effect).toBe(
        "allow",
      );
      expect(
        evaluateApprovalPolicy([rule({ id: "r", effect: "require_approval" })], ctx()).effect,
      ).toBe("require_approval");
      expect(evaluateApprovalPolicy([rule({ id: "d", effect: "deny" })], ctx()).effect).toBe(
        "deny",
      );
      expect(isApprovalDenied([rule({ id: "d", effect: "deny" })], ctx())).toBe(true);
    });
  });

  describe("priority order (first match wins)", () => {
    it("higher priority wins", () => {
      const rules = [
        rule({ id: "low", priority: 1, effect: "allow" }),
        rule({ id: "high", priority: 10, effect: "deny" }),
      ];
      expect(evaluateApprovalPolicy(rules, ctx())).toMatchObject({
        effect: "deny",
        matchedPolicyId: "high",
      });
    });
    it("breaks a priority tie deterministically by id", () => {
      const rules = [
        rule({ id: "bbb", priority: 5, effect: "deny" }),
        rule({ id: "aaa", priority: 5, effect: "allow" }),
      ];
      expect(evaluateApprovalPolicy(rules, ctx()).matchedPolicyId).toBe("aaa");
    });
    it("ignores disabled policies", () => {
      const rules = [
        rule({ id: "off", priority: 100, effect: "deny", enabled: false }),
        rule({ id: "on", priority: 1, effect: "require_approval" }),
      ];
      expect(evaluateApprovalPolicy(rules, ctx())).toMatchObject({
        effect: "require_approval",
        matchedPolicyId: "on",
      });
    });
  });

  describe("subject matching", () => {
    it("empty / all subject applies to every agent", () => {
      expect(subjectMatches(null, ctx({ agentId: "a1" }))).toBe(true);
      expect(subjectMatches({ all: true }, ctx({ agentId: "a1" }))).toBe(true);
      expect(subjectMatches({}, ctx({ agentId: "a1" }))).toBe(true);
    });
    it("agentIds selector matches by id", () => {
      expect(subjectMatches({ agentIds: ["a1"] }, ctx({ agentId: "a1" }))).toBe(true);
      expect(subjectMatches({ agentIds: ["a1"] }, ctx({ agentId: "a2" }))).toBe(false);
      expect(subjectMatches({ agentIds: ["a1"] }, ctx({ agentId: null }))).toBe(false);
    });
    it("roles selector matches by agent role", () => {
      expect(subjectMatches({ roles: ["engineer"] }, ctx({ agentRole: "engineer" }))).toBe(true);
      expect(subjectMatches({ roles: ["engineer"] }, ctx({ agentRole: "designer" }))).toBe(false);
    });
    it("trustLevels selector matches by trust level", () => {
      expect(subjectMatches({ trustLevels: ["untrusted"] }, ctx({ trustLevel: "untrusted" }))).toBe(
        true,
      );
      expect(subjectMatches({ trustLevels: ["untrusted"] }, ctx({ trustLevel: "trusted" }))).toBe(
        false,
      );
    });
    it("ORs across multiple selectors", () => {
      const s = { agentIds: ["a1"], roles: ["engineer"] };
      expect(subjectMatches(s, ctx({ agentId: "zzz", agentRole: "engineer" }))).toBe(true);
      expect(subjectMatches(s, ctx({ agentId: "a1", agentRole: "designer" }))).toBe(true);
      expect(subjectMatches(s, ctx({ agentId: "zzz", agentRole: "designer" }))).toBe(false);
    });
    it("a policy whose subject excludes the agent does not match (falls through to allow)", () => {
      const rules = [rule({ id: "r", effect: "deny", subject: { agentIds: ["other"] } })];
      expect(evaluateApprovalPolicy(rules, ctx({ agentId: "me" }))).toEqual({
        effect: "allow",
        matchedPolicyId: null,
      });
    });
  });

  describe("condition matching — costCentsOver", () => {
    it("matches only when cost strictly exceeds the threshold", () => {
      const c = { costCentsOver: 5000 };
      expect(conditionMatches(c, ctx({ costCents: 5001 }))).toBe(true);
      expect(conditionMatches(c, ctx({ costCents: 5000 }))).toBe(false);
      expect(conditionMatches(c, ctx({ costCents: 10 }))).toBe(false);
    });
    it("does not match when cost is absent (skips, falls through)", () => {
      const rules = [
        rule({
          id: "spend",
          action: "spend_over",
          effect: "deny",
          condition: { costCentsOver: 5000 },
        }),
      ];
      expect(evaluateApprovalPolicy(rules, ctx({ action: "spend_over", costCents: null }))).toEqual(
        {
          effect: "allow",
          matchedPolicyId: null,
        },
      );
      expect(
        evaluateApprovalPolicy(rules, ctx({ action: "spend_over", costCents: 6000 })),
      ).toMatchObject({ effect: "deny", matchedPolicyId: "spend" });
    });
  });

  describe("condition matching — trustBelow", () => {
    it("trust ladder ranks untrusted < low < standard < trusted", () => {
      expect(approvalTrustRank("untrusted")).toBeLessThan(approvalTrustRank("low"));
      expect(approvalTrustRank("low")).toBeLessThan(approvalTrustRank("standard"));
      expect(approvalTrustRank("standard")).toBeLessThan(approvalTrustRank("trusted"));
    });
    it("matches when the agent's trust is strictly below the threshold", () => {
      const c = { trustBelow: "trusted" as const };
      expect(conditionMatches(c, ctx({ trustLevel: "standard" }))).toBe(true);
      expect(conditionMatches(c, ctx({ trustLevel: "untrusted" }))).toBe(true);
      expect(conditionMatches(c, ctx({ trustLevel: "trusted" }))).toBe(false);
      expect(conditionMatches(c, ctx({ trustLevel: null }))).toBe(false);
    });
    it("require_approval for below-trusted agents on run", () => {
      const rules = [
        rule({
          id: "t",
          action: "run",
          effect: "require_approval",
          condition: { trustBelow: "trusted" },
        }),
      ];
      expect(
        evaluateApprovalPolicy(rules, ctx({ action: "run", trustLevel: "low" })),
      ).toMatchObject({
        effect: "require_approval",
        matchedPolicyId: "t",
      });
      expect(evaluateApprovalPolicy(rules, ctx({ action: "run", trustLevel: "trusted" }))).toEqual({
        effect: "allow",
        matchedPolicyId: null,
      });
    });
  });

  describe("combined conditions (AND) + realistic precedence", () => {
    it("requires ALL present condition keys to hold", () => {
      const c = { costCentsOver: 5000, trustBelow: "trusted" as const };
      expect(conditionMatches(c, ctx({ costCents: 6000, trustLevel: "low" }))).toBe(true);
      expect(conditionMatches(c, ctx({ costCents: 6000, trustLevel: "trusted" }))).toBe(false);
      expect(conditionMatches(c, ctx({ costCents: 100, trustLevel: "low" }))).toBe(false);
    });
    it("a high-priority allow can whitelist above a broad require_approval", () => {
      const rules = [
        rule({ id: "broad", priority: 1, action: "run", effect: "require_approval" }),
        rule({
          id: "vip",
          priority: 10,
          action: "run",
          effect: "allow",
          subject: { agentIds: ["vip"] },
        }),
      ];
      expect(evaluateApprovalPolicy(rules, ctx({ action: "run", agentId: "vip" }))).toMatchObject({
        effect: "allow",
        matchedPolicyId: "vip",
      });
      expect(evaluateApprovalPolicy(rules, ctx({ action: "run", agentId: "other" }))).toMatchObject(
        {
          effect: "require_approval",
          matchedPolicyId: "broad",
        },
      );
    });
  });
});

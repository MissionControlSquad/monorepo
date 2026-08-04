import { describe, it, expect } from "vitest";
import {
  evaluateToolAccess,
  isToolAllowed,
  toolPatternMatches,
  type ToolAccessRule,
} from "@agentcenter/utils";

const rule = (over: Partial<ToolAccessRule> & Pick<ToolAccessRule, "id">): ToolAccessRule => ({
  toolPattern: "*",
  effect: "allow",
  priority: 0,
  agentId: null,
  ...over,
});

describe("tool access-policy evaluator (parity #21)", () => {
  describe("toolPatternMatches", () => {
    it("matches exact, wildcard, and prefix/suffix globs", () => {
      expect(toolPatternMatches("*", "anything")).toBe(true);
      expect(toolPatternMatches("github.create_pr", "github.create_pr")).toBe(true);
      expect(toolPatternMatches("github.create_pr", "github.merge_pr")).toBe(false);
      expect(toolPatternMatches("github.*", "github.merge_pr")).toBe(true);
      expect(toolPatternMatches("*.read", "fs.read")).toBe(true);
      expect(toolPatternMatches("github.*", "gitlab.x")).toBe(false);
    });
    it("treats regex metachars in the pattern literally", () => {
      expect(toolPatternMatches("a.b", "aXb")).toBe(false); // '.' is literal, not any-char
      expect(toolPatternMatches("a.b", "a.b")).toBe(true);
    });
  });

  describe("evaluateToolAccess", () => {
    it("defaults to allow when no rule matches (config restricts, doesn't lock down)", () => {
      expect(evaluateToolAccess([], "fs.read")).toEqual({ decision: "allow", matchedRuleId: null });
      expect(evaluateToolAccess([], "fs.read", { defaultEffect: "deny" })).toEqual({
        decision: "deny",
        matchedRuleId: null,
      });
    });

    it("a matching deny blocks the tool", () => {
      const rules = [rule({ id: "r1", toolPattern: "shell.*", effect: "deny" })];
      expect(evaluateToolAccess(rules, "shell.exec")).toMatchObject({
        decision: "deny",
        matchedRuleId: "r1",
      });
      expect(isToolAllowed(rules, "fs.read")).toBe(true); // unmatched → default allow
    });

    it("agent-scoped rules beat workspace-wide ones", () => {
      const rules = [
        rule({ id: "ws", toolPattern: "github.*", effect: "deny", priority: 100 }),
        rule({ id: "ag", toolPattern: "github.*", effect: "allow", agentId: "a1", priority: 0 }),
      ];
      // for agent a1 the agent-scoped allow wins despite the workspace deny's higher priority
      expect(evaluateToolAccess(rules, "github.create_pr", { agentId: "a1" })).toMatchObject({
        decision: "allow",
        matchedRuleId: "ag",
      });
      // for another agent, only the workspace deny applies
      expect(evaluateToolAccess(rules, "github.create_pr", { agentId: "a2" })).toMatchObject({
        decision: "deny",
        matchedRuleId: "ws",
      });
    });

    it("higher priority wins within the same scope", () => {
      const rules = [
        rule({ id: "low", toolPattern: "*", effect: "allow", priority: 1 }),
        rule({ id: "high", toolPattern: "*", effect: "deny", priority: 10 }),
      ];
      expect(evaluateToolAccess(rules, "x")).toMatchObject({ decision: "deny", matchedRuleId: "high" });
    });

    it("deny beats allow on an exact priority+scope tie (fail-safe)", () => {
      const rules = [
        rule({ id: "a", toolPattern: "fs.write", effect: "allow", priority: 5 }),
        rule({ id: "d", toolPattern: "fs.write", effect: "deny", priority: 5 }),
      ];
      expect(evaluateToolAccess(rules, "fs.write")).toMatchObject({
        decision: "deny",
        matchedRuleId: "d",
      });
    });

    it("a more specific pattern wins over a broader one at equal priority", () => {
      const rules = [
        rule({ id: "broad", toolPattern: "github.*", effect: "deny", priority: 0 }),
        rule({ id: "exact", toolPattern: "github.read", effect: "allow", priority: 0 }),
      ];
      expect(evaluateToolAccess(rules, "github.read")).toMatchObject({
        decision: "allow",
        matchedRuleId: "exact",
      });
      expect(evaluateToolAccess(rules, "github.delete")).toMatchObject({
        decision: "deny",
        matchedRuleId: "broad",
      });
    });
  });
});

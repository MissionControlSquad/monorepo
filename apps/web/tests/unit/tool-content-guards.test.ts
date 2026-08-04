import { describe, it, expect } from "vitest";
import { applyContentGuards, type ContentGuardRule } from "@agentcenter/utils";

const rule = (
  over: Partial<ContentGuardRule> & Pick<ContentGuardRule, "id">,
): ContentGuardRule => ({
  pattern: "x",
  action: "redact",
  appliesTo: "both",
  priority: 0,
  ...over,
});

describe("applyContentGuards (parity #163)", () => {
  it("allows text that matches no rule", () => {
    expect(applyContentGuards([], "hello world", "input")).toMatchObject({
      decision: "allow",
      text: "hello world",
    });
  });

  it("a matching deny rule blocks the call (highest priority wins)", () => {
    const rules = [rule({ id: "d", pattern: "rm -rf", action: "deny", priority: 10 })];
    const res = applyContentGuards(rules, "please run rm -rf /", "input");
    expect(res).toMatchObject({ decision: "deny", deniedByRuleId: "d" });
  });

  it("redact rules mask their matches when no deny fires", () => {
    const rules = [
      rule({ id: "r1", pattern: "password", action: "redact" }),
      rule({ id: "r2", pattern: "/token=\\w+/", action: "redact" }),
    ];
    const res = applyContentGuards(rules, "the password is x, token=abc123", "output");
    expect(res.decision).toBe("redact");
    expect(res.text).toBe("the [blocked] is x, [blocked]");
    expect(res.redactedRuleIds.sort()).toEqual(["r1", "r2"]);
  });

  it("deny beats redact even if a redact would also match", () => {
    const rules = [
      rule({ id: "r", pattern: "secret", action: "redact", priority: 5 }),
      rule({ id: "d", pattern: "secret", action: "deny", priority: 1 }),
    ];
    expect(applyContentGuards(rules, "a secret", "input").decision).toBe("deny");
  });

  it("respects direction (input/output/both)", () => {
    const rules = [rule({ id: "o", pattern: "leak", action: "deny", appliesTo: "output" })];
    expect(applyContentGuards(rules, "leak", "input").decision).toBe("allow"); // output-only rule
    expect(applyContentGuards(rules, "leak", "output").decision).toBe("deny");
  });

  it("a malformed regex rule is skipped (never matches), not thrown", () => {
    const rules = [rule({ id: "bad", pattern: "/[/", action: "deny" })];
    expect(() => applyContentGuards(rules, "anything", "input")).not.toThrow();
    expect(applyContentGuards(rules, "anything", "input").decision).toBe("allow");
  });
});

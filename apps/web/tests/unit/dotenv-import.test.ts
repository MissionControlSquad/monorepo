import { describe, it, expect } from "vitest";
import { parseDotEnv } from "@agentcenter/utils";

describe("parseDotEnv (secrets bulk import)", () => {
  it("parses KEY=VALUE, export prefixes, and quoted values", () => {
    const { entries, invalidLines } = parseDotEnv(
      [
        "# a comment",
        "",
        "OPENAI_API_KEY=sk-abc",
        "export STRIPE_KEY=sk_live_123",
        'QUOTED="with spaces"',
        "SINGLE='single quoted'",
      ].join("\n"),
    );
    expect(invalidLines).toEqual([]);
    expect(entries).toEqual([
      { name: "OPENAI_API_KEY", value: "sk-abc" },
      { name: "STRIPE_KEY", value: "sk_live_123" },
      { name: "QUOTED", value: "with spaces" },
      { name: "SINGLE", value: "single quoted" },
    ]);
  });

  it("keeps '=' inside the value and preserves an empty value", () => {
    const { entries } = parseDotEnv("URL=postgres://u:p@h/db?a=b\nEMPTY=");
    expect(entries[0]).toEqual({ name: "URL", value: "postgres://u:p@h/db?a=b" });
    expect(entries[1]).toEqual({ name: "EMPTY", value: "" });
  });

  it("flags malformed lines (no '=', empty key, bad key chars) by 1-based line number", () => {
    const { entries, invalidLines } = parseDotEnv(
      ["GOOD=1", "no-equals-here", "=novalue", "1BAD=x"].join("\n"),
    );
    expect(entries).toEqual([{ name: "GOOD", value: "1" }]);
    expect(invalidLines).toEqual([2, 3, 4]);
  });
});

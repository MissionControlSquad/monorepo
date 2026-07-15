import { describe, it, expect } from "vitest";
import { lintSkill } from "@agentcenter/utils";

describe("lintSkill (skill test-run)", () => {
  it("passes a well-formed skill with no findings", () => {
    expect(
      lintSkill({ markdown: "# Deploy\n\nSteps...", files: [{ path: "run.sh", content: "echo" }] }),
    ).toEqual([]);
  });

  it("errors on an empty entry doc", () => {
    const f = lintSkill({ markdown: "   ", files: [] });
    expect(f).toContainEqual({
      level: "error",
      path: null,
      message: "entry doc (markdown) is empty",
    });
  });

  it("warns when the entry doc has no title heading", () => {
    const f = lintSkill({ markdown: "just prose, no heading", files: [] });
    expect(f.some((x) => x.level === "warn" && /no '# Title'/.test(x.message))).toBe(true);
  });

  it("errors on a duplicate file path and warns on an empty file", () => {
    const f = lintSkill({
      markdown: "# T\nx",
      files: [
        { path: "a.md", content: "hi" },
        { path: "a.md", content: "again" },
        { path: "empty.txt", content: "" },
      ],
    });
    expect(f).toContainEqual({
      level: "error",
      path: "a.md",
      message: "duplicate file path in bundle",
    });
    expect(f).toContainEqual({ level: "warn", path: "empty.txt", message: "file is empty" });
  });

  it("warns when the bundle is very large", () => {
    const big = "x".repeat(1_100_000);
    const f = lintSkill({ markdown: "# T\nok", files: [{ path: "big", content: big }] });
    expect(f.some((x) => x.level === "warn" && /bundle is large/.test(x.message))).toBe(true);
  });
});

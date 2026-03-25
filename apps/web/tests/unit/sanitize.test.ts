import { describe, it, expect } from "vitest";
import { escapeHtml, parseChildTasks } from "../../src/server/sanitize";

describe("escapeHtml", () => {
  it("escapes HTML special characters", () => {
    expect(escapeHtml('<script>alert("xss")</script>')).toBe(
      "&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;",
    );
  });

  it("escapes ampersands", () => {
    expect(escapeHtml("foo & bar")).toBe("foo &amp; bar");
  });

  it("escapes single quotes", () => {
    expect(escapeHtml("it's")).toBe("it&#39;s");
  });

  it("returns empty string unchanged", () => {
    expect(escapeHtml("")).toBe("");
  });

  it("leaves safe strings unchanged", () => {
    expect(escapeHtml("hello world 123")).toBe("hello world 123");
  });
});

describe("parseChildTasks", () => {
  it("parses a valid array", () => {
    const result = parseChildTasks([
      { title: "Task 1", description: "Desc 1" },
      { title: "Task 2", description: "Desc 2", priority: "high" },
    ]);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ title: "Task 1", description: "Desc 1", priority: undefined, assigneeIds: undefined });
    expect(result[1].priority).toBe("high");
  });

  it("parses a JSON string", () => {
    const json = JSON.stringify([{ title: "T", description: "D" }]);
    const result = parseChildTasks(json);
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe("T");
  });

  it("trims whitespace from title and description", () => {
    const result = parseChildTasks([{ title: "  Task  ", description: "  Desc  " }]);
    expect(result[0].title).toBe("Task");
    expect(result[0].description).toBe("Desc");
  });

  it("filters non-string assigneeIds", () => {
    const result = parseChildTasks([
      { title: "T", description: "D", assigneeIds: ["a", 123, "b", null] },
    ]);
    expect(result[0].assigneeIds).toEqual(["a", "b"]);
  });

  it("throws on invalid JSON string", () => {
    expect(() => parseChildTasks("{bad")).toThrow("not valid JSON");
  });

  it("throws on non-array input", () => {
    expect(() => parseChildTasks({ title: "T" })).toThrow("must be an array");
  });

  it("throws on missing title", () => {
    expect(() => parseChildTasks([{ description: "D" }])).toThrow("title is required");
  });

  it("allows missing description", () => {
    const result = parseChildTasks([{ title: "T" }]);
    expect(result[0].description).toBeUndefined();
  });

  it("throws on non-object array element", () => {
    expect(() => parseChildTasks(["string"])).toThrow("must be an object");
  });
});

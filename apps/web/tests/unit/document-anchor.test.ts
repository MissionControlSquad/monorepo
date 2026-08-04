import { describe, it, expect } from "vitest";
import { makeAnchor, reanchor, remapOpenThreadsForDocument } from "@agentcenter/utils";

const text = "The quick brown fox jumps over the lazy dog.";

describe("reanchor (#G5)", () => {
  it("exact unique match → confidence 1", () => {
    const anchor = makeAnchor(text, 4, 15); // "quick brown"
    const r = reanchor(text, anchor);
    expect(r).toMatchObject({ quote: "quick brown", confidence: 1 });
    expect(text.slice(r!.startOffset, r!.endOffset)).toBe("quick brown");
  });

  it("shifts offsets when text is inserted before the anchor", () => {
    const anchor = makeAnchor(text, 16, 19); // "fox"
    const edited = "Yesterday: " + text; // 11 chars inserted
    const r = reanchor(edited, anchor);
    expect(edited.slice(r!.startOffset, r!.endOffset)).toBe("fox");
    expect(r!.startOffset).toBe(16 + 11);
  });

  it("disambiguates duplicate quotes by prefix/suffix context", () => {
    const dup = "cat sat and cat ran"; // "cat" twice
    const anchor = makeAnchor(dup, 12, 15); // the second "cat", prefix "and ", suffix " ran"
    const r = reanchor(dup, anchor);
    expect(r!.startOffset).toBe(12);
    expect(r!.confidence).toBeGreaterThanOrEqual(0.9);
  });

  it("recovers a span via prefix..suffix when the quote itself changed", () => {
    const anchor = makeAnchor(text, 16, 19); // "fox", prefix "...brown ", suffix " jumps..."
    const edited = text.replace("fox", "cheetah");
    const r = reanchor(edited, anchor);
    expect(r).not.toBeNull();
    expect(r!.quote).toBe("cheetah");
    expect(r!.confidence).toBeCloseTo(0.7, 5);
  });

  it("orphans when nothing matches", () => {
    const anchor = makeAnchor(text, 16, 19);
    expect(reanchor("completely different content here", anchor)).toBeNull();
  });

  it("remapOpenThreadsForDocument maps each thread", () => {
    const a = makeAnchor(text, 4, 9);
    const remaps = remapOpenThreadsForDocument("X" + text, [{ id: "t1", anchor: a }]);
    expect(remaps[0].id).toBe("t1");
    expect(remaps[0].result).not.toBeNull();
  });
});

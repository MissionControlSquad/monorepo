import { describe, it, expect } from "vitest";
import { parseHttpUrl, classifyExternalLink } from "@agentcenter/utils";

describe("external-link helpers (Tier C)", () => {
  it("parseHttpUrl accepts http(s), rejects others", () => {
    expect(parseHttpUrl("https://github.com/x")?.hostname).toBe("github.com");
    expect(parseHttpUrl("http://example.com")?.protocol).toBe("http:");
    expect(parseHttpUrl("ftp://x")).toBeNull();
    expect(parseHttpUrl("not a url")).toBeNull();
    expect(parseHttpUrl("javascript:alert(1)")).toBeNull();
  });

  it("classifyExternalLink maps host → kind", () => {
    expect(classifyExternalLink("https://github.com/o/r/issues/1")).toBe("github");
    expect(classifyExternalLink("https://gitlab.com/o/r")).toBe("gitlab");
    expect(classifyExternalLink("https://example.com/x")).toBe("url");
    expect(classifyExternalLink("garbage")).toBe("url");
  });
});

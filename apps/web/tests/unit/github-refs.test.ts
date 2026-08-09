import { describe, it, expect } from "vitest";
import { parseGithubRef, summarizeGithubPayload, GithubRefError } from "@agentcenter/utils";

describe("parseGithubRef (#66)", () => {
  it("parses issue/pull/commit/repo/file URLs", () => {
    expect(parseGithubRef("https://github.com/acme/app/issues/42")).toMatchObject({
      objectType: "issue",
      owner: "acme",
      repo: "app",
      externalId: "acme/app#42",
      apiPath: "repos/acme/app/issues/42",
    });
    expect(parseGithubRef("https://github.com/acme/app/pull/7").apiPath).toBe(
      "repos/acme/app/pulls/7",
    );
    expect(parseGithubRef("https://github.com/acme/app/commit/abc1234").objectType).toBe("commit");
    expect(parseGithubRef("https://github.com/acme/app")).toMatchObject({
      objectType: "repo",
      apiPath: "repos/acme/app",
    });
    expect(parseGithubRef("https://github.com/acme/app/blob/main/src/x.ts")).toMatchObject({
      objectType: "file",
      apiPath: "repos/acme/app/contents/src/x.ts?ref=main",
    });
  });

  it("parses shorthand forms", () => {
    expect(parseGithubRef("acme/app#12").objectType).toBe("issue");
    expect(parseGithubRef("acme/app@deadbeef").objectType).toBe("commit");
    expect(parseGithubRef("acme/app")).toMatchObject({
      objectType: "repo",
      externalId: "acme/app",
    });
  });

  it("rejects garbage", () => {
    expect(() => parseGithubRef("")).toThrow(GithubRefError);
    expect(() => parseGithubRef("not a ref")).toThrow(GithubRefError);
    expect(() => parseGithubRef("https://gitlab.com/a/b")).toThrow(GithubRefError);
  });

  it("summarizes payloads by type", () => {
    expect(summarizeGithubPayload("issue", { title: "Bug", state: "open" })).toEqual({
      title: "Bug",
      state: "open",
    });
    expect(summarizeGithubPayload("commit", { commit: { message: "fix: x\n\nbody" } })).toEqual({
      title: "fix: x",
    });
  });
});

import { describe, expect, it } from "vitest";
import { redactRunSecrets, RUN_SECRET_MASK } from "@agentcenter/utils";

describe("redactRunSecrets", () => {
  it("masks an exact secret value", () => {
    expect(redactRunSecrets("key is sk-live-abcdef here", ["sk-live-abcdef"])).toBe(
      `key is ${RUN_SECRET_MASK} here`,
    );
  });

  it("masks every occurrence of a secret value", () => {
    const out = redactRunSecrets("token=ghp_secretvalue then ghp_secretvalue again", [
      "ghp_secretvalue",
    ]);
    expect(out).toBe(`token=${RUN_SECRET_MASK} then ${RUN_SECRET_MASK} again`);
    expect(out).not.toContain("ghp_secretvalue");
  });

  it("masks multiple distinct secret values in the same text", () => {
    const out = redactRunSecrets("GIT_TOKEN=abcd1234 and LLM_KEY=wxyz9876", [
      "abcd1234",
      "wxyz9876",
    ]);
    expect(out).toBe(`GIT_TOKEN=${RUN_SECRET_MASK} and LLM_KEY=${RUN_SECRET_MASK}`);
  });

  it("leaves text with no secret values untouched", () => {
    const text = "a perfectly ordinary line of run output";
    expect(redactRunSecrets(text, ["never-present-secret"])).toBe(text);
  });

  it("ignores empty and very short values to avoid over-masking", () => {
    // "" and short values would otherwise carpet-bomb benign output.
    expect(redactRunSecrets("the cat sat on a mat", ["", "a", "at"])).toBe("the cat sat on a mat");
  });

  it("still masks a value exactly at the minimum redactable length", () => {
    expect(redactRunSecrets("code abcd done", ["abcd"])).toBe(`code ${RUN_SECRET_MASK} done`);
  });

  it("handles regex-special characters in secret values literally", () => {
    const secret = "a.b*c+d(e)[f]$g^h?";
    expect(redactRunSecrets(`before ${secret} after`, [secret])).toBe(
      `before ${RUN_SECRET_MASK} after`,
    );
    // A regex-special value must not accidentally match other text.
    expect(redactRunSecrets("aXbYcZd", [secret])).toBe("aXbYcZd");
  });

  it("masks the longer value first so a shorter overlapping value cannot leak the tail", () => {
    expect(redactRunSecrets("token-extended token", ["token", "token-extended"])).toBe(
      `${RUN_SECRET_MASK} ${RUN_SECRET_MASK}`,
    );
  });

  it("returns empty/undefined-ish text unchanged", () => {
    expect(redactRunSecrets("", ["some-secret"])).toBe("");
  });

  it("deduplicates repeated secret values without error", () => {
    expect(redactRunSecrets("value1234 value1234", ["value1234", "value1234"])).toBe(
      `${RUN_SECRET_MASK} ${RUN_SECRET_MASK}`,
    );
  });
});

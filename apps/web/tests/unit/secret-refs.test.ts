import { describe, it, expect } from "vitest";
import {
  isSecretRef,
  collectSecretRefs,
  resolveSecretRefs,
  maskSecretRefs,
} from "@agentcenter/utils";

const ref = (name: string) => ({ secretRef: { name } });

describe("secret-refs (parity #93 — json-schema-secret-refs)", () => {
  describe("isSecretRef", () => {
    it("accepts a well-formed pointer and rejects everything else", () => {
      expect(isSecretRef(ref("API_KEY"))).toBe(true);
      expect(isSecretRef({ secretRef: { name: "" } })).toBe(false); // empty name
      expect(isSecretRef({ secretRef: {} })).toBe(false);
      expect(isSecretRef("plain")).toBe(false);
      expect(isSecretRef(null)).toBe(false);
      expect(isSecretRef([ref("x")])).toBe(false); // an array is not itself a ref
    });
  });

  describe("collectSecretRefs", () => {
    it("gathers every distinct name across nested objects + arrays", () => {
      const config = {
        token: ref("TOKEN"),
        nested: { db: { password: ref("DB_PW") }, url: "https://x" },
        list: [ref("A"), { k: ref("B") }, "literal", ref("TOKEN")],
      };
      expect([...collectSecretRefs(config)].sort()).toEqual(["A", "B", "DB_PW", "TOKEN"]);
    });
    it("returns empty when there are no refs", () => {
      expect([...collectSecretRefs({ a: 1, b: [2, 3], c: "x" })]).toEqual([]);
    });
  });

  describe("resolveSecretRefs", () => {
    const vault: Record<string, string> = { TOKEN: "t0k", DB_PW: "hunter2" };
    const resolve = async (name: string) => vault[name] ?? null;

    it("swaps pointers for values, preserving structure + literals", async () => {
      const out = await resolveSecretRefs(
        {
          token: ref("TOKEN"),
          db: { password: ref("DB_PW") },
          keep: "literal",
          n: 5,
          arr: [ref("TOKEN"), "x"],
        },
        resolve,
      );
      expect(out).toEqual({
        token: "t0k",
        db: { password: "hunter2" },
        keep: "literal",
        n: 5,
        arr: ["t0k", "x"],
      });
    });

    it("throws on a missing secret by default", async () => {
      await expect(resolveSecretRefs({ x: ref("NOPE") }, resolve)).rejects.toThrow(
        /missing secret: NOPE/,
      );
    });

    it("uses onMissing fallback when provided", async () => {
      const out = await resolveSecretRefs({ x: ref("NOPE") }, resolve, { onMissing: () => "" });
      expect(out).toEqual({ x: "" });
    });
  });

  describe("maskSecretRefs", () => {
    it("renders pointers as secret:<name> and leaves the rest intact", () => {
      expect(
        maskSecretRefs({
          token: ref("TOKEN"),
          keep: "v",
          arr: [ref("A"), 1],
          nested: { p: ref("B") },
        }),
      ).toEqual({
        token: "secret:TOKEN",
        keep: "v",
        arr: ["secret:A", 1],
        nested: { p: "secret:B" },
      });
    });
  });
});

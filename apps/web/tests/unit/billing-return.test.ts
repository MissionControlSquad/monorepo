import { describe, it, expect } from "vitest";
import { readBillingOutcome } from "../../src/lib/billing-return";

const outcome = (qs: string) => readBillingOutcome(new URLSearchParams(qs));

describe("readBillingOutcome", () => {
  it("maps success variants (any of the accepted synonyms) to `success`", () => {
    for (const v of ["success", "succeeded", "complete", "completed", "paid"]) {
      expect(outcome(`status=${v}`)).toBe("success");
    }
  });

  it("maps cancel/failure variants to `cancelled`", () => {
    for (const v of ["cancel", "cancelled", "canceled", "failed"]) {
      expect(outcome(`status=${v}`)).toBe("cancelled");
    }
  });

  it("is case-insensitive", () => {
    expect(outcome("status=SUCCESS")).toBe("success");
    expect(outcome("status=Cancelled")).toBe("cancelled");
  });

  it("falls back to `unknown` for empty / missing / unrecognized status", () => {
    expect(outcome("")).toBe("unknown");
    expect(outcome("foo=bar")).toBe("unknown");
    expect(outcome("status=weird")).toBe("unknown");
  });

  it("reads the alternate keys buildbase/Stripe may use (checkout, result)", () => {
    expect(outcome("checkout=success")).toBe("success");
    expect(outcome("result=canceled")).toBe("cancelled");
  });

  it("prefers `status` over the alternate keys when both are present", () => {
    expect(outcome("status=success&checkout=cancel")).toBe("success");
  });
});

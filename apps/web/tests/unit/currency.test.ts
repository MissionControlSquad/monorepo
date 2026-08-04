import { describe, it, expect } from "vitest";
import { formatCents } from "@agentcenter/utils";

// Pure USD formatter shared by the finance/ledger/salary surfaces.
describe("formatCents", () => {
  it("formats whole and fractional dollars", () => {
    expect(formatCents(0)).toBe("$0.00");
    expect(formatCents(5)).toBe("$0.05");
    expect(formatCents(100)).toBe("$1.00");
    expect(formatCents(12345)).toBe("$123.45");
  });

  it("always shows exactly two fraction digits", () => {
    expect(formatCents(150)).toBe("$1.50");
    expect(formatCents(199)).toBe("$1.99");
  });

  it("renders negatives with a leading minus before the sign", () => {
    expect(formatCents(-500)).toBe("-$5.00");
    expect(formatCents(-1)).toBe("-$0.01");
  });

  it("groups thousands", () => {
    expect(formatCents(123456789)).toBe("$1,234,567.89");
  });
});

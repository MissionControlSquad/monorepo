import { describe, it, expect } from "vitest";
import {
  isFinanceEventKind,
  isFinanceDirection,
  isFinanceUnit,
  signedFinanceAmount,
  summarizeFinanceEvents,
} from "@agentcenter/utils";

describe("finance-events pure model (Domain 12 GAP-1)", () => {
  it("validates kinds / directions / units", () => {
    expect(isFinanceEventKind("credit_purchase")).toBe(true);
    expect(isFinanceEventKind("platform_fee")).toBe(true);
    expect(isFinanceEventKind("bogus")).toBe(false);
    expect(isFinanceDirection("debit")).toBe(true);
    expect(isFinanceDirection("credit")).toBe(true);
    expect(isFinanceDirection("sideways")).toBe(false);
    expect(isFinanceUnit("gb_month")).toBe(true);
    expect(isFinanceUnit("furlong")).toBe(false);
  });

  it("signedFinanceAmount: debit is positive spend, credit is negative", () => {
    expect(signedFinanceAmount("debit", 500)).toBe(500);
    expect(signedFinanceAmount("credit", 500)).toBe(-500);
    expect(signedFinanceAmount("debit", 12.9)).toBe(12); // truncated to integer cents
  });

  it("summarizeFinanceEvents nets debit − credit and tracks estimated + count", () => {
    const summary = summarizeFinanceEvents([
      { direction: "debit", amountCents: 1000 }, // platform fee
      { direction: "debit", amountCents: 250, estimated: true }, // estimated storage
      { direction: "credit", amountCents: 400 }, // credit purchase
    ]);
    expect(summary).toEqual({
      debitCents: 1250,
      creditCents: 400,
      netCents: 850,
      estimatedCents: 250,
      count: 3,
    });
  });

  it("empty list summarizes to zeros", () => {
    expect(summarizeFinanceEvents([])).toEqual({
      debitCents: 0,
      creditCents: 0,
      netCents: 0,
      estimatedCents: 0,
      count: 0,
    });
  });
});

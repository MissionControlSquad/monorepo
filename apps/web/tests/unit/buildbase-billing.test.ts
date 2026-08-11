import { describe, it, expect } from "vitest";
import {
  creditsSummary,
  formatMoney,
  formatUnixDate,
  invoiceStatusLabel,
  seatSummary,
  subscriptionStatusLabel,
  trialSummary,
} from "@/lib/buildbase-billing";

describe("buildbase-billing pure helpers", () => {
  describe("subscriptionStatusLabel", () => {
    it("maps known statuses to label + tone", () => {
      expect(subscriptionStatusLabel("active")).toEqual({ label: "Active", tone: "success" });
      expect(subscriptionStatusLabel("trialing")).toEqual({ label: "Trialing", tone: "success" });
      expect(subscriptionStatusLabel("past_due")).toEqual({ label: "Past due", tone: "danger" });
      expect(subscriptionStatusLabel("canceled").tone).toBe("muted");
      expect(subscriptionStatusLabel("cancelled").label).toBe("Canceled");
      expect(subscriptionStatusLabel("incomplete").tone).toBe("warning");
    });
    it("degrades gracefully for empty/unknown (dormant-safe)", () => {
      expect(subscriptionStatusLabel(undefined)).toEqual({
        label: "No subscription",
        tone: "muted",
      });
      expect(subscriptionStatusLabel(null)).toEqual({ label: "No subscription", tone: "muted" });
      expect(subscriptionStatusLabel("some_new_state")).toEqual({
        label: "Some New State",
        tone: "muted",
      });
    });
  });

  describe("invoiceStatusLabel", () => {
    it("maps invoice statuses", () => {
      expect(invoiceStatusLabel("paid")).toEqual({ label: "Paid", tone: "success" });
      expect(invoiceStatusLabel("open").tone).toBe("warning");
      expect(invoiceStatusLabel("uncollectible").tone).toBe("danger");
      expect(invoiceStatusLabel("void").label).toBe("Void");
      expect(invoiceStatusLabel(null).tone).toBe("muted");
    });
  });

  describe("trialSummary", () => {
    it("returns null when not trialing", () => {
      expect(
        trialSummary({ isTrialing: false, daysRemaining: 5, isTrialEnding: false }),
      ).toBeNull();
    });
    it("describes an active trial", () => {
      expect(trialSummary({ isTrialing: true, daysRemaining: 10, isTrialEnding: false })).toBe(
        "Trial — 10 days remaining",
      );
      expect(trialSummary({ isTrialing: true, daysRemaining: 1, isTrialEnding: true })).toBe(
        "Trial ends soon — 1 day left",
      );
      expect(trialSummary({ isTrialing: true, daysRemaining: 0, isTrialEnding: true })).toBe(
        "Trial ends today",
      );
    });
  });

  describe("seatSummary", () => {
    it("returns null without seat pricing", () => {
      expect(
        seatSummary({
          hasSeatPricing: false,
          memberCount: 3,
          includedSeats: 2,
          billableSeats: 1,
          availableSeats: 5,
          isAtMax: false,
          isNearMax: false,
        }),
      ).toBeNull();
    });
    it("summarises seats and flags capacity", () => {
      expect(
        seatSummary({
          hasSeatPricing: true,
          memberCount: 4,
          includedSeats: 2,
          billableSeats: 2,
          availableSeats: 1,
          isAtMax: false,
          isNearMax: true,
        }),
      ).toBe("4 members · 2 included · 2 billable — near capacity");
      expect(
        seatSummary({
          hasSeatPricing: true,
          memberCount: 1,
          includedSeats: 0,
          billableSeats: 0,
          availableSeats: 0,
          isAtMax: true,
          isNearMax: true,
        }),
      ).toBe("1 member — at capacity");
    });
  });

  describe("creditsSummary", () => {
    it("formats balances and handles missing values", () => {
      expect(creditsSummary(0)).toBe("0 credits available");
      expect(creditsSummary(1)).toBe("1 credit available");
      expect(creditsSummary(null)).toBe("0 credits available");
      expect(creditsSummary(undefined)).toBe("0 credits available");
      expect(creditsSummary(-5)).toBe("0 credits available");
    });
  });

  describe("formatUnixDate", () => {
    it("returns empty string for invalid input", () => {
      expect(formatUnixDate(0)).toBe("");
      expect(formatUnixDate(null)).toBe("");
      expect(formatUnixDate(undefined)).toBe("");
    });
    it("formats a real timestamp", () => {
      // 2021-01-01T00:00:00Z
      expect(formatUnixDate(1609459200)).not.toBe("");
    });
  });

  describe("formatMoney", () => {
    it("formats minor units as currency", () => {
      expect(formatMoney(1234, "usd")).toContain("12.34");
      expect(formatMoney(0, "usd")).toContain("0");
    });
    it("does not throw on an odd currency", () => {
      expect(() => formatMoney(1000, "")).not.toThrow();
    });
  });
});

import { describe, it, expect } from "vitest";
import {
  isBillingType,
  normalizeBillingType,
  billingFamily,
  splitByBillingFamily,
} from "@agentcenter/utils";

describe("billing-types (Domain 12 GAP-6 A14)", () => {
  it("validates the widened vocabulary", () => {
    expect(isBillingType("metered_api")).toBe(true);
    expect(isBillingType("subscription_overage")).toBe(true);
    expect(isBillingType("credits")).toBe(true);
    expect(isBillingType("nope")).toBe(false);
  });

  it("normalizes legacy + unknown values", () => {
    expect(normalizeBillingType("api")).toBe("metered_api");
    expect(normalizeBillingType("subscription")).toBe("subscription_included");
    expect(normalizeBillingType("credits")).toBe("credits");
    expect(normalizeBillingType("bogus")).toBe("metered_api");
    expect(normalizeBillingType(null)).toBe("metered_api");
  });

  it("classifies each type into a reporting family", () => {
    expect(billingFamily("api")).toBe("metered");
    expect(billingFamily("metered_api")).toBe("metered");
    expect(billingFamily("subscription_overage")).toBe("metered"); // overage is metered usage
    expect(billingFamily("subscription")).toBe("subscription");
    expect(billingFamily("subscription_included")).toBe("subscription");
    expect(billingFamily("credits")).toBe("other");
    expect(billingFamily("fixed")).toBe("other");
  });

  it("splits spend rows by family with counts", () => {
    const split = splitByBillingFamily([
      { billingType: "api", amountCents: 100 },
      { billingType: "metered_api", amountCents: 50 },
      { billingType: "subscription", amountCents: 1000 },
      { billingType: "credits", amountCents: 5 },
    ]);
    expect(split).toEqual({
      meteredCents: 150,
      subscriptionCents: 1000,
      otherCents: 5,
      meteredCount: 2,
      subscriptionCount: 1,
      otherCount: 1,
    });
  });
});

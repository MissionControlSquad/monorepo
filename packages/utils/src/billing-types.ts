/**
 * Cost billing-type taxonomy (Domain 12 GAP-6 A14) — pure, shared via @agentcenter/utils. Widens the
 * old api|subscription split to Paperclip's fuller set and classifies each into a reporting FAMILY
 * (metered vs subscription vs other) so spend reports can split API vs subscription usage. Back-compat:
 * "api"/"subscription" remain valid and map to the metered/subscription families.
 */

export const BILLING_TYPES = [
  "api", // legacy alias for metered_api
  "metered_api",
  "subscription", // legacy alias for subscription_included
  "subscription_included",
  "subscription_overage",
  "credits",
  "fixed",
] as const;
export type BillingType = (typeof BILLING_TYPES)[number];

export function isBillingType(v: string): v is BillingType {
  return (BILLING_TYPES as readonly string[]).includes(v);
}

/** Normalize a caller-provided billing type; unknown → "metered_api". */
export function normalizeBillingType(v: string | null | undefined): BillingType {
  if (!v) return "metered_api";
  if (v === "api") return "metered_api";
  if (v === "subscription") return "subscription_included";
  return isBillingType(v) ? (v as BillingType) : "metered_api";
}

export type BillingFamily = "metered" | "subscription" | "other";

/** Pure: the reporting family a billing type rolls up into. */
export function billingFamily(v: string | null | undefined): BillingFamily {
  const t = normalizeBillingType(v);
  if (t === "api" || t === "metered_api" || t === "subscription_overage") return "metered";
  if (t === "subscription" || t === "subscription_included") return "subscription";
  return "other"; // credits | fixed
}

export interface BillingSplit {
  meteredCents: number;
  subscriptionCents: number;
  otherCents: number;
  meteredCount: number;
  subscriptionCount: number;
  otherCount: number;
}

/** Pure: split spend rows into metered vs subscription vs other by billing family. */
export function splitByBillingFamily(
  rows: { billingType: string | null; amountCents: number }[],
): BillingSplit {
  const out: BillingSplit = {
    meteredCents: 0,
    subscriptionCents: 0,
    otherCents: 0,
    meteredCount: 0,
    subscriptionCount: 0,
    otherCount: 0,
  };
  for (const r of rows) {
    const cents = Math.trunc(r.amountCents);
    const fam = billingFamily(r.billingType);
    if (fam === "metered") {
      out.meteredCents += cents;
      out.meteredCount += 1;
    } else if (fam === "subscription") {
      out.subscriptionCents += cents;
      out.subscriptionCount += 1;
    } else {
      out.otherCents += cents;
      out.otherCount += 1;
    }
  }
  return out;
}

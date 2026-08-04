/**
 * Non-inference finance ledger constants (Domain 12 GAP-1). Shared via @agentcenter/utils. Pure.
 * FinanceEvent captures account-level provider money that is NOT per-inference cost (which is
 * CostEvent) and NOT human business P&L (which is LedgerEvent): credit purchases/refunds/expiry,
 * platform + BYOK fees, gateway overhead, training/storage charges, and manual adjustments.
 */

/** The kinds of non-inference financial event (ported from Paperclip finance constants). */
export const FINANCE_EVENT_KINDS = [
  "credit_purchase",
  "credit_refund",
  "credit_expiry",
  "platform_fee",
  "byok_fee",
  "gateway_overhead",
  "training_charge",
  "storage_charge",
  "bandwidth_charge",
  "subscription_fee",
  "tax",
  "discount",
  "manual_adjustment",
  "other",
] as const;
export type FinanceEventKind = (typeof FINANCE_EVENT_KINDS)[number];

export function isFinanceEventKind(v: string): v is FinanceEventKind {
  return (FINANCE_EVENT_KINDS as readonly string[]).includes(v);
}

/** debit = money out (a charge); credit = money in (a purchase/refund of credits). */
export const FINANCE_DIRECTIONS = ["debit", "credit"] as const;
export type FinanceDirection = (typeof FINANCE_DIRECTIONS)[number];

export function isFinanceDirection(v: string): v is FinanceDirection {
  return (FINANCE_DIRECTIONS as readonly string[]).includes(v);
}

/** Unit the quantity is measured in (for metered non-inference charges). */
export const FINANCE_UNITS = [
  "flat",
  "credits",
  "gb_month",
  "gb_transfer",
  "gpu_hour",
  "request",
  "seat_month",
] as const;
export type FinanceUnit = (typeof FINANCE_UNITS)[number];

export function isFinanceUnit(v: string): v is FinanceUnit {
  return (FINANCE_UNITS as readonly string[]).includes(v);
}

/**
 * Pure: signed contribution of an event to net spend, in cents. A debit adds to spend (+), a credit
 * reduces it (−). Used by the summary aggregator so net = Σ signed.
 */
export function signedFinanceAmount(direction: string, amountCents: number): number {
  const cents = Math.trunc(amountCents);
  return direction === "credit" ? -cents : cents;
}

export interface FinanceSummary {
  debitCents: number;
  creditCents: number;
  netCents: number;
  estimatedCents: number;
  count: number;
}

/** Pure: fold a list of finance events into a summary (debit/credit/net/estimated/count). */
export function summarizeFinanceEvents(
  events: { direction: string; amountCents: number; estimated?: boolean | null }[],
): FinanceSummary {
  let debitCents = 0;
  let creditCents = 0;
  let estimatedCents = 0;
  for (const e of events) {
    const cents = Math.trunc(e.amountCents);
    if (e.direction === "credit") creditCents += cents;
    else debitCents += cents;
    if (e.estimated) estimatedCents += cents;
  }
  return {
    debitCents,
    creditCents,
    netCents: debitCents - creditCents,
    estimatedCents,
    count: events.length,
  };
}

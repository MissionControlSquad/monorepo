/**
 * Pure, framework-free presentation helpers for the buildbase billing surfaces (Epic — buildbase
 * customer billing). Kept free of React and of any @buildbase/sdk runtime import so they can be
 * unit-tested under the node test environment and reused across the billing/pricing views.
 *
 * NOTE: This is buildbase's CUSTOMER billing (human workspace subscription/credits). It is a
 * separate concern from the AI-agent finance/budgets ledger (finance.prisma) — do not conflate.
 */

export type StatusTone = "success" | "warning" | "danger" | "muted";

/** Human label + tone for a buildbase subscription status string. */
export function subscriptionStatusLabel(status?: string | null): {
  label: string;
  tone: StatusTone;
} {
  switch ((status ?? "").toLowerCase()) {
    case "active":
      return { label: "Active", tone: "success" };
    case "trialing":
      return { label: "Trialing", tone: "success" };
    case "past_due":
      return { label: "Past due", tone: "danger" };
    case "unpaid":
      return { label: "Unpaid", tone: "danger" };
    case "canceled":
    case "cancelled":
      return { label: "Canceled", tone: "muted" };
    case "incomplete":
    case "incomplete_expired":
      return { label: "Incomplete", tone: "warning" };
    case "paused":
      return { label: "Paused", tone: "warning" };
    case "":
      return { label: "No subscription", tone: "muted" };
    default:
      return { label: titleCase(status ?? "Unknown"), tone: "muted" };
  }
}

/** Human label + tone for a Stripe invoice status string. */
export function invoiceStatusLabel(status?: string | null): { label: string; tone: StatusTone } {
  switch ((status ?? "").toLowerCase()) {
    case "paid":
      return { label: "Paid", tone: "success" };
    case "open":
      return { label: "Open", tone: "warning" };
    case "draft":
      return { label: "Draft", tone: "muted" };
    case "uncollectible":
      return { label: "Uncollectible", tone: "danger" };
    case "void":
      return { label: "Void", tone: "muted" };
    default:
      return { label: titleCase(status ?? "Unknown"), tone: "muted" };
  }
}

/**
 * One-line trial summary, or null when not trialing.
 * `isTrialEnding` (<= 3 days) is surfaced with an urgency-flavoured wording.
 */
export function trialSummary(trial: {
  isTrialing: boolean;
  daysRemaining: number;
  isTrialEnding: boolean;
}): string | null {
  if (!trial.isTrialing) return null;
  const days = Math.max(0, Math.trunc(trial.daysRemaining));
  const noun = days === 1 ? "day" : "days";
  if (days === 0) return "Trial ends today";
  if (trial.isTrialEnding) return `Trial ends soon — ${days} ${noun} left`;
  return `Trial — ${days} ${noun} remaining`;
}

/**
 * One-line seat summary, or null when the plan is not seat-priced. Includes an at/near-capacity
 * suffix so the UI can warn before invites are blocked.
 */
export function seatSummary(seat: {
  hasSeatPricing: boolean;
  memberCount: number;
  includedSeats: number;
  billableSeats: number;
  availableSeats: number;
  isAtMax: boolean;
  isNearMax: boolean;
}): string | null {
  if (!seat.hasSeatPricing) return null;
  const parts: string[] = [];
  parts.push(`${seat.memberCount} member${seat.memberCount === 1 ? "" : "s"}`);
  if (seat.includedSeats > 0) parts.push(`${seat.includedSeats} included`);
  if (seat.billableSeats > 0) parts.push(`${seat.billableSeats} billable`);
  let summary = parts.join(" · ");
  if (seat.isAtMax) summary += " — at capacity";
  else if (seat.isNearMax) summary += " — near capacity";
  return summary;
}

/** Short credits summary line. */
export function creditsSummary(available: number | null | undefined): string {
  const n =
    typeof available === "number" && Number.isFinite(available) ? Math.max(0, available) : 0;
  return `${n.toLocaleString()} credit${n === 1 ? "" : "s"} available`;
}

/** Format a Stripe unix timestamp (seconds) as a short date; empty string when absent. */
export function formatUnixDate(seconds?: number | null): string {
  if (typeof seconds !== "number" || !Number.isFinite(seconds) || seconds <= 0) return "";
  try {
    return new Date(seconds * 1000).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return "";
  }
}

/** Minor-unit money formatter (fallback to the SDK's formatCents at the call site is fine too). */
export function formatMoney(amountCents: number, currency: string): string {
  const cur = (currency || "usd").toUpperCase();
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency: cur }).format(
      (Number.isFinite(amountCents) ? amountCents : 0) / 100,
    );
  } catch {
    return `${(amountCents / 100).toFixed(2)} ${cur}`;
  }
}

function titleCase(s: string): string {
  return s
    .replace(/[_-]+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Pure logic for the post-checkout /billing return page (buildbase billing). Extracted so it can be
 * unit-tested without rendering (repo convention: quota-gate-logic.ts, push-card-state.ts,
 * login-mode.ts). buildbase / Stripe append a status hint to the return URL; we normalize the common
 * variants into one of three outcomes.
 */
export type BillingOutcome = "success" | "cancelled" | "unknown";

export function readBillingOutcome(params: URLSearchParams): BillingOutcome {
  const raw = (
    params.get("status") ??
    params.get("checkout") ??
    params.get("result") ??
    ""
  ).toLowerCase();
  if (["success", "succeeded", "complete", "completed", "paid"].includes(raw)) return "success";
  if (["cancel", "cancelled", "canceled", "failed"].includes(raw)) return "cancelled";
  return "unknown";
}

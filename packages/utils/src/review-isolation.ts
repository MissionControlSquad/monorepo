/**
 * Untrusted-PR-review Docker isolation routing (sandbox security hardening — Item 3). Pure + isomorphic.
 *
 * `run-review.ts` already QUARANTINES the OUTPUT of a low-trust/untrusted run (a `needs_review` state +
 * a quarantined sourceTrust marker). This adds the missing complement: when a run's SOURCE trust is
 * untrusted, its checkout/review must be performed in an ISOLATED container profile — a hostile PR must
 * never be checked out on the normal execution path where it could reach the control plane or siblings'
 * credentials. This helper is the trust-gated routing decision; the container itself is a documented
 * seam (a docker-compose profile / provider config — see self-hosted/docker-compose.review-checkout.yml).
 *
 * Pure: given a run's trust inputs it decides WHICH profile the checkout/review runs under. The service
 * layer stamps the decision onto the run so the UI can show that the review ran isolated.
 */
import type { RunTrustInputs } from "./source-trust";
import { runRequiresReview } from "./source-trust";

/** The compose/provider profile a review-checkout runs under. */
export const REVIEW_CHECKOUT_PROFILES = ["normal", "isolated"] as const;
export type ReviewCheckoutProfile = (typeof REVIEW_CHECKOUT_PROFILES)[number];

/** The docker-compose profile name that boots the hardened, network-isolated review container. */
export const ISOLATED_REVIEW_COMPOSE_PROFILE = "review-checkout";

export interface ReviewCheckoutRouting {
  /** true → route the checkout/review through the isolated container profile. */
  isolated: boolean;
  /** The profile the checkout/review runs under. */
  profile: ReviewCheckoutProfile;
  /** The compose profile name to boot when isolated (null on the normal path). */
  composeProfile: string | null;
  /** Human-readable reason (surfaced in the run UI / audit). */
  reason: string;
}

/**
 * Pure: decide how a run's checkout/review should be routed from its source-trust inputs. An untrusted /
 * low-trust source (or a profile that explicitly requires untrusted-PR review, or low-trust containment)
 * routes to the ISOLATED profile; a standard/trusted source stays on the normal path. Same predicate
 * (`runRequiresReview`) the output-quarantine gate uses, so the two decisions never diverge.
 */
export function resolveReviewCheckoutRouting(
  inputs: RunTrustInputs | null | undefined,
): ReviewCheckoutRouting {
  if (runRequiresReview(inputs)) {
    return {
      isolated: true,
      profile: "isolated",
      composeProfile: ISOLATED_REVIEW_COMPOSE_PROFILE,
      reason:
        "Source trust is untrusted — checkout/review routed to the isolated container profile (network-restricted, no shared credentials).",
    };
  }
  return {
    isolated: false,
    profile: "normal",
    composeProfile: null,
    reason: "Source trust is standard — checkout/review runs on the normal path.",
  };
}

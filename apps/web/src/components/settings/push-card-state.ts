// Pure rendering-decision logic for PushNotificationsCard, split out so it can be unit-tested
// without a DOM (the card itself pulls in React + the buildbase SDK). See push-card-state.test.ts.

/** The card's top-level rendering decision. */
export type PushCardStatus = "flag-off" | "unconfigured" | "active";

/**
 * Decide how the Push notifications card renders.
 *   - "flag-off":      NOTIFICATIONS feature flag is off → disabled + explained.
 *   - "unconfigured":  buildbase isn't provisioned, so the SDK push provider isn't mounted →
 *                      disabled + explained (must NOT call usePushNotifications in this state).
 *   - "active":        render the interactive, SDK-driven body.
 */
export function resolvePushCardStatus(
  notificationsFlagEnabled: boolean,
  buildbaseReady: boolean,
): PushCardStatus {
  if (!notificationsFlagEnabled) return "flag-off";
  if (!buildbaseReady) return "unconfigured";
  return "active";
}

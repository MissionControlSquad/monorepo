import { describe, it, expect } from "vitest";
import { resolvePushCardStatus } from "../../src/components/settings/push-card-state";

// Graceful-degradation logic for the Push notifications settings card. The card must NEVER call
// usePushNotifications unless status === "active" (the SDK provider is only mounted when buildbase
// is ready), and must show a disabled+explained state otherwise.
describe("resolvePushCardStatus", () => {
  it("flag off wins even when buildbase is ready", () => {
    expect(resolvePushCardStatus(false, true)).toBe("flag-off");
    expect(resolvePushCardStatus(false, false)).toBe("flag-off");
  });

  it("unconfigured when flag on but buildbase not ready (SDK provider absent)", () => {
    expect(resolvePushCardStatus(true, false)).toBe("unconfigured");
  });

  it("active only when flag on AND buildbase ready", () => {
    expect(resolvePushCardStatus(true, true)).toBe("active");
  });
});

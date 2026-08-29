import { describe, it, expect } from "vitest";
import { GET } from "../../app/api/cron/reap-stale-work/route";
import { env } from "../../src/server/env";

// Verifies the cron HTTP entrypoint itself: CRON_SECRET auth (fail-closed) + the six-reaper fan-out
// wiring returns a summary. The individual reapers are tested in isolation elsewhere.
function req(auth?: string) {
  return new Request(
    "http://test/api/cron/reap-stale-work",
    auth ? { headers: { authorization: auth } } : {},
  );
}

describe("reap-stale-work cron route", () => {
  it("401s without a valid CRON_SECRET bearer", async () => {
    expect((await GET(req(), { params: Promise.resolve({}) })).status).toBe(401);
    expect((await GET(req("Bearer wrong-secret"), { params: Promise.resolve({}) })).status).toBe(
      401,
    );
  });

  it("runs all reapers and returns the fan-out summary with the correct secret", async () => {
    const res = await GET(req(`Bearer ${env.CRON_SECRET}`), { params: Promise.resolve({}) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    for (const key of [
      "watchdogsFired",
      "checkoutsReleased",
      "commandsReaped",
      "terminalsClosed",
      "terminalsExpired",
      "deliveriesDeadLettered",
      "deliveriesRepushed",
    ]) {
      expect(body).toHaveProperty(key);
      expect(typeof body[key]).toBe("number");
    }
  });
});

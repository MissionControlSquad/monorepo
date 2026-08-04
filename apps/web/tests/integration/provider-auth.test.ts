import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "../../src/server/prisma";
import {
  recordProviderAuth,
  reconcileProviderAuth,
  listProviderAuthStates,
} from "../../src/server/services/provider-auth";

// Parity #25 — provider auth state tracking + reconciliation.
const WS = "ws_provauth";
const HOUR = 3_600_000;

beforeEach(async () => {
  await prisma.providerAuthState.deleteMany({ where: { workspaceId: WS } });
});

describe("provider auth (#25)", () => {
  it("records + classifies state, and reconcile recomputes the action", async () => {
    const row = await recordProviderAuth({
      workspaceId: WS,
      provider: "codex",
      accountRef: "acct-1",
      expiresAt: new Date(Date.now() + 2 * HOUR),
    });
    expect(row.state).toBe("valid");

    // move expiry into the past → reconcile flips to expired/reauth
    await prisma.providerAuthState.update({
      where: { id: row.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    const { row: after, classification } = await reconcileProviderAuth(WS, "codex", "acct-1");
    expect(after.state).toBe("expired");
    expect(classification.action).toBe("reauth");
  });

  it("lists credentials needing attention", async () => {
    await recordProviderAuth({
      workspaceId: WS,
      provider: "codex",
      accountRef: "ok",
      expiresAt: new Date(Date.now() + 5 * HOUR),
    });
    await recordProviderAuth({
      workspaceId: WS,
      provider: "codex",
      accountRef: "bad",
      revoked: true,
    });
    const attention = await listProviderAuthStates(WS, { needsAttention: true });
    expect(attention.map((r) => r.accountRef)).toEqual(["bad"]);
  });

  it("validates required fields", async () => {
    await expect(
      recordProviderAuth({ workspaceId: WS, provider: "", accountRef: "x" }),
    ).rejects.toThrow(/provider/);
  });
});

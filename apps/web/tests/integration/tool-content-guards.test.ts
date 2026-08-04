import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "../../src/server/prisma";
import {
  setToolContentGuard,
  listToolContentGuards,
  deleteToolContentGuard,
  evaluateToolContent,
} from "../../src/server/services/tool-content-guards";

// Parity #163 — tool content-guard storage + evaluation.
const WS = "ws_guards";

beforeEach(async () => {
  await prisma.toolContentGuard.deleteMany({ where: { workspaceId: WS } });
});

describe("tool content-guard service (#163)", () => {
  it("creates/updates/deletes rules (validated, workspace-scoped)", async () => {
    const g = await setToolContentGuard({
      workspaceId: WS,
      pattern: "rm -rf",
      action: "deny",
      priority: 10,
    });
    expect(g).toMatchObject({ action: "deny", priority: 10, appliesTo: "both" });
    expect(await listToolContentGuards(WS)).toHaveLength(1);

    const up = await setToolContentGuard({
      id: g.id,
      workspaceId: WS,
      pattern: "rm -rf",
      action: "redact",
    });
    expect(up.action).toBe("redact");

    await expect(
      setToolContentGuard({ workspaceId: WS, pattern: "x", action: "bogus" }),
    ).rejects.toThrow(/deny.*redact/);

    expect(await deleteToolContentGuard(g.id, WS)).toBe(true);
    expect(await listToolContentGuards(WS)).toHaveLength(0);
  });

  it("evaluates tool content against stored rules", async () => {
    await setToolContentGuard({
      workspaceId: WS,
      pattern: "rm -rf",
      action: "deny",
      appliesTo: "input",
    });
    await setToolContentGuard({ workspaceId: WS, pattern: "password", action: "redact" });

    expect((await evaluateToolContent(WS, "run rm -rf /", "input")).decision).toBe("deny");
    const out = await evaluateToolContent(WS, "the password is here", "output");
    expect(out.decision).toBe("redact");
    expect(out.text).toContain("[blocked]");
    expect((await evaluateToolContent(WS, "harmless text", "input")).decision).toBe("allow");
  });
});

import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "../../src/server/prisma";
import {
  recordTelemetry,
  recordTelemetryBatch,
  pruneTelemetry,
} from "../../src/server/services/telemetry-sink";
import { makeTelemetryEvent, retentionClassFor, TelemetryError } from "@agentcenter/utils";

// Parity #E1-E4 — first-party telemetry pipeline.
const WS = "ws_telemetry";

beforeEach(async () => {
  await prisma.telemetryEvent.deleteMany({ where: { workspaceId: WS } });
});

describe("telemetry contract (pure)", () => {
  it("shapes an event with its retention class", () => {
    expect(makeTelemetryEvent({ workspaceId: WS, name: "tool.denied" }).retentionClass).toBe(
      "audit",
    );
    expect(retentionClassFor("unknown.event")).toBe("operational");
    expect(() => makeTelemetryEvent({ workspaceId: WS, name: "" })).toThrow(TelemetryError);
  });
});

describe("telemetry sink (#E1-E4)", () => {
  it("records events and classifies them", async () => {
    await recordTelemetry({ workspaceId: WS, name: "task.created", props: { id: "t1" } });
    await recordTelemetry({ workspaceId: WS, name: "tool.denied" });
    const rows = await prisma.telemetryEvent.findMany({ where: { workspaceId: WS } });
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.name === "tool.denied")?.retentionClass).toBe("audit");
  });

  it("ingest is best-effort (invalid name → null, no throw)", async () => {
    expect(await recordTelemetry({ workspaceId: WS, name: "" })).toBeNull();
    expect(
      await recordTelemetryBatch([
        { workspaceId: WS, name: "run.started" },
        { workspaceId: WS, name: "" },
      ]),
    ).toBe(1);
  });

  it("prunes by retention class", async () => {
    // operational retention = 14d; backdate an operational event past it
    const op = await recordTelemetry({ workspaceId: WS, name: "run.started" });
    await prisma.telemetryEvent.update({
      where: { id: op!.id },
      data: { createdAt: new Date(Date.now() - 20 * 86_400_000) },
    });
    // an audit event of the same age must survive (400d retention)
    const audit = await recordTelemetry({ workspaceId: WS, name: "tool.denied" });
    await prisma.telemetryEvent.update({
      where: { id: audit!.id },
      data: { createdAt: new Date(Date.now() - 20 * 86_400_000) },
    });
    expect(await pruneTelemetry()).toBeGreaterThanOrEqual(1);
    const remaining = await prisma.telemetryEvent.findMany({ where: { workspaceId: WS } });
    expect(remaining.map((r) => r.name)).toEqual(["tool.denied"]);
  });
});

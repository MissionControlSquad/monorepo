import { describe, it, expect, beforeEach } from "vitest";
import { createHash } from "node:crypto";
import { prisma } from "../../src/server/prisma";
import {
  appendRunLog,
  finalizeRunLog,
  readRunLog,
} from "../../src/server/services/run-log-store";

// Per-run log store (observability): append chunks -> finalize (sha256 + totalBytes) -> range read.
const WS = "ws_runlog";
const RUN = "run-log-1";

beforeEach(async () => {
  await Promise.all([
    prisma.runLogChunk.deleteMany({ where: { runId: { in: [RUN, "run-log-2", "run-log-secret"] } } }),
    prisma.runLogMeta.deleteMany({ where: { runId: { in: [RUN, "run-log-2", "run-log-secret"] } } }),
  ]);
});

describe("appendRunLog", () => {
  it("assigns monotonic seq + running byteOffset and skips empty chunks", async () => {
    const a = await appendRunLog(WS, RUN, "stdout", "hello ");
    const b = await appendRunLog(WS, RUN, "stderr", "world");
    const empty = await appendRunLog(WS, RUN, "stdout", "");

    expect(a).toEqual({ seq: 0, byteOffset: 0, byteLength: 6 });
    expect(b).toEqual({ seq: 1, byteOffset: 6, byteLength: 5 });
    expect(empty).toBeNull();

    const rows = await prisma.runLogChunk.findMany({
      where: { runId: RUN },
      orderBy: { seq: "asc" },
    });
    expect(rows).toHaveLength(2);
    expect(rows[0].stream).toBe("stdout");
    expect(rows[1].stream).toBe("stderr");
  });
});

describe("finalizeRunLog", () => {
  it("computes a stable sha256 over the concatenation + records totalBytes", async () => {
    await appendRunLog(WS, RUN, "stdout", "line one\n");
    await appendRunLog(WS, RUN, "stdout", "line two\n");
    await appendRunLog(WS, RUN, "stderr", "an error\n");

    const concat = "line one\nline two\nan error\n";
    const expectedSha = createHash("sha256").update(concat, "utf8").digest("hex");
    const expectedBytes = Buffer.byteLength(concat, "utf8");

    const summary = await finalizeRunLog(WS, RUN);
    expect(summary.totalBytes).toBe(expectedBytes);
    expect(summary.sha256).toBe(expectedSha);

    // Idempotent + stable: re-finalizing yields the same sha256.
    const again = await finalizeRunLog(WS, RUN);
    expect(again.sha256).toBe(expectedSha);
    expect(again.totalBytes).toBe(expectedBytes);

    const meta = await prisma.runLogMeta.findUnique({ where: { runId: RUN } });
    expect(meta?.sha256).toBe(expectedSha);
    expect(meta?.totalBytes).toBe(expectedBytes);
  });
});

describe("readRunLog", () => {
  it("range-reads the right slice and paginates via nextOffset", async () => {
    await appendRunLog(WS, RUN, "stdout", "abcde"); // 0..5
    await appendRunLog(WS, RUN, "stdout", "fghij"); // 5..10
    await finalizeRunLog(WS, RUN);

    const full = await readRunLog(RUN);
    expect(full.content).toBe("abcdefghij");
    expect(full.totalBytes).toBe(10);
    expect(full.offset).toBe(0);
    expect(full.nextOffset).toBeNull();
    expect(full.finalized).toBe(true);
    expect(full.sha256).not.toBeNull();

    const slice = await readRunLog(RUN, { offset: 3, limit: 4 });
    expect(slice.content).toBe("defg");
    expect(slice.offset).toBe(3);
    expect(slice.nextOffset).toBe(7);

    const tail = await readRunLog(RUN, { offset: 7 });
    expect(tail.content).toBe("hij");
    expect(tail.nextOffset).toBeNull();

    // Offset past the end clamps to a clean empty slice.
    const past = await readRunLog(RUN, { offset: 999 });
    expect(past.content).toBe("");
    expect(past.offset).toBe(10);
    expect(past.nextOffset).toBeNull();
  });

  it("reports not-finalized before finalize is called", async () => {
    await appendRunLog(WS, "run-log-2", "stdout", "partial");
    const r = await readRunLog("run-log-2");
    expect(r.content).toBe("partial");
    expect(r.finalized).toBe(false);
    expect(r.sha256).toBeNull();
  });
});

describe("redaction", () => {
  it("redacts secrets before persisting, and the sha256 covers the redacted bytes", async () => {
    const secret = "sk-ABCDEFGHIJKLMNOPQRSTUVWXYZ012345";
    await appendRunLog(WS, "run-log-secret", "stdout", `token is ${secret} done`);
    const summary = await finalizeRunLog(WS, "run-log-secret");

    const read = await readRunLog("run-log-secret");
    expect(read.content).not.toContain(secret);
    expect(read.content).toContain("[redacted]");

    // The persisted row is redacted at rest (no unredacted secret in the DB).
    const row = await prisma.runLogChunk.findFirst({ where: { runId: "run-log-secret" } });
    expect(row?.content).not.toContain(secret);

    // sha256 is over exactly the redacted bytes a reader receives.
    const expectedSha = createHash("sha256").update(read.content, "utf8").digest("hex");
    expect(summary.sha256).toBe(expectedSha);
  });
});

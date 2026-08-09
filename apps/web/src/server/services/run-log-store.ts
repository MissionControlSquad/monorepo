/**
 * Per-run log store - the FULL, durable stdout/stderr transcript of a run, appended in chunks and
 * sealed on finalize with a byte total + sha256 over the concatenation. Complements the truncated tail
 * kept on AgentRun.stdout/stderr (fast display) and the ephemeral live tail in run-runtime-status.
 *
 * Ported (first slice) from Paperclip's run-log store: DB-persisted chunks, sha256, offset/range reads,
 * finalize. S3 mirroring is deferred. Workspace-scoped, keyed by runId (AgentRun.id), no FK (D5).
 *
 * Redaction: every persisted chunk is passed through redactSensitive() before it is written, so a
 * bearer token / provider key / DB URL / email that slips into run output never lands in the durable
 * transcript. The stored (redacted) bytes are what sha256 covers - the hash is over exactly what a
 * reader gets back.
 */
import { createHash } from "node:crypto";
import { redactSensitive } from "@agentcenter/utils";
import { prisma } from "@/server/prisma";

export type RunLogStream = "stdout" | "stderr";

export interface RunLogChunkResult {
  seq: number;
  byteOffset: number;
  byteLength: number;
}

export interface RunLogFinalizeSummary {
  totalBytes: number;
  sha256: string;
  finalizedAt: Date;
}

export interface RunLogReadOptions {
  offset?: number;
  limit?: number;
}

export interface RunLogReadResult {
  /** The requested byte slice of the whole-run (redacted) transcript. */
  content: string;
  /** Byte offset the slice starts at (clamped into range). */
  offset: number;
  /** Total bytes persisted for the run so far (across all chunks). */
  totalBytes: number;
  /** Next offset to request for continuation, or null when the slice reaches the end. */
  nextOffset: number | null;
  /** sha256 + finalizedAt once the run has been finalized; null while still appending. */
  sha256: string | null;
  finalized: boolean;
}

const DEFAULT_READ_LIMIT = 256_000;

function normalizeStream(stream: string): RunLogStream {
  return stream === "stderr" ? "stderr" : "stdout";
}

/**
 * Append a chunk of a run's output to the durable transcript. The chunk is redacted first, then written
 * with a monotonic per-run seq and its running byteOffset (so range reads can locate a slice). Returns
 * the persisted position. Empty/whitespace-only chunks are skipped (return null).
 */
export async function appendRunLog(
  workspaceId: string,
  runId: string,
  stream: string,
  chunk: string,
): Promise<RunLogChunkResult | null> {
  if (!chunk) return null;
  const content = redactSensitive(chunk);
  const byteLength = Buffer.byteLength(content, "utf8");
  if (byteLength === 0) return null;

  // seq + byteOffset are derived from what is already persisted for the run. A per-run unique(seq)
  // index is the race backstop; a rare concurrent append retries with the next seq.
  for (let attempt = 0; attempt < 5; attempt++) {
    const agg = await prisma.runLogChunk.aggregate({
      where: { runId },
      _max: { seq: true },
      _sum: { byteLength: true },
    });
    const seq = (agg._max.seq ?? -1) + 1;
    const byteOffset = agg._sum.byteLength ?? 0;
    try {
      await prisma.runLogChunk.create({
        data: {
          workspaceId,
          runId,
          seq,
          stream: normalizeStream(stream),
          content,
          byteOffset,
          byteLength,
        },
      });
      return { seq, byteOffset, byteLength };
    } catch (err) {
      // Lost the seq race to a concurrent append → recompute and retry.
      if ((err as { code?: string }).code === "P2002") continue;
      throw err;
    }
  }
  throw new Error(`appendRunLog: exhausted seq retries for run ${runId}`);
}

/**
 * Seal a run's transcript: concatenate all persisted chunks in order, compute sha256 over the exact
 * (redacted) bytes a reader would get, record totalBytes, and upsert the finalize meta. Idempotent -
 * re-finalizing recomputes over the current chunks (safe if a late chunk landed).
 */
export async function finalizeRunLog(
  workspaceId: string,
  runId: string,
): Promise<RunLogFinalizeSummary> {
  const chunks = await prisma.runLogChunk.findMany({
    where: { runId },
    orderBy: { seq: "asc" },
    select: { content: true, byteLength: true },
  });
  const hash = createHash("sha256");
  let totalBytes = 0;
  for (const c of chunks) {
    hash.update(c.content, "utf8");
    totalBytes += c.byteLength;
  }
  const sha256 = hash.digest("hex");
  const meta = await prisma.runLogMeta.upsert({
    where: { runId },
    create: { workspaceId, runId, totalBytes, sha256 },
    update: { totalBytes, sha256, finalizedAt: new Date() },
  });
  return { totalBytes, sha256, finalizedAt: meta.finalizedAt };
}

/**
 * Range-read a run's transcript. Concatenates the persisted (redacted) chunks and returns the byte
 * slice [offset, offset+limit). Offsets are byte positions into the utf8 concatenation, matching the
 * byteOffset/byteLength bookkeeping and the finalize sha256. nextOffset points past the slice when more
 * remains, else null.
 */
export async function readRunLog(
  runId: string,
  opts: RunLogReadOptions = {},
): Promise<RunLogReadResult> {
  const chunks = await prisma.runLogChunk.findMany({
    where: { runId },
    orderBy: { seq: "asc" },
    select: { content: true },
  });
  const full = Buffer.from(chunks.map((c) => c.content).join(""), "utf8");
  const totalBytes = full.byteLength;

  const meta = await prisma.runLogMeta.findUnique({
    where: { runId },
    select: { sha256: true },
  });

  const offset = Math.max(0, Math.min(opts.offset ?? 0, totalBytes));
  const limit = opts.limit != null && opts.limit > 0 ? opts.limit : DEFAULT_READ_LIMIT;
  const end = Math.min(offset + limit, totalBytes);
  const content = full.subarray(offset, end).toString("utf8");
  const nextOffset = end < totalBytes ? end : null;

  return {
    content,
    offset,
    totalBytes,
    nextOffset,
    sha256: meta?.sha256 ?? null,
    finalized: meta != null,
  };
}

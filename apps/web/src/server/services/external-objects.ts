import { GraphQLError } from "graphql";
import { prisma } from "@/server/prisma";
import type { ExternalObject } from "@agentcenter/database";
import { parseGithubRef, summarizeGithubPayload, GithubRefError } from "@agentcenter/utils";
import { githubApiFetch, type GithubFetcher } from "@/server/services/github-fetch";
import { badRequest } from "./service-errors";

// External objects + provider registry (parity #59 / #65). A provider parses a user-supplied reference
// and fetches a snapshot of display fields; the object is cached + linkable to an internal entity. Only
// the GitHub provider ships today; the registry is the seam for more. The fetcher is injectable so the
// resolve path is testable without network. Workspace-scoped.

interface ResolvedRef {
  provider: string;
  objectType: string;
  externalId: string;
  url: string;
  title?: string;
  state?: string;
  snapshot: Record<string, unknown> | null;
}

export interface ExternalObjectProvider {
  key: string;
  /** True if this provider recognizes the reference. */
  handles(input: string): boolean;
  resolve(input: string, fetcher?: GithubFetcher): Promise<ResolvedRef>;
}

const githubProvider: ExternalObjectProvider = {
  key: "github",
  handles(input) {
    try {
      parseGithubRef(input);
      return true;
    } catch {
      return false;
    }
  },
  async resolve(input, fetcher = githubApiFetch) {
    const ref = parseGithubRef(input);
    const res = await fetcher(ref.apiPath);
    if (!res.ok || !res.payload) {
      throw new GraphQLError(res.error ?? "failed to fetch GitHub object", {
        extensions: { code: "BAD_GATEWAY" },
      });
    }
    const summary = summarizeGithubPayload(ref.objectType, res.payload);
    return {
      provider: "github",
      objectType: ref.objectType,
      externalId: ref.externalId,
      url: (res.payload.html_url as string) ?? ref.htmlUrl,
      title: summary.title,
      state: summary.state,
      snapshot: res.payload,
    };
  },
};

const PROVIDERS: ExternalObjectProvider[] = [githubProvider];

/** The provider that recognizes a reference, or null. */
export function providerFor(input: string): ExternalObjectProvider | null {
  return PROVIDERS.find((p) => p.handles(input)) ?? null;
}

/**
 * Resolve a reference and upsert the cached external object. `fetcher` overrides the network call (for
 * tests). Throws BAD_USER_INPUT for an unrecognized reference.
 */
export async function upsertExternalObject(input: {
  workspaceId: string;
  reference: string;
  linkedType?: string | null;
  linkedId?: string | null;
  fetcher?: GithubFetcher;
}): Promise<ExternalObject> {
  const provider = providerFor(input.reference);
  if (!provider) badRequest(`no provider recognizes reference '${input.reference}'`);

  let resolved: ResolvedRef;
  try {
    resolved = await provider.resolve(input.reference, input.fetcher);
  } catch (err) {
    if (err instanceof GithubRefError) badRequest(err.message);
    throw err;
  }

  const data = {
    objectType: resolved.objectType,
    url: resolved.url,
    title: resolved.title ?? null,
    state: resolved.state ?? null,
    snapshot: (resolved.snapshot ?? undefined) as never,
    linkedType: input.linkedType ?? null,
    linkedId: input.linkedId ?? null,
    fetchedAt: new Date(),
  };
  return prisma.externalObject.upsert({
    where: {
      workspaceId_provider_externalId: {
        workspaceId: input.workspaceId,
        provider: resolved.provider,
        externalId: resolved.externalId,
      },
    },
    create: {
      workspaceId: input.workspaceId,
      provider: resolved.provider,
      externalId: resolved.externalId,
      ...data,
    },
    update: data,
  });
}

export function listExternalObjects(
  workspaceId: string,
  opts: { provider?: string; linkedType?: string; linkedId?: string } = {},
): Promise<ExternalObject[]> {
  return prisma.externalObject.findMany({
    where: {
      workspaceId,
      ...(opts.provider ? { provider: opts.provider } : {}),
      ...(opts.linkedType ? { linkedType: opts.linkedType } : {}),
      ...(opts.linkedId ? { linkedId: opts.linkedId } : {}),
    },
    orderBy: { updatedAt: "desc" },
    take: 200,
  });
}

/** Re-fetch an existing object's snapshot from its provider. */
export async function refreshExternalObject(
  workspaceId: string,
  id: string,
  fetcher?: GithubFetcher,
): Promise<ExternalObject> {
  const existing = await prisma.externalObject.findFirst({ where: { id, workspaceId } });
  if (!existing) badRequest("External object not found");
  return upsertExternalObject({
    workspaceId,
    reference: existing.externalId,
    linkedType: existing.linkedType,
    linkedId: existing.linkedId,
    fetcher,
  });
}

export async function deleteExternalObject(workspaceId: string, id: string): Promise<boolean> {
  const { count } = await prisma.externalObject.deleteMany({ where: { id, workspaceId } });
  return count > 0;
}

/** Default staleness window before a cached object is re-fetched by the background poller (6h). */
const DEFAULT_STALENESS_MS = 6 * 60 * 60 * 1000;

/**
 * Background poller (called from the reap cron): re-fetch every cached object whose snapshot has gone
 * stale (fetchedAt older than `stalenessMs`), oldest-first, reusing the on-demand refresh path (and so
 * the same provider fetch — no new external API surface). A successful refresh stamps fetchedAt = now,
 * so the object drops out of the due set until it goes stale again. Each object is best-effort: one
 * provider failure (rate-limit, deleted upstream, …) is counted and skipped, never aborting the batch.
 */
export async function refreshDueExternalObjects(opts?: {
  now?: Date;
  stalenessMs?: number;
  limit?: number;
  fetcher?: GithubFetcher;
}): Promise<{ due: number; refreshed: number; failed: number }> {
  const now = opts?.now ?? new Date();
  const stalenessMs = opts?.stalenessMs ?? DEFAULT_STALENESS_MS;
  const cutoff = new Date(now.getTime() - stalenessMs);
  const due = await prisma.externalObject.findMany({
    where: { fetchedAt: { lte: cutoff } },
    orderBy: { fetchedAt: "asc" },
    take: opts?.limit ?? 50,
  });

  let refreshed = 0;
  let failed = 0;
  for (const obj of due) {
    try {
      await refreshExternalObject(obj.workspaceId, obj.id, opts?.fetcher);
      refreshed++;
    } catch {
      failed++; // best-effort — a single provider failure never aborts the batch
    }
  }
  return { due: due.length, refreshed, failed };
}

/**
 * Skills library service (Epic #10). Per-workspace reusable capability modules (markdown) with
 * immutable versions, fork lineage, stars, and queryable agent assignment. Counters
 * (currentVersion / starCount / installCount / forkCount) are maintained next to the writes.
 */
import { GraphQLError } from "graphql";
import { prisma } from "@/server/prisma";
import {
  slugify as coreSlugify,
  parseSkillFrontmatter,
  classifySkillFile,
  deriveSkillTrustLevel,
} from "@agentcenter/utils";
import type { Prisma } from "@agentcenter/database";
import type {
  Skill,
  SkillFile,
  SkillSourceType,
  SkillTrustLevel,
  SkillSharingScope,
} from "@agentcenter/database";
import { resolveSkillSource } from "@/server/services/skill-import-sources";
import { getCatalogEntry } from "@/server/skill-catalog/manifest";

function badRequest(message: string): never {
  throw new GraphQLError(message, { extensions: { code: "BAD_USER_INPUT" } });
}
function notFound(what: string): never {
  throw new GraphQLError(`${what} not found`, { extensions: { code: "NOT_FOUND" } });
}

/** Skill slug: the shared core slugify, capped at 64 chars with a "skill" fallback. */
export function slugify(name: string): string {
  return coreSlugify(name, 64, "skill");
}

async function loadSkill(workspaceId: string, id: string) {
  const s = await prisma.skill.findFirst({ where: { id, workspaceId } });
  if (!s) notFound("Skill");
  return s;
}

export interface CreateSkillInput {
  workspaceId: string;
  name: string;
  markdown: string;
  key?: string | null;
  description?: string | null;
  categories?: string[] | null;
  sourceType?: SkillSourceType | null;
  trustLevel?: SkillTrustLevel | null;
  sharingScope?: SkillSharingScope | null;
  createdByProfileId?: string | null;
  icon?: string | null;
  color?: string | null;
  tagline?: string | null;
  author?: string | null;
  homepage?: string | null;
}

export async function createSkill(input: CreateSkillInput): Promise<Skill> {
  const name = input.name.trim();
  if (!name) badRequest("name is required");
  if (!input.markdown) badRequest("markdown is required");
  const key = (input.key?.trim() || slugify(name)).toLowerCase();
  const dup = await prisma.skill.findFirst({ where: { workspaceId: input.workspaceId, key } });
  if (dup) badRequest(`a skill with key "${key}" already exists`);

  return prisma.$transaction(async (tx) => {
    const skill = await tx.skill.create({
      data: {
        workspaceId: input.workspaceId,
        key,
        slug: slugify(name),
        name,
        markdown: input.markdown,
        frontmatter: (parseSkillFrontmatter(input.markdown) ?? undefined) as
          Prisma.InputJsonValue | undefined,
        description: input.description ?? null,
        categories: input.categories ?? [],
        icon: input.icon ?? null,
        color: input.color ?? null,
        tagline: input.tagline ?? null,
        author: input.author ?? null,
        homepage: input.homepage ?? null,
        sourceType: input.sourceType ?? "local_path",
        trustLevel: input.trustLevel ?? "markdown_only",
        sharingScope: input.sharingScope ?? "workspace",
        createdByProfileId: input.createdByProfileId ?? null,
        currentVersion: 1,
      },
    });
    await tx.skillVersion.create({
      data: {
        workspaceId: input.workspaceId,
        skillId: skill.id,
        revisionNumber: 1,
        content: input.markdown,
        createdByProfileId: input.createdByProfileId ?? null,
      },
    });
    return skill;
  });
}

export async function updateSkill(
  workspaceId: string,
  id: string,
  patch: {
    name?: string | null;
    description?: string | null;
    markdown?: string | null;
    categories?: string[] | null;
    trustLevel?: SkillTrustLevel | null;
    sharingScope?: SkillSharingScope | null;
    icon?: string | null;
    color?: string | null;
    tagline?: string | null;
    author?: string | null;
    homepage?: string | null;
  },
  actorProfileId?: string | null,
): Promise<Skill> {
  const existing = await loadSkill(workspaceId, id);
  const markdownChanged = patch.markdown != null && patch.markdown !== existing.markdown;
  const nextVersion = markdownChanged ? existing.currentVersion + 1 : existing.currentVersion;

  return prisma.$transaction(async (tx) => {
    const updated = await tx.skill.update({
      where: { id },
      data: {
        ...(patch.name != null ? { name: patch.name.trim(), slug: slugify(patch.name) } : {}),
        ...(patch.description !== undefined ? { description: patch.description } : {}),
        ...(patch.categories != null ? { categories: patch.categories } : {}),
        ...(patch.trustLevel != null ? { trustLevel: patch.trustLevel } : {}),
        ...(patch.sharingScope != null ? { sharingScope: patch.sharingScope } : {}),
        ...(patch.icon !== undefined ? { icon: patch.icon } : {}),
        ...(patch.color !== undefined ? { color: patch.color } : {}),
        ...(patch.tagline !== undefined ? { tagline: patch.tagline } : {}),
        ...(patch.author !== undefined ? { author: patch.author } : {}),
        ...(patch.homepage !== undefined ? { homepage: patch.homepage } : {}),
        ...(markdownChanged
          ? {
              markdown: patch.markdown!,
              currentVersion: nextVersion,
              frontmatter: (parseSkillFrontmatter(patch.markdown!) ?? undefined) as
                Prisma.InputJsonValue | undefined,
            }
          : {}),
      },
    });
    if (markdownChanged) {
      await tx.skillVersion.create({
        data: {
          workspaceId,
          skillId: id,
          revisionNumber: nextVersion,
          content: patch.markdown!,
          createdByProfileId: actorProfileId ?? null,
        },
      });
    }
    return updated;
  });
}

/** Delete a skill (and its versions/stars/assignments via FK cascade). Workspace-scoped. */
export async function deleteSkill(workspaceId: string, id: string): Promise<boolean> {
  await loadSkill(workspaceId, id); // 404s cross-workspace / missing
  await prisma.skill.delete({ where: { id } });
  return true;
}

/** Fork a skill into a new one (copies the current markdown as rev 1), bumping the source forkCount. */
export async function forkSkill(
  workspaceId: string,
  id: string,
  createdByProfileId?: string | null,
): Promise<Skill> {
  const source = await loadSkill(workspaceId, id);
  const baseKey = `${source.key}-fork`;
  let key = baseKey;
  for (let i = 2; await prisma.skill.findFirst({ where: { workspaceId, key } }); i++)
    key = `${baseKey}-${i}`;

  const [fork] = await prisma.$transaction([
    prisma.skill.create({
      data: {
        workspaceId,
        key,
        slug: slugify(source.name),
        name: `${source.name} (fork)`,
        markdown: source.markdown,
        description: source.description,
        categories: source.categories,
        sourceType: source.sourceType,
        trustLevel: source.trustLevel,
        sharingScope: "workspace",
        forkedFromSkillId: source.id,
        createdByProfileId: createdByProfileId ?? null,
        currentVersion: 1,
      },
    }),
    prisma.skill.update({ where: { id: source.id }, data: { forkCount: { increment: 1 } } }),
  ]);
  await prisma.skillVersion.create({
    data: {
      workspaceId,
      skillId: fork.id,
      revisionNumber: 1,
      content: source.markdown,
      createdByProfileId,
    },
  });
  return fork;
}

// ─── Public catalog (cross-workspace) ─────────────────────────────
// Skills whose author set sharingScope="public" are shared beyond their workspace. The catalog lists
// ONLY those (never `private`/`workspace`), and install COPIES one into the caller's workspace — the
// original is never mutated except its forkCount. Single shared buildbase org (D5), so "public" is
// the deliberate publish action, not a leak.

/** Public skills authored by OTHER workspaces (the browsable catalog). */
export function skillCatalog(currentWorkspaceId: string): Promise<Skill[]> {
  return prisma.skill.findMany({
    where: { sharingScope: "public", workspaceId: { not: currentWorkspaceId } },
    orderBy: [{ installCount: "desc" }, { starCount: "desc" }, { updatedAt: "desc" }],
    take: 100,
  });
}

/** Copy a public catalog skill (incl. its bundle files) into the caller's workspace as rev 1. */
export async function installCatalogSkill(
  currentWorkspaceId: string,
  sourceId: string,
  createdByProfileId?: string | null,
): Promise<Skill> {
  const source = await prisma.skill.findFirst({
    where: { id: sourceId, sharingScope: "public" }, // gate: only published skills are installable
    include: { files: true },
  });
  if (!source) notFound("Skill");
  if (source.workspaceId === currentWorkspaceId)
    badRequest("this skill already belongs to your workspace");

  let key = source.key;
  for (
    let i = 2;
    await prisma.skill.findFirst({ where: { workspaceId: currentWorkspaceId, key } });
    i++
  )
    key = `${source.key}-${i}`;

  return prisma.$transaction(async (tx) => {
    const skill = await tx.skill.create({
      data: {
        workspaceId: currentWorkspaceId,
        key,
        slug: slugify(source.name),
        name: source.name,
        markdown: source.markdown,
        description: source.description,
        categories: source.categories,
        icon: source.icon,
        color: source.color,
        tagline: source.tagline,
        author: source.author,
        homepage: source.homepage,
        sourceType: source.sourceType,
        trustLevel: source.trustLevel,
        sharingScope: "workspace", // the copy is private to the installer by default
        forkedFromSkillId: source.id,
        // F13: stamp catalog-install provenance so update-drift (F18) + reset (F20) work.
        originSkillId: source.id,
        originVersion: source.currentVersion,
        createdByProfileId: createdByProfileId ?? null,
        currentVersion: 1,
      },
    });
    await tx.skillVersion.create({
      data: {
        workspaceId: currentWorkspaceId,
        skillId: skill.id,
        revisionNumber: 1,
        content: source.markdown,
        createdByProfileId: createdByProfileId ?? null,
      },
    });
    if (source.files.length) {
      await tx.skillFile.createMany({
        data: source.files.map((f) => ({ skillId: skill.id, path: f.path, content: f.content })),
      });
    }
    await tx.skill.update({ where: { id: source.id }, data: { forkCount: { increment: 1 } } });
    return skill;
  });
}

/**
 * Import a skill from a package of files (parity Domain 5 F16): the SKILL.md (frontmatter → name/key/
 * description/tags) becomes the skill, the rest become skill files (path-safety checked, trust auto-
 * derived). Ports the shape of importCompanyPackage for skills. Rejects a package with no SKILL.md.
 */
export async function importSkillPackage(input: {
  workspaceId: string;
  files: { path: string; content: string }[];
  sourceRef?: string | null;
  createdByProfileId?: string | null;
  // Domain 5 real-import provenance. sourceType lets a resolved import (github/url/catalog) record its
  // origin precisely; packageName/originHash stamp verifiable provenance onto the created skill.
  sourceType?: SkillSourceType | null;
  packageName?: string | null;
  originHash?: string | null;
}): Promise<Skill> {
  const manifest = input.files.find((f) => /(^|\/)SKILL\.md$/i.test(f.path));
  if (!manifest) badRequest("package has no SKILL.md");
  const fm = parseSkillFrontmatter(manifest.content) ?? {};
  const name = (typeof fm.name === "string" && fm.name.trim()) || "Imported Skill";

  // De-dupe the frontmatter key against the workspace so a re-import (or catalog install) never
  // collides with an existing skill (createSkill rejects a duplicate key).
  const baseKey = (typeof fm.key === "string" && fm.key.trim()) || slugify(name);
  let key = baseKey;
  for (
    let i = 2;
    await prisma.skill.findFirst({ where: { workspaceId: input.workspaceId, key } });
    i++
  )
    key = `${baseKey}-${i}`;

  const sourceType: SkillSourceType = input.sourceType ?? (input.sourceRef ? "url" : "local_path");

  const skill = await createSkill({
    workspaceId: input.workspaceId,
    name,
    markdown: manifest.content,
    key,
    description: typeof fm.description === "string" ? fm.description : null,
    categories: Array.isArray(fm.tags) ? fm.tags : null,
    sourceType,
    createdByProfileId: input.createdByProfileId ?? null,
  });
  if (input.sourceRef || input.packageName || input.originHash)
    await prisma.skill.update({
      where: { id: skill.id },
      data: {
        sourceRef: input.sourceRef ?? null,
        packageName: input.packageName ?? null,
        originHash: input.originHash ?? null,
      },
    });

  // Attach the remaining files (SKILL.md is already the markdown). upsertSkillFile normalizes the path
  // (rejecting traversal) and re-derives trust, so a scripts/ file correctly raises the rung.
  for (const f of input.files) {
    if (f === manifest) continue;
    try {
      await upsertSkillFile(input.workspaceId, skill.id, { path: f.path, content: f.content });
    } catch {
      // skip an unsafe/invalid path rather than abort the whole import
    }
  }
  return prisma.skill.findUniqueOrThrow({ where: { id: skill.id } });
}

/**
 * Import a skill from an external *source spec* (Domain 5 real-import resolvers). Resolves a GitHub URL/
 * owner-repo, a raw http(s) URL, or an app-catalog ref (`catalog:<id|key>`) to the concrete SKILL.md
 * bundle + provenance, then installs it through the shared importSkillPackage path. The resolver layer
 * is pure/injectable; this wrapper just fetches + stamps provenance.
 */
export async function importSkillFromSource(input: {
  workspaceId: string;
  source: string;
  createdByProfileId?: string | null;
}): Promise<Skill> {
  const resolved = await resolveSkillSource(input.source).catch((err) => {
    badRequest(err instanceof Error ? err.message : "could not resolve skill source");
  });
  return importSkillPackage({
    workspaceId: input.workspaceId,
    files: resolved.files,
    sourceRef: resolved.provenance.sourceRef,
    sourceType: resolved.provenance.sourceType,
    packageName: resolved.provenance.packageName,
    originHash: resolved.provenance.originHash,
    createdByProfileId: input.createdByProfileId ?? null,
  });
}

/**
 * Install an app-shipped catalog entry by ref (id or key) through the same import path. Distinct from
 * installCatalogSkill (which copies a public cross-workspace skill row); this installs a curated,
 * content-addressed bundle we ship in-repo, stamping catalog provenance (packageName + contentHash).
 */
export async function importFromCatalog(input: {
  workspaceId: string;
  ref: string;
  createdByProfileId?: string | null;
}): Promise<Skill> {
  const entry = getCatalogEntry(input.ref);
  if (!entry) badRequest(`catalog skill "${input.ref}" not found`);
  return importSkillPackage({
    workspaceId: input.workspaceId,
    files: entry.files.map((f) => ({ path: f.path, content: f.content })),
    sourceRef: `catalog:${entry.id}`,
    sourceType: "catalog",
    packageName: entry.packageName,
    originHash: entry.contentHash,
    createdByProfileId: input.createdByProfileId ?? null,
  });
}

export type SkillUpdateState = "not_installed" | "up_to_date" | "update_available" | "origin_gone";

export interface SkillUpdateStatus {
  state: SkillUpdateState;
  originVersion: number | null; // the source version this install is pinned to
  latestVersion: number | null; // the source's current version now
}

/**
 * Compute a catalog-installed skill's update status (F18): compare the pinned origin version to the
 * source's current version. A skill with no origin is `not_installed`; a deleted/unpublished source is
 * `origin_gone`.
 */
export async function computeSkillUpdateStatus(
  workspaceId: string,
  skillId: string,
): Promise<SkillUpdateStatus> {
  const skill = await loadSkill(workspaceId, skillId);
  if (!skill.originSkillId)
    return { state: "not_installed", originVersion: null, latestVersion: null };
  const source = await prisma.skill.findFirst({
    where: { id: skill.originSkillId, sharingScope: "public" },
    select: { currentVersion: true },
  });
  if (!source)
    return { state: "origin_gone", originVersion: skill.originVersion, latestVersion: null };
  return {
    state: source.currentVersion > (skill.originVersion ?? 0) ? "update_available" : "up_to_date",
    originVersion: skill.originVersion,
    latestVersion: source.currentVersion,
  };
}

/**
 * Reset a catalog-installed skill to its origin's current content (F20): re-copy the source markdown +
 * files, snapshot a new local revision, and re-pin originVersion. Discards local edits. Rejects a skill
 * with no origin or whose source is gone.
 */
export async function resetSkillToOrigin(
  workspaceId: string,
  skillId: string,
  actorProfileId?: string | null,
): Promise<Skill> {
  const skill = await loadSkill(workspaceId, skillId);
  if (!skill.originSkillId) badRequest("this skill was not installed from a catalog");
  const source = await prisma.skill.findFirst({
    where: { id: skill.originSkillId, sharingScope: "public" },
    include: { files: true },
  });
  if (!source) badRequest("the origin skill is no longer available");

  return prisma.$transaction(async (tx) => {
    const nextRev = skill.currentVersion + 1;
    const updated = await tx.skill.update({
      where: { id: skill.id },
      data: {
        markdown: source.markdown,
        trustLevel: source.trustLevel,
        currentVersion: nextRev,
        originVersion: source.currentVersion,
      },
    });
    await tx.skillVersion.create({
      data: {
        workspaceId,
        skillId: skill.id,
        revisionNumber: nextRev,
        content: source.markdown,
        createdByProfileId: actorProfileId ?? null,
      },
    });
    // Replace files with the source's current set.
    await tx.skillFile.deleteMany({ where: { skillId: skill.id } });
    if (source.files.length) {
      await tx.skillFile.createMany({
        data: source.files.map((f) => ({
          skillId: skill.id,
          path: f.path,
          content: f.content,
          kind: classifySkillFile(f.path),
        })),
      });
    }
    return updated;
  });
}

export async function starSkill(
  workspaceId: string,
  skillId: string,
  profileId: string,
): Promise<number> {
  await loadSkill(workspaceId, skillId);
  const existing = await prisma.skillStar.findFirst({ where: { skillId, profileId } });
  if (existing) return (await prisma.skill.findUniqueOrThrow({ where: { id: skillId } })).starCount;
  const [, skill] = await prisma.$transaction([
    prisma.skillStar.create({ data: { workspaceId, skillId, profileId } }),
    prisma.skill.update({ where: { id: skillId }, data: { starCount: { increment: 1 } } }),
  ]);
  return skill.starCount;
}

export async function unstarSkill(
  workspaceId: string,
  skillId: string,
  profileId: string,
): Promise<number> {
  const res = await prisma.skillStar.deleteMany({ where: { skillId, profileId, workspaceId } });
  if (res.count === 0)
    return (await prisma.skill.findUniqueOrThrow({ where: { id: skillId } })).starCount;
  const skill = await prisma.skill.update({
    where: { id: skillId },
    data: { starCount: { decrement: 1 } },
  });
  return skill.starCount;
}

/** Recompute installCount = distinct agents assigned this skill. */
async function syncInstallCount(skillId: string) {
  const count = await prisma.agentSkill.count({ where: { skillId } });
  await prisma.skill.update({ where: { id: skillId }, data: { installCount: count } });
}

export async function assignSkillToAgent(args: {
  workspaceId: string;
  agentId: string;
  skillId: string;
  pinnedVersion?: number | null;
}) {
  await loadSkill(args.workspaceId, args.skillId);
  const agent = await prisma.agent.findFirst({
    where: { id: args.agentId, workspaceId: args.workspaceId },
    select: { id: true },
  });
  if (!agent) notFound("Agent");
  const dup = await prisma.agentSkill.findFirst({
    where: { agentId: args.agentId, skillId: args.skillId },
  });
  if (dup) badRequest("skill already assigned to this agent");
  const link = await prisma.agentSkill.create({
    data: {
      workspaceId: args.workspaceId,
      agentId: args.agentId,
      skillId: args.skillId,
      pinnedVersion: args.pinnedVersion ?? null,
    },
  });
  await syncInstallCount(args.skillId);
  return link;
}

export async function unassignSkillFromAgent(
  workspaceId: string,
  agentId: string,
  skillId: string,
): Promise<boolean> {
  const res = await prisma.agentSkill.deleteMany({ where: { agentId, skillId, workspaceId } });
  if (res.count === 0) return false;
  await syncInstallCount(skillId);
  return true;
}

// ─── Multi-file bundles ───────────────────────────────────────────
// Supporting files (path → content) attached to a skill. `markdown` remains the entry doc; these
// are additional bundle files. Content is stored/displayed only — never executed.
const MAX_FILE_PATH = 200;

/** Normalize + validate a bundle file path: no leading slash, no "..", no backslashes. */
export function normalizeSkillFilePath(raw: string): string {
  const path = raw.trim().replace(/^\/+/, "");
  if (!path) badRequest("file path is required");
  if (path.length > MAX_FILE_PATH) badRequest("file path is too long");
  if (path.includes("..") || path.includes("\\") || path.includes("//"))
    badRequest("file path may not contain '..', '\\\\', or '//'");
  return path;
}

/** Create or update a bundle file by path (idempotent per [skillId, path]). */
export async function upsertSkillFile(
  workspaceId: string,
  skillId: string,
  input: { path: string; content: string },
): Promise<SkillFile> {
  await loadSkill(workspaceId, skillId); // 404s cross-workspace / missing
  const path = normalizeSkillFilePath(input.path);
  const kind = classifySkillFile(path);
  const file = await prisma.skillFile.upsert({
    where: { skillId_path: { skillId, path } },
    create: { skillId, path, content: input.content, kind },
    update: { content: input.content, kind },
  });
  await recomputeSkillTrust(skillId); // F3: adding a script/asset raises the stored trust rung
  return file;
}

/** Recompute a skill's trust level from its current file set (F3). A script → scripts_executables. */
async function recomputeSkillTrust(skillId: string): Promise<void> {
  const files = await prisma.skillFile.findMany({ where: { skillId }, select: { path: true } });
  const derived = deriveSkillTrustLevel(files.map((f) => f.path));
  await prisma.skill.update({ where: { id: skillId }, data: { trustLevel: derived } });
}

export async function deleteSkillFile(
  workspaceId: string,
  skillId: string,
  path: string,
): Promise<boolean> {
  await loadSkill(workspaceId, skillId);
  const res = await prisma.skillFile.deleteMany({ where: { skillId, path } });
  if (res.count > 0) await recomputeSkillTrust(skillId); // removing a script may lower the rung
  return res.count > 0;
}

export async function listSkillFiles(workspaceId: string, skillId: string): Promise<SkillFile[]> {
  await loadSkill(workspaceId, skillId);
  return prisma.skillFile.findMany({ where: { skillId }, orderBy: { path: "asc" } });
}

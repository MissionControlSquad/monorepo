/**
 * Tier D / Phase 3 keystone — Environment CRUD (ported from Paperclip's environments service).
 *
 * An Environment is a durable, workspace-scoped model of "where and how a run executes": a `driver`
 * (local | ssh | sandbox | plugin), a driver-specific `config`, an `envVars` bag merged into the run
 * env, and `metadata`. Config secrets are stored ONLY as {secretRef:{name}} pointers into the
 * per-workspace vault — never plaintext — and are resolved server-side at run/probe time. Read paths
 * return a MASKED `configPublic` so no secret value ever reaches the client.
 *
 * Security: every query/mutation is workspace-scoped; mutations are ENVIRONMENTS-flag-gated + admin
 * (enforced at the GraphQL layer). Deletion is guarded by a blast-radius check (referencing agents).
 */
import { GraphQLError } from "graphql";
import { z } from "zod";
import { prisma } from "@/server/prisma";
import type { Environment, Prisma } from "@agentcenter/database";
import { getSandboxProvider, listSandboxProviders } from "./sandbox-providers";

export const ENVIRONMENT_DRIVERS = ["local", "ssh", "sandbox", "plugin"] as const;
export type EnvironmentDriver = (typeof ENVIRONMENT_DRIVERS)[number];

function badRequest(message: string): never {
  throw new GraphQLError(message, { extensions: { code: "BAD_USER_INPUT" } });
}
function notFound(): never {
  throw new GraphQLError("Environment not found", { extensions: { code: "NOT_FOUND" } });
}

// ── per-driver config validation ──────────────────────────────────────────────
// A secret-bearing field is either a literal string OR a {secretRef:{name}} pointer (persisted form).
const secretRef = z.object({ secretRef: z.object({ name: z.string().min(1) }) });
const stringOrSecretRef = z.union([z.string(), secretRef]);

const DRIVER_CONFIG_SCHEMAS = {
  local: z.object({}).passthrough(),
  ssh: z.object({
    host: z.string().min(1, "ssh config requires a host"),
    port: z.number().int().positive().optional(),
    username: z.string().min(1).optional(),
    privateKey: stringOrSecretRef.optional(),
  }),
  sandbox: z.object({
    provider: z.string().min(1, "sandbox config requires a provider key"),
    image: z.string().optional(),
    region: z.string().optional(),
  }),
  plugin: z
    .object({
      pluginKey: z.string().min(1, "plugin config requires a pluginKey"),
    })
    .passthrough(),
} as const;

function validateDriverConfig(driver: EnvironmentDriver, config: unknown): Record<string, unknown> {
  const schema = DRIVER_CONFIG_SCHEMAS[driver];
  const parsed = schema.safeParse(config ?? {});
  if (!parsed.success) {
    badRequest(`Invalid ${driver} config: ${parsed.error.issues.map((i) => i.message).join("; ")}`);
  }
  // For a sandbox driver, the provider key must be a real registered provider.
  if (driver === "sandbox") {
    const provider = (parsed.data as { provider: string }).provider;
    if (!getSandboxProvider(provider)) badRequest(`Unknown sandbox provider: ${provider}`);
  }
  return parsed.data as Record<string, unknown>;
}

// ── config secret masking (read path) ──────────────────────────────────────────
function isSecretRef(v: unknown): v is { secretRef: { name: string } } {
  return typeof v === "object" && v !== null && "secretRef" in v;
}

/** Mask a persisted config for return to the client: secret-refs become "secret:<name>", never values. */
export function maskConfig(config: unknown): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries((config ?? {}) as Record<string, unknown>)) {
    out[k] = isSecretRef(v) ? `secret:${v.secretRef.name}` : v;
  }
  return out;
}

/** Resolve a persisted config's secret-refs into plaintext (server-side only — for run/probe). */
export async function resolveConfigSecrets(
  config: unknown,
  resolveSecret: (name: string) => Promise<string | null>,
): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries((config ?? {}) as Record<string, unknown>)) {
    if (isSecretRef(v)) {
      const value = await resolveSecret(v.secretRef.name);
      if (value == null)
        badRequest(`Environment config references a missing secret: ${v.secretRef.name}`);
      out[k] = value;
    } else {
      out[k] = v;
    }
  }
  return out;
}

// ── CRUD ────────────────────────────────────────────────────────────────────
export type SafeEnvironment = Omit<Environment, "config"> & {
  configPublic: Record<string, unknown>;
};

/** Strip secret values from an environment before it leaves the server. */
export function toSafeEnvironment(env: Environment): SafeEnvironment {
  const { config, ...rest } = env;
  return { ...rest, configPublic: maskConfig(config) };
}

export async function listEnvironments(workspaceId: string): Promise<SafeEnvironment[]> {
  const envs = await prisma.environment.findMany({
    where: { workspaceId },
    orderBy: [{ status: "asc" }, { createdAt: "asc" }],
  });
  return envs.map(toSafeEnvironment);
}

export async function getEnvironment(workspaceId: string, id: string): Promise<SafeEnvironment> {
  const env = await prisma.environment.findFirst({ where: { id, workspaceId } });
  if (!env) notFound();
  return toSafeEnvironment(env);
}

export interface EnvironmentInput {
  name: string;
  description?: string | null;
  driver: EnvironmentDriver;
  config?: unknown;
  envVars?: Record<string, string>;
  metadata?: Record<string, unknown> | null;
}

export async function createEnvironment(
  workspaceId: string,
  input: EnvironmentInput,
  createdByProfileId?: string | null,
): Promise<SafeEnvironment> {
  const name = input.name?.trim();
  if (!name) badRequest("Environment name is required");
  if (!ENVIRONMENT_DRIVERS.includes(input.driver)) badRequest(`Unknown driver: ${input.driver}`);
  const config = validateDriverConfig(input.driver, input.config);

  // App-layer singleton guards (the DB has race-proof partial-unique backstops via migration): at most
  // one `local` env and one managed `sandbox` env per workspace.
  if (input.driver === "local") {
    const existingLocal = await prisma.environment.findFirst({
      where: { workspaceId, driver: "local" },
      select: { id: true },
    });
    if (existingLocal) {
      throw new GraphQLError("A local environment already exists in this workspace", {
        extensions: { code: "CONFLICT" },
      });
    }
  }
  const isManagedSandbox =
    input.driver === "sandbox" &&
    (input.metadata as { managed?: unknown } | null)?.managed === true;
  if (isManagedSandbox) {
    const existingManaged = await prisma.environment.findFirst({
      where: { workspaceId, driver: "sandbox", metadata: { path: ["managed"], equals: true } },
      select: { id: true },
    });
    if (existingManaged) {
      throw new GraphQLError("A managed sandbox environment already exists in this workspace", {
        extensions: { code: "CONFLICT" },
      });
    }
  }

  try {
    const env = await prisma.environment.create({
      data: {
        workspaceId,
        name,
        description: input.description ?? null,
        driver: input.driver,
        config: config as Prisma.InputJsonValue,
        envVars: (input.envVars ?? {}) as Prisma.InputJsonValue,
        metadata: (input.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
        createdByProfileId: createdByProfileId ?? null,
      },
    });
    return toSafeEnvironment(env);
  } catch (err) {
    throw mapUniqueError(err, input.driver, name);
  }
}

export async function updateEnvironment(
  workspaceId: string,
  id: string,
  input: Partial<EnvironmentInput>,
): Promise<SafeEnvironment> {
  const existing = await prisma.environment.findFirst({ where: { id, workspaceId } });
  if (!existing) notFound();

  const driver = (input.driver ?? existing.driver) as EnvironmentDriver;
  const data: Record<string, unknown> = {};
  if (input.name !== undefined) {
    const name = input.name.trim();
    if (!name) badRequest("Environment name cannot be empty");
    data.name = name;
  }
  if (input.description !== undefined) data.description = input.description;
  if (input.driver !== undefined) data.driver = input.driver;
  if (input.config !== undefined || input.driver !== undefined) {
    data.config = validateDriverConfig(driver, input.config ?? existing.config);
  }
  if (input.envVars !== undefined) data.envVars = input.envVars;
  if (input.metadata !== undefined) data.metadata = input.metadata ?? undefined;

  try {
    const env = await prisma.environment.update({
      where: { id },
      data: data as Prisma.EnvironmentUpdateInput,
    });
    return toSafeEnvironment(env);
  } catch (err) {
    throw mapUniqueError(err, driver, (data.name as string) ?? existing.name);
  }
}

export async function archiveEnvironment(
  workspaceId: string,
  id: string,
): Promise<SafeEnvironment> {
  const existing = await prisma.environment.findFirst({ where: { id, workspaceId } });
  if (!existing) notFound();
  const env = await prisma.environment.update({ where: { id }, data: { status: "archived" } });
  return toSafeEnvironment(env);
}

// ── idempotent singletons ──────────────────────────────────────────────────────
export async function ensureLocalEnvironment(workspaceId: string): Promise<SafeEnvironment> {
  const existing = await prisma.environment.findFirst({ where: { workspaceId, driver: "local" } });
  if (existing) return toSafeEnvironment(existing);
  const env = await prisma.environment.create({
    data: { workspaceId, name: "Local", driver: "local", config: {}, metadata: { seeded: true } },
  });
  return toSafeEnvironment(env);
}

export async function ensureManagedSandboxEnvironment(
  workspaceId: string,
  providerKey: string,
): Promise<SafeEnvironment> {
  if (!getSandboxProvider(providerKey)) badRequest(`Unknown sandbox provider: ${providerKey}`);
  const existing = await prisma.environment.findFirst({
    where: { workspaceId, driver: "sandbox", metadata: { path: ["managed"], equals: true } },
  });
  if (existing) return toSafeEnvironment(existing);
  const env = await prisma.environment.create({
    data: {
      workspaceId,
      name: `Managed sandbox (${providerKey})`,
      driver: "sandbox",
      config: { provider: providerKey },
      metadata: { managed: true, seeded: true },
    },
  });
  return toSafeEnvironment(env);
}

// ── delete blast-radius + guarded delete ────────────────────────────────────────
export interface DeleteBlastRadius {
  deletable: boolean;
  referencingAgentCount: number;
  reasons: string[];
}

export async function getEnvironmentDeleteBlastRadius(
  workspaceId: string,
  id: string,
): Promise<DeleteBlastRadius> {
  const env = await prisma.environment.findFirst({ where: { id, workspaceId } });
  if (!env) notFound();
  const referencingAgentCount = await prisma.agent.count({
    where: { workspaceId, environmentId: id },
  });
  const reasons: string[] = [];
  if (referencingAgentCount > 0) {
    reasons.push(`${referencingAgentCount} agent(s) reference this environment`);
  }
  return { deletable: reasons.length === 0, referencingAgentCount, reasons };
}

export async function removeEnvironmentIfDeletable(
  workspaceId: string,
  id: string,
): Promise<boolean> {
  const blast = await getEnvironmentDeleteBlastRadius(workspaceId, id);
  if (!blast.deletable) {
    throw new GraphQLError(`Cannot delete environment: ${blast.reasons.join("; ")}`, {
      extensions: { code: "FORBIDDEN" },
    });
  }
  await prisma.environment.delete({ where: { id } });
  return true;
}

// ── capabilities matrix (feature 21) ────────────────────────────────────────────
export interface EnvironmentCapabilities {
  drivers: EnvironmentDriver[];
  sandboxProviders: {
    key: string;
    displayName: string;
    isolating: boolean;
    credentialKeys: string[];
  }[];
}

export function getEnvironmentCapabilities(): EnvironmentCapabilities {
  return {
    drivers: [...ENVIRONMENT_DRIVERS],
    sandboxProviders: listSandboxProviders().map((p) => ({
      key: p.key,
      displayName: p.displayName,
      isolating: p.isolating,
      credentialKeys: p.credentialKeys,
    })),
  };
}

// ── helpers ──────────────────────────────────────────────────────────────────
function mapUniqueError(err: unknown, driver: string, name: string): GraphQLError {
  const code = (err as { code?: string })?.code;
  if (code === "P2002") {
    const target = String((err as { meta?: { target?: unknown } })?.meta?.target ?? "");
    if (target.includes("one_local")) {
      return new GraphQLError("A local environment already exists in this workspace", {
        extensions: { code: "CONFLICT" },
      });
    }
    if (target.includes("one_managed_sandbox")) {
      return new GraphQLError("A managed sandbox environment already exists in this workspace", {
        extensions: { code: "CONFLICT" },
      });
    }
    return new GraphQLError(`An environment named "${name}" already exists`, {
      extensions: { code: "CONFLICT" },
    });
  }
  return err instanceof GraphQLError
    ? err
    : new GraphQLError(`Failed to save ${driver} environment`, {
        extensions: { code: "INTERNAL" },
      });
}

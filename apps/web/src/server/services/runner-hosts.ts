/**
 * Tier D: registered BYO servers (public IP + SSH) the control plane can run raw commands on
 * directly. The private key is encrypted at rest (SSH_KEY_ENCRYPTION_SECRET) and NEVER returned by
 * any read path — only its presence. Mirrors the CloudVM key handling + the secrets-vault boundary.
 */
import { GraphQLError } from "graphql";
import { prisma } from "@/server/prisma";
import type { RunnerHost } from "@agentcenter/database";
import { encryptPrivateKey, decryptPrivateKey } from "./ssh-keys";
import { env } from "../env";
import type { SSHConfig } from "./ssh";
import { badRequest } from "./service-errors";

/** A host with the secret stripped — the only shape any read path returns. */
export type SafeRunnerHost = Omit<RunnerHost, "sshPrivateKey">;
export function stripHostKey(h: RunnerHost): SafeRunnerHost {
  const { sshPrivateKey: _k, ...safe } = h;
  void _k;
  return safe;
}

function encryptKey(privateKey: string): string {
  if (env.SSH_KEY_ENCRYPTION_SECRET) {
    return encryptPrivateKey(privateKey, env.SSH_KEY_ENCRYPTION_SECRET);
  }
  // Never persist an SSH private key in plaintext in production — fail closed. (Provisioned Hetzner
  // hosts generate a root-access key through this path, so a missing secret would store it in the
  // clear.) Dev/test fall back to raw, mirroring the secrets-vault dev behavior.
  if (env.NODE_ENV === "production") {
    throw new Error(
      "SSH_KEY_ENCRYPTION_SECRET must be set to store SSH private keys (refusing to persist plaintext at rest).",
    );
  }
  return privateKey;
}

/** Build an SSHConfig for a host, decrypting its key. Server-internal only — never exposed. */
export function getHostSSHConfig(host: {
  host: string;
  port: number;
  username: string;
  sshPrivateKey: string;
}): SSHConfig {
  const privateKey = env.SSH_KEY_ENCRYPTION_SECRET
    ? decryptPrivateKey(host.sshPrivateKey, env.SSH_KEY_ENCRYPTION_SECRET)
    : host.sshPrivateKey;
  return { host: host.host, port: host.port, username: host.username, privateKey };
}

export async function createRunnerHost(input: {
  workspaceId: string;
  name: string;
  host: string;
  port?: number | null;
  username?: string | null;
  privateKey: string;
  createdByProfileId?: string | null;
}): Promise<SafeRunnerHost> {
  const name = input.name.trim();
  const host = input.host.trim();
  if (!name) badRequest("name is required");
  if (!host) badRequest("host is required");
  if (!input.privateKey.trim()) badRequest("privateKey is required");
  if (input.port != null && (!Number.isInteger(input.port) || input.port <= 0))
    badRequest("port must be a positive integer");
  const created = await prisma.runnerHost.create({
    data: {
      workspaceId: input.workspaceId,
      name,
      host,
      port: input.port ?? 22,
      username: input.username?.trim() || "root",
      sshPrivateKey: encryptKey(input.privateKey),
      createdByProfileId: input.createdByProfileId ?? null,
    },
  });
  return stripHostKey(created);
}

export async function listRunnerHosts(workspaceId: string): Promise<SafeRunnerHost[]> {
  const hosts = await prisma.runnerHost.findMany({
    where: { workspaceId },
    orderBy: { createdAt: "desc" },
  });
  return hosts.map(stripHostKey);
}

export async function deleteRunnerHost(workspaceId: string, id: string): Promise<boolean> {
  const res = await prisma.runnerHost.deleteMany({ where: { id, workspaceId } });
  return res.count > 0;
}

/** Internal: resolve the SSHConfig for a host in a workspace (throws if not found). */
export async function resolveHostSSHConfig(
  workspaceId: string,
  hostId: string,
): Promise<SSHConfig> {
  const host = await prisma.runnerHost.findFirst({ where: { id: hostId, workspaceId } });
  if (!host) throw new GraphQLError("Runner host not found", { extensions: { code: "NOT_FOUND" } });
  return getHostSSHConfig(host);
}

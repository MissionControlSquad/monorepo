/**
 * BYO Hetzner host provisioner. Provisions a VM on the CUSTOMER's Hetzner account (their API token,
 * resolved from the workspace secrets vault — never an operator env token) and registers it as a
 * RunnerHost, so it immediately flows through the unified BYO host path (raw RunnerCommand `host`
 * target, terminal, and the runner daemon). A provisioned host is just a RunnerHost — there is no
 * separate CloudVM model.
 *
 * The box is bare Ubuntu: usable at once for raw commands / terminal (install any CLI/runtime over
 * SSH). Installing an agent runtime (OpenClaw / the runner daemon) is a separate, later concern.
 */
import { createServer, createSSHKey, deleteServer, deleteSSHKey } from "./hetzner";
import { generateSSHKeyPair } from "./ssh-keys";
import { createRunnerHost, type SafeRunnerHost } from "./runner-hosts";
import { resolveWorkspaceSecret } from "./secrets";

/** Vault secret name that holds the workspace's own Hetzner API token (BYO). */
export const HETZNER_TOKEN_SECRET = "HETZNER_API_TOKEN";

const DEFAULT_REGION = "ash"; // Ashburn, VA
const DEFAULT_SERVER_TYPE = "cpx11";
const IMAGE = "ubuntu-24.04";

/** DNS-safe server name derived from the requested host name. */
function serverName(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return `agentcenter-${base || "host"}-${Date.now().toString(36)}`.slice(0, 63);
}

/**
 * Provision a Hetzner VM on the workspace's own account and register it as a RunnerHost.
 * Requires the HETZNER_API_TOKEN secret in the workspace vault. Best-effort cleanup on failure.
 *
 * Returns as soon as Hetzner assigns the server + its IPv4 (at create time) — the box finishes booting
 * on its own; the first SSH command/terminal reaches it once cloud-init completes. Non-blocking, so no
 * long-running request and no orphaned server from a timed-out wait.
 */
export async function provisionHetznerHost(input: {
  workspaceId: string;
  name: string;
  region?: string;
  serverType?: string;
  createdByProfileId?: string | null;
}): Promise<SafeRunnerHost> {
  const token = (await resolveWorkspaceSecret(input.workspaceId, HETZNER_TOKEN_SECRET))?.trim();
  if (!token) {
    throw new Error(
      `Hetzner is not configured for this workspace — add ${HETZNER_TOKEN_SECRET} to the workspace secrets vault.`,
    );
  }

  const region = input.region?.trim() || DEFAULT_REGION;
  const type = input.serverType?.trim() || DEFAULT_SERVER_TYPE;
  // Scrub inputs before they reach the customer's Hetzner API (Hetzner ids are lowercase
  // alphanumeric + hyphens); reject junk with a clear error instead of an opaque API failure.
  const SAFE_ID = /^[a-z0-9-]{1,32}$/;
  if (!SAFE_ID.test(region)) throw new Error(`Invalid Hetzner region: "${region}".`);
  if (!SAFE_ID.test(type)) throw new Error(`Invalid Hetzner server type: "${type}".`);
  const { publicKey, privateKey } = generateSSHKeyPair();
  const name = serverName(input.name);

  // Register our generated public key on the customer's Hetzner project.
  const sshKey = await createSSHKey(
    { name, publicKey, labels: { agentcenter: "runner-host" } },
    token,
  );

  let serverId: string | undefined;
  try {
    const server = await createServer(
      {
        name,
        serverType: type,
        image: IMAGE,
        location: region,
        sshKeys: [sshKey.sshKeyId],
        labels: { agentcenter: "runner-host", workspace: input.workspaceId },
      },
      token,
    );
    serverId = server.serverId;
    if (!server.ipv4) {
      throw new Error("Hetzner did not return an IPv4 for the new server.");
    }

    return await createRunnerHost({
      workspaceId: input.workspaceId,
      name: input.name.trim() || name,
      host: server.ipv4,
      username: "root",
      privateKey,
      createdByProfileId: input.createdByProfileId ?? null,
      provider: "hetzner",
      externalServerId: serverId,
    });
  } catch (err) {
    if (serverId) await deleteServer(serverId, token).catch(() => {});
    await deleteSSHKey(sshKey.sshKeyId, token).catch(() => {});
    throw err;
  }
}

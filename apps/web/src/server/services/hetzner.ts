/**
 * @deprecated Hetzner API client for the operator-MANAGED cloud-VM path. This whole path is
 * deprecated — all infrastructure is now bring-your-own (BYO runner daemon / registered SSH host /
 * BYO sandbox providers). No new managed VMs are provisioned (provisioning routes are gated behind
 * the default-off CLOUD_VMS flag). Retained for reversibility; do not build new features on it.
 * NOTE: the OpenClaw *runtime* is NOT deprecated — it stays first-class via the live-gateway bridge
 * and the BYO runner + adapter registry, neither of which imports this file.
 */
import { env } from "../env";

const BASE_URL = "https://api.hetzner.cloud/v1";

interface HetznerServerResponse {
  server: {
    id: number;
    name: string;
    status: string;
    public_net: {
      ipv4: { ip: string };
      ipv6: { ip: string };
    };
  };
}

interface HetznerActionResponse {
  action: {
    id: number;
    status: string;
    command: string;
  };
}

interface HetznerSSHKeyResponse {
  ssh_key: {
    id: number;
    name: string;
    fingerprint: string;
    public_key: string;
  };
}

interface CreateServerConfig {
  name: string;
  serverType: string;
  image: string;
  location: string;
  userData?: string;
  sshKeys?: string[];
  firewallIds?: number[];
  labels?: Record<string, string>;
}

async function hetznerFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = env.HETZNER_API_TOKEN;
  if (!token) {
    throw new Error("HETZNER_API_TOKEN is not configured");
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Hetzner API error ${res.status}: ${body}`);
  }

  return res.json() as Promise<T>;
}

export async function createServer(config: CreateServerConfig): Promise<{
  serverId: string;
  ipv4: string;
  status: string;
}> {
  const body: Record<string, unknown> = {
    name: config.name,
    server_type: config.serverType,
    image: config.image,
    location: config.location,
    ...(config.userData ? { user_data: config.userData } : {}),
    start_after_create: true,
    labels: config.labels || {},
  };

  if (config.sshKeys && config.sshKeys.length > 0) {
    body.ssh_keys = config.sshKeys;
  }

  if (config.firewallIds && config.firewallIds.length > 0) {
    body.firewalls = config.firewallIds.map((id) => ({ firewall: id }));
  }

  const data = await hetznerFetch<HetznerServerResponse>("/servers", {
    method: "POST",
    body: JSON.stringify(body),
  });

  return {
    serverId: String(data.server.id),
    ipv4: data.server.public_net.ipv4.ip,
    status: data.server.status,
  };
}

export async function getServer(serverId: string): Promise<{
  status: string;
  ipv4: string;
  name: string;
}> {
  const data = await hetznerFetch<HetznerServerResponse>(`/servers/${serverId}`);
  return {
    status: data.server.status,
    ipv4: data.server.public_net.ipv4.ip,
    name: data.server.name,
  };
}

export async function powerOn(serverId: string): Promise<void> {
  await hetznerFetch<HetznerActionResponse>(`/servers/${serverId}/actions/poweron`, {
    method: "POST",
  });
}

export async function powerOff(serverId: string): Promise<void> {
  await hetznerFetch<HetznerActionResponse>(`/servers/${serverId}/actions/poweroff`, {
    method: "POST",
  });
}

export async function deleteServer(serverId: string): Promise<void> {
  await hetznerFetch<unknown>(`/servers/${serverId}`, {
    method: "DELETE",
  });
}

export async function createSSHKey(params: {
  name: string;
  publicKey: string;
  labels?: Record<string, string>;
}): Promise<{ sshKeyId: string; fingerprint: string }> {
  const data = await hetznerFetch<HetznerSSHKeyResponse>("/ssh_keys", {
    method: "POST",
    body: JSON.stringify({
      name: params.name,
      public_key: params.publicKey,
      labels: params.labels || {},
    }),
  });

  return {
    sshKeyId: String(data.ssh_key.id),
    fingerprint: data.ssh_key.fingerprint,
  };
}

export async function deleteSSHKey(sshKeyId: string): Promise<void> {
  await hetznerFetch<unknown>(`/ssh_keys/${sshKeyId}`, {
    method: "DELETE",
  });
}

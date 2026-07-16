/**
 * Hetzner Cloud API client. BYO: every call REQUIRES a `token` — the customer's Hetzner API token,
 * resolved from their workspace secrets vault by the caller (hetzner-provision.ts). We provision on
 * THEIR account and never hold an operator token. There is no env fallback.
 */

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

async function hetznerFetch<T>(path: string, options: RequestInit, token: string): Promise<T> {
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

export async function createServer(
  config: CreateServerConfig,
  token: string,
): Promise<{
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

  const data = await hetznerFetch<HetznerServerResponse>(
    "/servers",
    { method: "POST", body: JSON.stringify(body) },
    token,
  );

  return {
    serverId: String(data.server.id),
    ipv4: data.server.public_net.ipv4.ip,
    status: data.server.status,
  };
}

export async function getServer(
  serverId: string,
  token: string,
): Promise<{
  status: string;
  ipv4: string;
  name: string;
}> {
  const data = await hetznerFetch<HetznerServerResponse>(`/servers/${serverId}`, {}, token);
  return {
    status: data.server.status,
    ipv4: data.server.public_net.ipv4.ip,
    name: data.server.name,
  };
}

export async function powerOn(serverId: string, token: string): Promise<void> {
  await hetznerFetch<HetznerActionResponse>(
    `/servers/${serverId}/actions/poweron`,
    { method: "POST" },
    token,
  );
}

export async function powerOff(serverId: string, token: string): Promise<void> {
  await hetznerFetch<HetznerActionResponse>(
    `/servers/${serverId}/actions/poweroff`,
    { method: "POST" },
    token,
  );
}

export async function deleteServer(serverId: string, token: string): Promise<void> {
  await hetznerFetch<unknown>(`/servers/${serverId}`, { method: "DELETE" }, token);
}

export async function createSSHKey(
  params: {
    name: string;
    publicKey: string;
    labels?: Record<string, string>;
  },
  token: string,
): Promise<{ sshKeyId: string; fingerprint: string }> {
  const data = await hetznerFetch<HetznerSSHKeyResponse>(
    "/ssh_keys",
    {
      method: "POST",
      body: JSON.stringify({
        name: params.name,
        public_key: params.publicKey,
        labels: params.labels || {},
      }),
    },
    token,
  );

  return {
    sshKeyId: String(data.ssh_key.id),
    fingerprint: data.ssh_key.fingerprint,
  };
}

export async function deleteSSHKey(sshKeyId: string, token: string): Promise<void> {
  await hetznerFetch<unknown>(`/ssh_keys/${sshKeyId}`, { method: "DELETE" }, token);
}

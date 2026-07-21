/**
 * Cloudflare sandbox provider — ported from Paperclip's cloudflare plugin. The `@cloudflare/sandbox`
 * SDK only runs INSIDE a Cloudflare Worker (Durable Object + Container bindings), so our Node control
 * plane cannot call it directly. Instead — exactly like Paperclip — we talk to a companion **bridge
 * Worker** over REST with a static bearer token. That is why the credentials here are a bridge URL +
 * token, NOT a Cloudflare account API token. The bridge Worker (Paperclip's bridge-template, deployed
 * via `wrangler`) is what holds the real Cloudflare account credentials.
 *
 * Provision: POST {base}/api/paperclip-sandbox/v1/leases/acquire → {providerLeaseId, metadata}.
 * Exec: POST {base}/api/paperclip-sandbox/v1/exec → {exitCode, stdout, stderr, timedOut}.
 * Destroy: DELETE {base}/api/paperclip-sandbox/v1/leases/{providerLeaseId}.
 */
import { defineCloudProvider, type SandboxHandle } from "./types";
import { guardedFetch } from "@agentcenter/utils/remote-http-endpoint-guard";

const API_PREFIX = "/api/paperclip-sandbox/v1";
const DEFAULT_CWD = "/workspace/paperclip";
const DEFAULT_TIMEOUT_MS = 300_000;

interface AcquireResponse {
  providerLeaseId: string;
  metadata?: { remoteCwd?: string };
}
interface ExecResponse {
  exitCode: number | null;
  stdout?: string;
  stderr?: string;
  timedOut?: boolean;
}

function bridgeUrl(base: string, path: string): string {
  return `${base.replace(/\/+$/, "")}${API_PREFIX}${path}`;
}

export const cloudflareProvider = defineCloudProvider({
  key: "cloudflare",
  displayName: "Cloudflare",
  credentialKeys: ["CLOUDFLARE_SANDBOX_BRIDGE_URL", "CLOUDFLARE_SANDBOX_BRIDGE_TOKEN"],
  provision: async (creds): Promise<SandboxHandle> => {
    const base = creds.CLOUDFLARE_SANDBOX_BRIDGE_URL;
    const token = creds.CLOUDFLARE_SANDBOX_BRIDGE_TOKEN;
    const headers = {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    };

    const acquireRes = await guardedFetch(bridgeUrl(base, "/leases/acquire"), {
      method: "POST",
      headers,
      body: JSON.stringify({
        reuseLease: false,
        requestedCwd: DEFAULT_CWD,
        timeoutMs: DEFAULT_TIMEOUT_MS,
      }),
    });
    const acquireText = await acquireRes.text();
    if (!acquireRes.ok) {
      throw new Error(
        `Cloudflare bridge acquire failed (${acquireRes.status}): ${acquireText.slice(0, 500)}`,
      );
    }
    const lease = JSON.parse(acquireText) as AcquireResponse;
    const remoteCwd = lease.metadata?.remoteCwd ?? DEFAULT_CWD;

    return {
      id: lease.providerLeaseId,
      providerKey: "cloudflare",
      exec: async (command, opts) => {
        const res = await guardedFetch(bridgeUrl(base, "/exec"), {
          method: "POST",
          headers,
          body: JSON.stringify({
            providerLeaseId: lease.providerLeaseId,
            command,
            args: [],
            cwd: opts?.cwd ?? remoteCwd,
            env: {},
            stdin: null,
            timeoutMs: opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS,
          }),
        });
        const text = await res.text();
        if (!res.ok) {
          throw new Error(`Cloudflare bridge exec failed (${res.status}): ${text.slice(0, 500)}`);
        }
        const r = JSON.parse(text) as ExecResponse;
        return {
          exitCode: r.timedOut ? 124 : (r.exitCode ?? 1),
          stdout: r.stdout ?? "",
          stderr: r.stderr ?? "",
        };
      },
      destroy: async () => {
        await guardedFetch(
          bridgeUrl(base, `/leases/${encodeURIComponent(lease.providerLeaseId)}`),
          {
            method: "DELETE",
            headers,
          },
        ).catch(() => {});
      },
    };
  },
});

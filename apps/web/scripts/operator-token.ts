/**
 * Operator token persistence (parity — deployment/CLI §3, `token`). The DB-backed half of the operator
 * `token` command: it REUSES the existing workspace-scoped ApiKey model + services (Epic #12) — the
 * same credential the runner logs in with (`mc_…` bearer). The plaintext is shown once at mint; only
 * keyHash (sha256) + keyPrefix are stored. Revoke tombstones (never hard-deletes) for audit.
 *
 * Invoked by scripts/operator.mjs via tsx (needs .env for the DB + `@/` alias). Not meant to be run
 * directly by users — go through `npm run operator token …`.
 *
 * Usage:
 *   operator-token mint   --name <n> --workspace <id> [--expires <iso>]
 *   operator-token list   --workspace <id>
 *   operator-token revoke --id <keyId> --workspace <id>
 */
import { mintApiKey, listApiKeys, revokeApiKey } from "../src/server/services/api-keys";
import { redactKey, isApiKeyActive } from "@agentcenter/utils";

const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";
const DIM = "\x1b[2m";
const RESET = "\x1b[0m";

function parseFlags(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith("--")) {
        out[key] = next;
        i++;
      } else {
        out[key] = "true";
      }
    }
  }
  return out;
}

function fail(msg: string): never {
  console.error(`${RED}✗ token: ${msg}${RESET}`);
  process.exit(1);
}

function resolveWorkspace(flags: Record<string, string>): string {
  const ws = flags.workspace || process.env.AGENTCENTER_WORKSPACE_ID;
  if (!ws || !ws.trim()) {
    fail("a workspace is required — pass --workspace <id> or set AGENTCENTER_WORKSPACE_ID");
  }
  return ws.trim();
}

async function main(): Promise<void> {
  const [sub, ...rest] = process.argv.slice(2);
  const flags = parseFlags(rest);

  if (sub === "mint") {
    const name = flags.name;
    if (!name || !name.trim()) fail("mint requires --name <label>");
    const workspaceId = resolveWorkspace(flags);
    const expiresAt = flags.expires ? new Date(flags.expires) : null;
    if (expiresAt && Number.isNaN(expiresAt.getTime()))
      fail(`invalid --expires date: ${flags.expires}`);
    const { apiKey, plainKey } = await mintApiKey({ workspaceId, name: name.trim(), expiresAt });
    console.log(
      `${GREEN}✓ minted token '${apiKey.name}' (${apiKey.keyPrefix}…) in workspace ${workspaceId}${RESET}`,
    );
    console.log(
      `${YELLOW}Copy it now — it is shown only once and cannot be retrieved again:${RESET}`,
    );
    console.log(`\n  ${plainKey}\n`);
    console.log(
      `${DIM}Use it as the runner credential: agentcenter-runner login --api-url <url> --api-key ${apiKey.keyPrefix}…${RESET}`,
    );
    return;
  }

  if (sub === "list") {
    const workspaceId = resolveWorkspace(flags);
    const keys = await listApiKeys(workspaceId);
    if (!keys.length) {
      console.log(`${DIM}no tokens in workspace ${workspaceId}${RESET}`);
      return;
    }
    console.log(`Tokens in workspace ${workspaceId}:`);
    for (const k of keys) {
      const active = isApiKeyActive(k);
      const state = k.revokedAt
        ? `${RED}revoked${RESET}`
        : active
          ? `${GREEN}active${RESET}`
          : `${YELLOW}expired${RESET}`;
      console.log(`  ${redactKey(k.keyPrefix)}  ${state}  ${k.name}  ${DIM}id=${k.id}${RESET}`);
    }
    return;
  }

  if (sub === "revoke") {
    const id = flags.id;
    if (!id || !id.trim()) fail("revoke requires --id <keyId>");
    const workspaceId = resolveWorkspace(flags);
    const revoked = await revokeApiKey(workspaceId, id.trim());
    console.log(`${GREEN}✓ revoked token '${revoked.name}' (${revoked.keyPrefix}…)${RESET}`);
    return;
  }

  fail(`unknown token subcommand: ${sub ?? "(none)"} (expected mint | list | revoke)`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(`${RED}✗ token: ${err instanceof Error ? err.message : String(err)}${RESET}`);
    process.exit(1);
  });

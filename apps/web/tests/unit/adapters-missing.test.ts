import { describe, it, expect } from "vitest";
import {
  getAdapter,
  isAdapterKey,
  canonicalAdapterKey,
  buildAdapterInvocation,
  BUILTIN_ADAPTER_KEYS,
  type AdapterInvocation,
} from "@agentcenter/utils";

// Parity gap (.paperclip-parity/02-adapters-runtimes.mdx §4.8): Paperclip ships local-CLI runtimes we
// lacked. These are the minimum set the monorepo must register as selectable/known runtimes with the
// same metadata shape as the existing built-ins, so they flow through the existing selection + sandbox
// install path. Metadata (install command / bin name) is ported from Paperclip's per-adapter modules:
//   cursor   → cursor-local   (installer script `curl https://cursor.com/install`; bin `cursor-agent`)
//   grok     → grok-local     (Grok CLI `grok`; Paperclip auto-installs nothing, so a real npm pkg is used)
//   opencode → opencode-local (npm `opencode-ai`; bin `opencode`)
//   pi       → pi-local       (npm `@mariozechner/pi-coding-agent`; bin `pi`)
const MISSING_ADAPTERS = [
  { key: "cursor", binName: "cursor-agent", installIncludes: "cursor.com/install" },
  { key: "grok", binName: "grok", installIncludes: "grok-cli" },
  { key: "opencode", binName: "opencode", installIncludes: "opencode-ai" },
  { key: "pi", binName: "pi", installIncludes: "@mariozechner/pi-coding-agent" },
] as const;

function argvOf(inv: AdapterInvocation): string[] {
  if (inv.mode !== "spawn") throw new Error("expected a spawn invocation");
  return inv.argv;
}

describe("missing runtime adapters (cursor / grok / opencode / pi)", () => {
  it.each(MISSING_ADAPTERS)(
    "$key is a registered built-in with a non-empty installCommand + binName",
    ({ key, binName, installIncludes }) => {
      const adapter = getAdapter(key);
      expect(adapter, `adapter '${key}' must be registered`).toBeDefined();

      // Present in the built-in key list (flows through selection).
      expect(BUILTIN_ADAPTER_KEYS).toContain(key);

      // Non-empty binName (probed with `command -v` before install).
      expect(adapter!.binName).toBe(binName);
      expect(adapter!.binName!.length).toBeGreaterThan(0);

      // Non-empty installCommand (the sandbox install path), ported from Paperclip.
      expect(typeof adapter!.installCommand).toBe("string");
      expect(adapter!.installCommand!.length).toBeGreaterThan(0);
      expect(adapter!.installCommand).toContain(installIncludes);
    },
  );

  it.each(MISSING_ADAPTERS)(
    "$key lookup works by key and by *_local / *-local alias",
    ({ key }) => {
      expect(isAdapterKey(key)).toBe(true);
      // Paperclip / Tier-A DB spellings (`cursor-local`, `pi_local`, …) canonicalize to the code key.
      expect(canonicalAdapterKey(`${key}-local`)).toBe(key);
      expect(canonicalAdapterKey(`${key}_local`)).toBe(key);
      expect(getAdapter(`${key}-local`)!.key).toBe(key);
      expect(getAdapter(`${key}_local`)!.key).toBe(key);
      expect(isAdapterKey(`${key}-local`)).toBe(true);
    },
  );

  it.each(MISSING_ADAPTERS)(
    "$key builds a spawn invocation launching its bin",
    ({ key, binName }) => {
      const inv = buildAdapterInvocation(key, {
        taskId: "t_1",
        workspaceDir: "/work",
        taskTitle: "Fix nav",
        prompt: "the brief",
      });
      expect(inv.mode).toBe("spawn");
      expect(argvOf(inv)[0]).toBe(binName);
    },
  );
});

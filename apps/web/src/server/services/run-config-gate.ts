/**
 * Tier D / Phase 3 (this slice) — the PRE-DISPATCH configuration/binding gate.
 *
 * Before a run is dispatched we verify that everything the run needs to actually execute is present:
 * the execution target's required secret bindings + config. A run whose adapter/environment references a
 * secret that is not bound (an ssh key, a sandbox provider's BYO credentials, …) would otherwise start,
 * provision, and fail mid-run with an opaque connect/auth error. This gate refuses it UP FRONT with a
 * single, machine-readable `configuration_incomplete` reason listing exactly what is missing — the
 * generic analog of the old git/SSH-only preflight.
 *
 * PURE-ish + DI: the only I/O is the injected `resolveSecret` (the workspace vault). Flag-gated by the
 * caller (EXECUTION_POLICY); see sandbox-run.ts.
 */
import { isSandboxProviderConfigured } from "./sandbox-providers";
import { resolveSshPrivateKey, type EnvSshResolution } from "./sandbox/ssh-runtime";
import type { SandboxProvider } from "./sandbox/types";

/** The stable machine-readable exit reason a config-blocked run is marked with. */
export const CONFIGURATION_INCOMPLETE = "configuration_incomplete" as const;

/** One unsatisfied requirement — a readable label + an actionable hint for how to fix it. */
export interface MissingRunConfig {
  key: string;
  label: string;
  hint?: string;
}

export interface RunConfigGateResult {
  ok: boolean;
  missing: MissingRunConfig[];
  /** Human summary of what is missing (for the run's error message / UI). Empty when ok. */
  summary: string;
}

function summarize(missing: MissingRunConfig[]): string {
  return missing.map((m) => (m.hint ? `${m.label} — ${m.hint}` : m.label)).join("; ");
}

/**
 * Evaluate whether a run's execution target is fully configured. Checks are per-driver:
 *   • ssh     → a host + a resolvable private key (vault secret-ref bound).
 *   • sandbox → the BYO provider's credential secrets are all present in the workspace vault.
 *   • local   → nothing required (runs on the control-plane host).
 * Returns the (possibly empty) list of unsatisfied requirements; `ok` iff none.
 */
export async function evaluateRunConfig(input: {
  workspaceId: string;
  driver: string;
  provider?: SandboxProvider | null;
  ssh?: EnvSshResolution | null;
  resolveSecret: (name: string) => Promise<string | null>;
}): Promise<RunConfigGateResult> {
  const missing: MissingRunConfig[] = [];

  if (input.driver === "ssh") {
    if (!input.ssh?.host) {
      missing.push({ key: "ssh.host", label: "SSH host" });
    }
    const key = await resolveSshPrivateKey(input.workspaceId, input.ssh);
    if (!key) {
      missing.push({
        key: "ssh.privateKey",
        label: "SSH private key",
        hint: "bind a private-key secret to this environment's config",
      });
    }
  }

  if (input.driver === "sandbox" && input.provider) {
    const configured = await isSandboxProviderConfigured(input.provider, input.resolveSecret);
    if (!configured) {
      missing.push({
        key: `sandbox.${input.provider.key}`,
        label: `${input.provider.displayName} credentials`,
        hint: `add ${input.provider.credentialKeys.join(", ")} to the workspace secrets vault`,
      });
    }
  }

  return { ok: missing.length === 0, missing, summary: summarize(missing) };
}

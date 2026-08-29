/**
 * Tier D / Phase 3 (Plan 6, this slice) — the UNIFIED environment runtime driver.
 *
 * One seam the run path uses to reach EVERY environment kind. Historically only `local` and `sandbox`
 * were runnable; an `ssh` Environment resolved to `providerKey:null` and was refused. This resolver maps
 * every runnable driver to a concrete {@link SandboxProvider} (the realize/exec/release contract the
 * lease layer already drives), so `resolveEnvironmentExecution` for an `ssh` env yields a REAL executable
 * transport instead of a dead end:
 *
 *   • local   → the in-process `local` provider (temp dir + child_process).
 *   • sandbox → the configured cloud provider (e2b/daytona/…), unchanged.
 *   • ssh     → a per-environment ssh provider built from the host + vaulted key (buildSshRuntimeProvider).
 *   • plugin  → still not runnable via this seam (throws a clear BAD_USER_INPUT).
 *
 * Precedence mirrors the old inline logic: explicit provider override → the agent's bound Environment →
 * the agent's ad-hoc sandboxProvider. The ssh arm is ENVIRONMENTS-flag-gated (off → the pre-existing
 * "not yet runnable via the sandbox seam" behavior, so nothing regresses when the flag is dark).
 */
import { GraphQLError } from "graphql";
import { getSandboxProvider } from "./sandbox-providers";
import {
  buildSshRuntimeProvider,
  resolveSshConnection,
  type EnvSshResolution,
  type SshExecTransport,
} from "./sandbox/ssh-runtime";
import type { SandboxProvider } from "./sandbox/types";
import type { EnvExecutionResolution } from "./environments";

/** The resolved runtime driver for a run: the provider to drive + the key/driver it ran as. */
export interface EnvironmentRuntimeDriver {
  /** local | ssh | sandbox */
  driver: string;
  /** AgentRun.providerKey + execution-allowlist key (a real provider key, or "ssh"). */
  providerKey: string;
  /** The provider the lease layer provisions/execs/releases. */
  provider: SandboxProvider;
  /** ssh transport descriptor (for the pre-dispatch config gate). Present only for the `ssh` driver. */
  ssh?: EnvSshResolution | null;
}

function badInput(message: string): never {
  throw new GraphQLError(message, { extensions: { code: "BAD_USER_INPUT" } });
}

/**
 * Resolve the unified runtime driver for a run. Throws BAD_USER_INPUT when no target is runnable (no
 * provider configured, an unknown provider, a plugin/ssh env that this seam can't run).
 */
export async function resolveEnvironmentRuntimeDriver(input: {
  workspaceId: string;
  envRes: EnvExecutionResolution | null;
  inputProviderKey?: string | null;
  agentSandboxProvider: string | null;
  /** ENVIRONMENTS flag — gates the ssh arm (off → ssh stays "not yet runnable"). */
  environmentsEnabled: boolean;
  /** DI seam (tests): the ssh exec transport injected into the ssh provider. */
  sshExec?: SshExecTransport;
}): Promise<EnvironmentRuntimeDriver> {
  const { workspaceId, envRes, inputProviderKey, agentSandboxProvider } = input;

  // ssh driver: route through a real remote transport, but only when ENVIRONMENTS is enabled. An explicit
  // provider override (inputProviderKey) always wins over the env (falls through to the provider path).
  if (!inputProviderKey && envRes?.driver === "ssh") {
    if (!input.environmentsEnabled) {
      badInput(
        `Environment driver "ssh" is not yet runnable via the sandbox seam. Use a local or sandbox environment.`,
      );
    }
    if (!envRes.ssh?.host) {
      badInput(`SSH environment is missing a host.`);
    }
    // Resolve the connection now (key from the vault). A missing key resolves to "" and is caught by the
    // pre-dispatch config gate as `configuration_incomplete` (not a hard throw here).
    const connection = await resolveSshConnection(workspaceId, envRes.ssh);
    return {
      driver: "ssh",
      providerKey: "ssh",
      provider: buildSshRuntimeProvider({ connection, transport: input.sshExec }),
      ssh: envRes.ssh,
    };
  }

  // A plugin env (or any other non-runnable driver) still resolves to a null provider key → refuse.
  if (!inputProviderKey && envRes && envRes.providerKey === null) {
    badInput(
      `Environment driver "${envRes.driver}" is not yet runnable via the sandbox seam. Use a local or sandbox environment.`,
    );
  }

  // local / sandbox (and the ad-hoc sandboxProvider path): resolve a registered provider.
  const providerKey = (inputProviderKey ?? envRes?.providerKey ?? agentSandboxProvider) || null;
  if (!providerKey) {
    badInput("No sandbox provider is configured for this agent");
  }
  const provider = getSandboxProvider(providerKey);
  if (!provider) {
    badInput(`Unknown sandbox provider: ${providerKey}`);
  }
  const driver = inputProviderKey ? "sandbox" : (envRes?.driver ?? "sandbox");
  return { driver, providerKey, provider, ssh: null };
}

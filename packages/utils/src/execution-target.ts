/**
 * Tier D / Phase 3 (Plan 6) — PURE execution-target/transport resolver (ported from Paperclip's
 * environment-execution-target). Maps an environment (driver + provider) to the concrete transport a
 * run uses to reach its execution machine: in-process `local`, a remote `sandbox` (provisioned box),
 * or a remote `ssh` host. DB-free + deterministic → unit-testable, and shared by the server (to label
 * runs / describe an environment) and any client.
 */
export type ExecutionTransport = "local" | "sandbox" | "ssh" | "plugin";

export interface ExecutionTarget {
  /** `local` runs in-process on the control-plane host; `remote` runs on another machine. */
  kind: "local" | "remote";
  transport: ExecutionTransport;
  /** Sandbox provider key when transport = sandbox (e.g. e2b/local/kubernetes). */
  providerKey?: string | null;
}

export function resolveExecutionTarget(input: {
  driver: string; // local | ssh | sandbox | plugin
  providerKey?: string | null; // sandbox provider key when driver = sandbox
}): ExecutionTarget {
  switch (input.driver) {
    case "local":
      return { kind: "local", transport: "local" };
    case "sandbox":
      // The `local` sandbox provider still runs on the host (in-process), just via the sandbox seam.
      return {
        kind: input.providerKey === "local" ? "local" : "remote",
        transport: "sandbox",
        providerKey: input.providerKey ?? null,
      };
    case "ssh":
      return { kind: "remote", transport: "ssh" };
    case "plugin":
      return { kind: "remote", transport: "plugin" };
    default:
      return { kind: "local", transport: "local" };
  }
}

/** A compact human label for an environment's transport (for the UI). E.g. "sandbox:e2b", "ssh". */
export function describeExecutionTarget(target: ExecutionTarget): string {
  if (target.transport === "sandbox") return `sandbox:${target.providerKey ?? "?"}`;
  return target.transport;
}

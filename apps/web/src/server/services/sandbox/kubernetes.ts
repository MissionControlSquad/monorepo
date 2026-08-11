/**
 * Kubernetes sandbox provider — ported from Paperclip's kubernetes plugin. SDK:
 * `@kubernetes/client-node` (^1.0.0). We port the *core* mechanism (create an exec-able pod → run a
 * command via the `Exec` class over a WebSocket to the kube-apiserver → delete the pod). We
 * intentionally DO NOT port Paperclip's tenant Namespace/RBAC/NetworkPolicy/Sandbox-CR/Job
 * orchestration — that is its multi-tenant lease model, not our provision→exec→destroy contract.
 *
 * Credential: KUBECONFIG holds the kubeconfig YAML *content* (Paperclip's loadFromString), or a path.
 */
import { PassThrough } from "node:stream";
import { evaluateImageAllowlist, parseImageAllowlist } from "@agentcenter/utils";
import {
  defineCloudProvider,
  loadOptionalModule,
  loginShellCommand,
  type SandboxExecResult,
  type SandboxHandle,
} from "./types";

interface V1Status {
  status?: string;
  details?: { causes?: Array<{ reason?: string; message?: string }> };
}
interface KubeConfig {
  loadFromString(config: string): void;
  loadFromFile(path: string): void;
  makeApiClient(api: unknown): unknown;
}
interface KubeCoreApi {
  createNamespacedPod(args: { namespace: string; body: unknown }): Promise<unknown>;
  readNamespacedPod(args: {
    name: string;
    namespace: string;
  }): Promise<{ status?: { phase?: string } }>;
  deleteNamespacedPod(args: { name: string; namespace: string }): Promise<unknown>;
}
interface KubeExec {
  exec(
    namespace: string,
    pod: string,
    container: string,
    command: string[],
    stdout: NodeJS.WritableStream,
    stderr: NodeJS.WritableStream,
    stdin: NodeJS.ReadableStream | null,
    tty: boolean,
    statusCallback: (status: V1Status) => void,
  ): Promise<unknown>;
}
interface KubeModule {
  KubeConfig: new () => KubeConfig;
  CoreV1Api: unknown;
  Exec: new (kc: KubeConfig) => KubeExec;
}

const CONTAINER = "agent";
const READY_TIMEOUT_MS = 120_000;
const POLL_MS = 1_500;

function loadKubeConfig(mod: KubeModule, raw: string): KubeConfig {
  const kc = new mod.KubeConfig();
  if (/apiVersion|clusters:/.test(raw) || raw.includes("\n")) kc.loadFromString(raw);
  else kc.loadFromFile(raw);
  return kc;
}

function execInPod(
  exec: KubeExec,
  namespace: string,
  pod: string,
  command: string[],
): Promise<SandboxExecResult> {
  return new Promise((resolve, reject) => {
    const stdout = new PassThrough();
    const stderr = new PassThrough();
    let out = "";
    let err = "";
    let exitCode: number | null = 0;
    let statusReceived = false;
    let endedStreams = 0;
    stdout.on("data", (d: Buffer) => (out += d.toString()));
    stderr.on("data", (d: Buffer) => (err += d.toString()));
    const maybeResolve = () => {
      if (statusReceived && endedStreams >= 2) {
        resolve({ exitCode, stdout: out, stderr: err });
      }
    };
    stdout.on("end", () => {
      endedStreams++;
      maybeResolve();
    });
    stderr.on("end", () => {
      endedStreams++;
      maybeResolve();
    });
    exec
      .exec(namespace, pod, CONTAINER, command, stdout, stderr, null, false, (status) => {
        if (status?.status === "Success") {
          exitCode = 0;
        } else {
          const cause = status?.details?.causes?.find((c) => c.reason === "ExitCode");
          exitCode = cause?.message ? Number(cause.message) : 1;
        }
        statusReceived = true;
        maybeResolve();
      })
      .catch(reject);
  });
}

export const kubernetesProvider = defineCloudProvider({
  key: "kubernetes",
  displayName: "Kubernetes",
  credentialKeys: ["KUBECONFIG"],
  provision: async (creds, ctx, spec): Promise<SandboxHandle> => {
    const mod = await loadOptionalModule<KubeModule>("@kubernetes/client-node", "Kubernetes");
    const kc = loadKubeConfig(mod, creds.KUBECONFIG);
    const core = kc.makeApiClient(mod.CoreV1Api) as KubeCoreApi;
    const exec = new mod.Exec(kc);

    const namespace = (await ctx.resolveSecret("K8S_NAMESPACE")) || "default";
    const image = spec?.image ?? (await ctx.resolveSecret("K8S_SANDBOX_IMAGE")) ?? "ubuntu:22.04";

    // Image allowlist admission (security hardening — Item 2): refuse an image outside the workspace's
    // configured allowlist BEFORE creating the pod, so a run can't be pointed at a hostile image that
    // would exfiltrate the injected credentials. The allowlist is the K8S_IMAGE_ALLOWLIST vault secret
    // (glob/registry patterns), falling back to a sensible default set of trusted public base images.
    const allowlist = parseImageAllowlist(await ctx.resolveSecret("K8S_IMAGE_ALLOWLIST"));
    const admission = evaluateImageAllowlist(allowlist, image);
    if (!admission.allowed) {
      throw new Error(`Kubernetes sandbox refused: ${admission.reason}`);
    }

    const podName =
      `agentcenter-sbx-${Date.now().toString(36)}-${Math.abs(hash(image)).toString(36)}`.slice(
        0,
        63,
      );

    await core.createNamespacedPod({
      namespace,
      body: {
        metadata: { name: podName, labels: { "agentcenter-provider": "kubernetes" } },
        spec: {
          restartPolicy: "Never",
          containers: [
            {
              name: CONTAINER,
              image,
              command: ["/bin/sh", "-c", "sleep infinity"],
              workingDir: "/workspace",
            },
          ],
        },
      },
    });

    // Wait until the pod is Running before exec is possible.
    const deadline = Date.now() + READY_TIMEOUT_MS;
    for (;;) {
      const pod = await core.readNamespacedPod({ name: podName, namespace }).catch(() => null);
      if (pod?.status?.phase === "Running") break;
      if (Date.now() > deadline) {
        await core.deleteNamespacedPod({ name: podName, namespace }).catch(() => {});
        throw new Error(
          `Kubernetes pod ${podName} did not become Running within ${READY_TIMEOUT_MS}ms.`,
        );
      }
      await sleep(POLL_MS);
    }

    return {
      id: podName,
      providerKey: "kubernetes",
      exec: async (command, opts) =>
        execInPod(exec, namespace, podName, [
          "/bin/sh",
          "-lc",
          loginShellCommand(command, opts?.cwd),
        ]),
      destroy: async () => {
        await core.deleteNamespacedPod({ name: podName, namespace }).catch(() => {});
      },
    };
  },
});

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return h;
}

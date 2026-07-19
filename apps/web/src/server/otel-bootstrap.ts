/**
 * OpenTelemetry bootstrap (Domain 12 GAP-4). Started from instrumentation.register() ONLY when
 * OTEL_EXPORTER_OTLP_ENDPOINT is set. Dynamically imports the OTel SDK + the protocol-specific
 * exporter (optional peer deps, not in the default lockfile) so a deployment without OTel imports
 * nothing. If the packages are missing, it logs one diagnostic and the server stays up (traces-only,
 * no PII in spans; endpoint + protocol come from env). Idempotent.
 */
import { resolveOtelConfig } from "@agentcenter/utils";

let started = false;

function log(level: "info" | "warn" | "error", message: string, extra?: Record<string, unknown>) {
  const line = { timestamp: new Date().toISOString(), level, tag: "otel", message, ...extra };
  // eslint-disable-next-line no-console
  (level === "error" ? console.error : level === "warn" ? console.warn : console.info)(
    JSON.stringify(line),
  );
}

/** Start OTel tracing if configured. No-op (and imports nothing) when the endpoint env var is unset. */
export async function startOtel(): Promise<boolean> {
  if (started) return true;
  const cfg = resolveOtelConfig(process.env);
  if (cfg.warning) log("warn", cfg.warning);
  if (!cfg.enabled || !cfg.exporterPackage) return false;

  try {
    // Dynamic, string-built specifiers so bundlers don't try to resolve absent optional deps at build.
    const sdkPkg = "@opentelemetry/sdk-node";
    const [{ NodeSDK }, exporterMod] = await Promise.all([
      import(/* webpackIgnore: true */ sdkPkg) as Promise<{
        NodeSDK: new (o: unknown) => { start: () => void; shutdown: () => Promise<void> };
      }>,
      import(/* webpackIgnore: true */ cfg.exporterPackage) as Promise<Record<string, unknown>>,
    ]);
    const ExporterCtor = (exporterMod.OTLPTraceExporter as new (o: unknown) => unknown) ?? null;
    if (!ExporterCtor) {
      log("warn", "OTLP exporter package has no OTLPTraceExporter export — tracing disabled");
      return false;
    }
    const sdk = new NodeSDK({
      serviceName: cfg.serviceName,
      traceExporter: new ExporterCtor({ url: cfg.endpoint }),
    });
    sdk.start();
    started = true;
    log("info", "OpenTelemetry tracing started", {
      endpoint: cfg.endpoint,
      protocol: cfg.protocol,
      serviceName: cfg.serviceName,
    });
    const shutdown = () => void sdk.shutdown().catch(() => {});
    process.once("SIGTERM", shutdown);
    process.once("SIGINT", shutdown);
    return true;
  } catch (err) {
    // Missing optional packages / init failure must NOT take the server down.
    log(
      "warn",
      "OpenTelemetry configured but SDK/exporter packages are unavailable — tracing off",
      {
        error: err instanceof Error ? err.message : String(err),
      },
    );
    return false;
  }
}

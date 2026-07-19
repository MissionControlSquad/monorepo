/**
 * OpenTelemetry opt-in config (Domain 12 GAP-4) — pure, shared via @agentcenter/utils. Resolves the
 * OTLP exporter selection from env WITHOUT importing any @opentelemetry package (those are optional
 * peer deps, not in the default lockfile). The server's instrumentation `register()` calls
 * resolveOtelConfig(env); only when it returns `enabled` does it dynamically import the SDK — so a
 * deployment with no OTEL_* env vars imports nothing and pays zero overhead.
 */

export type OtelProtocol = "grpc" | "http/protobuf" | "http/json";

export interface OtelConfig {
  enabled: boolean;
  endpoint: string | null;
  protocol: OtelProtocol;
  serviceName: string;
  /** The exporter package a bootstrap should import for this protocol. */
  exporterPackage: string | null;
  /** A single warning to surface (unknown protocol), or null. */
  warning: string | null;
}

const EXPORTER_PACKAGE: Record<OtelProtocol, string> = {
  grpc: "@opentelemetry/exporter-trace-otlp-grpc",
  "http/protobuf": "@opentelemetry/exporter-trace-otlp-proto",
  "http/json": "@opentelemetry/exporter-trace-otlp-http",
};

/**
 * Pure: resolve OTel config from an env bag. Tracing is enabled only when an OTLP endpoint is set.
 * The protocol defaults to grpc; an unknown protocol falls back to grpc with a single warning.
 */
export function resolveOtelConfig(env: Record<string, string | undefined>): OtelConfig {
  const endpoint = env.OTEL_EXPORTER_OTLP_ENDPOINT?.trim() || null;
  const rawProtocol = (env.OTEL_EXPORTER_OTLP_PROTOCOL || "grpc").trim();
  const serviceName = env.OTEL_SERVICE_NAME?.trim() || "agentcenter-web";

  let protocol: OtelProtocol = "grpc";
  let warning: string | null = null;
  if (rawProtocol === "grpc" || rawProtocol === "http/protobuf" || rawProtocol === "http/json") {
    protocol = rawProtocol;
  } else {
    warning = `Unknown OTEL_EXPORTER_OTLP_PROTOCOL "${rawProtocol}", falling back to grpc`;
  }

  const enabled = endpoint !== null;
  return {
    enabled,
    endpoint,
    protocol,
    serviceName,
    exporterPackage: enabled ? EXPORTER_PACKAGE[protocol] : null,
    warning,
  };
}

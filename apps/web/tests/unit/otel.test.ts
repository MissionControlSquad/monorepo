import { describe, it, expect } from "vitest";
import { resolveOtelConfig } from "@agentcenter/utils";

describe("resolveOtelConfig (Domain 12 GAP-4)", () => {
  it("is disabled and imports nothing when no endpoint is set", () => {
    const cfg = resolveOtelConfig({});
    expect(cfg.enabled).toBe(false);
    expect(cfg.endpoint).toBeNull();
    expect(cfg.exporterPackage).toBeNull();
  });

  it("enables tracing and defaults to the grpc exporter when an endpoint is set", () => {
    const cfg = resolveOtelConfig({ OTEL_EXPORTER_OTLP_ENDPOINT: "http://collector:4317" });
    expect(cfg).toMatchObject({
      enabled: true,
      endpoint: "http://collector:4317",
      protocol: "grpc",
      exporterPackage: "@opentelemetry/exporter-trace-otlp-grpc",
      serviceName: "agentcenter-web",
      warning: null,
    });
  });

  it("selects the exporter package by protocol", () => {
    expect(
      resolveOtelConfig({
        OTEL_EXPORTER_OTLP_ENDPOINT: "http://c:4318",
        OTEL_EXPORTER_OTLP_PROTOCOL: "http/protobuf",
      }).exporterPackage,
    ).toBe("@opentelemetry/exporter-trace-otlp-proto");
    expect(
      resolveOtelConfig({
        OTEL_EXPORTER_OTLP_ENDPOINT: "http://c:4318",
        OTEL_EXPORTER_OTLP_PROTOCOL: "http/json",
      }).exporterPackage,
    ).toBe("@opentelemetry/exporter-trace-otlp-http");
  });

  it("falls back to grpc with a single warning on an unknown protocol", () => {
    const cfg = resolveOtelConfig({
      OTEL_EXPORTER_OTLP_ENDPOINT: "http://c:4317",
      OTEL_EXPORTER_OTLP_PROTOCOL: "carrier-pigeon",
    });
    expect(cfg.protocol).toBe("grpc");
    expect(cfg.warning).toMatch(/Unknown OTEL_EXPORTER_OTLP_PROTOCOL/);
  });

  it("honors a custom service name", () => {
    expect(
      resolveOtelConfig({
        OTEL_EXPORTER_OTLP_ENDPOINT: "http://c:4317",
        OTEL_SERVICE_NAME: "my-svc",
      }).serviceName,
    ).toBe("my-svc");
  });
});

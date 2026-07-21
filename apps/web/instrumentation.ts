export async function register() {
  // Only run on the Node.js server runtime, not on Edge or during build
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // OpenTelemetry (Domain 12 GAP-4): starts ONLY when OTEL_EXPORTER_OTLP_ENDPOINT is set; imports
    // nothing otherwise. Best-effort — never blocks server startup.
    const { startOtel } = await import("./src/server/otel-bootstrap");
    await startOtel().catch(() => {});

    const { runStartupMigrations } = await import("./src/server/startup-migrations");
    await runStartupMigrations();

    // Initialize license (check stored license in DB, start heartbeat if valid)
    const { initLicense, stopTokenRefresh } = await import("./src/server/license");
    await initLicense();

    // Note: notification retry processor removed — buildbase owns push/email delivery + its own
    // retry; the in-app feed is written synchronously and never needs redelivery.

    // Graceful shutdown: stop the license heartbeat before exiting
    const shutdown = () => {
      console.info(
        JSON.stringify({
          timestamp: new Date().toISOString(),
          level: "info",
          tag: "instrumentation",
          message: "Shutting down — stopping license refresh",
        }),
      );
      stopTokenRefresh();
      process.exit(0);
    };
    process.once("SIGTERM", shutdown);
    process.once("SIGINT", shutdown);

    console.info(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        level: "info",
        tag: "instrumentation",
        message: "Next.js server instrumentation registered",
        nodeVersion: process.version,
        env: process.env.NODE_ENV,
      }),
    );
  }
}

/**
 * Called by Next.js when an error is caught during request handling.
 * Captures server component errors, API route errors, and middleware errors.
 *
 * To integrate Sentry, add:
 *   import * as Sentry from "@sentry/nextjs";
 *   Sentry.captureException(error);
 */
export function onRequestError(
  error: { digest: string } & Error,
  request: {
    path: string;
    method: string;
    headers: { [key: string]: string };
  },
  context: {
    routerKind: "Pages Router" | "App Router";
    routePath: string;
    routeType: "render" | "route" | "action" | "middleware";
    renderType?: "ssr" | "ssg";
    revalidateReason?: "on-demand" | "stale" | undefined;
    renderSource?: "react-server-components" | "react-server-components-payload";
  },
) {
  console.error(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      level: "error",
      tag: "next-error",
      message: error.message,
      digest: error.digest,
      path: request.path,
      method: request.method,
      routePath: context.routePath,
      routeType: context.routeType,
      routerKind: context.routerKind,
      stack: error.stack?.split("\n").slice(0, 10).join("\n"),
    }),
  );
}

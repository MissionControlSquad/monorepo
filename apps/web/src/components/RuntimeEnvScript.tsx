/**
 * Server component that injects public env vars into the client at runtime.
 * This avoids baking env vars into the build — changes take effect on restart.
 *
 * Client code reads values via `window.__ENV__.KEY` instead of `process.env.NEXT_PUBLIC_KEY`.
 */
export function RuntimeEnvScript() {
  const publicEnv = {
    HUBSPOT_PORTAL_ID: process.env.HUBSPOT_PORTAL_ID ?? "245421601",
  };

  return (
    <script
      dangerouslySetInnerHTML={{
        __html: `window.__ENV__=${JSON.stringify(publicEnv)};`,
      }}
    />
  );
}

/**
 * Read runtime env vars injected by <RuntimeEnvScript />.
 * Falls back to process.env.NEXT_PUBLIC_* for dev/backwards compat.
 */

interface RuntimeEnv {
  VAPID_PUBLIC_KEY?: string;
}

declare global {
  interface Window {
    __ENV__?: RuntimeEnv;
  }
}

export function getClientEnv<K extends keyof RuntimeEnv>(key: K): string | undefined {
  if (typeof globalThis !== "undefined" && "window" in globalThis) {
    const win = globalThis as unknown as { __ENV__?: RuntimeEnv };
    if (win.__ENV__?.[key]) {
      return win.__ENV__[key];
    }
  }
  return undefined;
}

import { createSessionToken, type SessionPayload } from "@/server/admin-auth";

/**
 * TEST-ONLY session bootstrap.
 *
 * Production/dev auth is buildbase-only: there is no password login. The vitest integration suite,
 * the Playwright e2e suite, and the enterprise seed cannot run a real buildbase OAuth round-trip, so
 * they mint an mc_session directly through this helper. It is HARD-gated to the test environment and
 * throws everywhere else, so it can never become an auth bypass in dev or production.
 *
 * The gate is env-only (NODE_ENV==="test" or the VITEST marker) — never reachable from a normal build.
 */
export function isTestEnv(): boolean {
  return process.env.NODE_ENV === "test" || Boolean(process.env.VITEST);
}

/** Mint an mc_session WITHOUT any password/OAuth flow. Throws unless running under test env. */
export async function mintTestSessionToken(payload: SessionPayload): Promise<string> {
  if (!isTestEnv()) {
    throw new Error(
      "mintTestSessionToken is test-only and must never run outside NODE_ENV=test / VITEST",
    );
  }
  return createSessionToken(payload);
}

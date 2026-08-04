/**
 * Provider quota-windows polling (Domain 12 GAP-2). Fans out over the registered adapters that
 * implement the optional `getQuotaWindows()` hook, polling each provider's live rate-limit / credit
 * windows. Each poll is timeout-guarded and its failure is SHAPED into a `{ ok:false }` result rather
 * than thrown — one slow/broken provider never blocks the others. Providers without the hook are
 * omitted. PROVIDER_QUOTA-flag gated at the edge (default off until a real adapter implements it).
 */
import { listAdapters, type Adapter, type ProviderQuotaResult } from "@agentcenter/utils";

const DEFAULT_TIMEOUT_MS = 20_000;

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("quota poll timed out")), ms);
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

async function pollOne(adapter: Adapter, timeoutMs: number): Promise<ProviderQuotaResult> {
  if (!adapter.getQuotaWindows) {
    return { provider: adapter.key, ok: false, windows: [], errorFamily: "unsupported" };
  }
  try {
    const windows = await withTimeout(adapter.getQuotaWindows(), timeoutMs);
    return { provider: adapter.key, ok: true, windows };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      provider: adapter.key,
      ok: false,
      windows: [],
      errorFamily: /timed out/i.test(message) ? "timeout" : "provider_error",
      error: message,
    };
  }
}

/**
 * Poll every adapter that supports quota windows. Returns one result per supporting provider
 * (unsupported adapters are omitted). Never rejects.
 */
export async function fetchAllProviderQuota(
  opts: { timeoutMs?: number; adapters?: Adapter[] } = {},
): Promise<ProviderQuotaResult[]> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const candidates = (opts.adapters ?? listAdapters()).filter(
    (a) => typeof a.getQuotaWindows === "function",
  );
  const settled = await Promise.allSettled(candidates.map((a) => pollOne(a, timeoutMs)));
  return settled.map((s, i) =>
    s.status === "fulfilled"
      ? s.value
      : {
          provider: candidates[i].key,
          ok: false,
          windows: [],
          errorFamily: "provider_error" as const,
        },
  );
}

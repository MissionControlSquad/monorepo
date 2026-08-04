// Adapter session management (parity #F9). PURE. Sessioned runtimes (Claude/Codex resume, etc.) carry
// opaque session params between runs; this is the codec (serialize/deserialize/display id) plus the
// compaction policy that decides when a session should be rotated (too many runs, too many tokens, too
// old). The actual resume-exec of a live runtime is the infra seam; the codec + policy are the offline
// half. DB persistence is the AdapterSession model (service layer).

export type SessionParams = Record<string, unknown>;

export interface SessionCodec {
  serialize(params: SessionParams): string;
  deserialize(raw: string): SessionParams;
  /** A short, stable, human-recognizable id for a session (for logs/UI). */
  getDisplayId(params: SessionParams): string;
}

function hashToShortId(input: string): string {
  // Small deterministic non-crypto hash → 8 hex chars. Stable for display; not security-sensitive.
  let h = 2166136261 >>> 0;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

/** The default JSON session codec. `getDisplayId` prefers an explicit id field, else hashes the params. */
export const sessionCodec: SessionCodec = {
  serialize(params) {
    return JSON.stringify(params ?? {});
  },
  deserialize(raw) {
    if (!raw?.trim()) return {};
    try {
      const v = JSON.parse(raw);
      return v && typeof v === "object" ? (v as SessionParams) : {};
    } catch {
      return {};
    }
  },
  getDisplayId(params) {
    const explicit = params?.sessionId ?? params?.session_id ?? params?.id;
    if (typeof explicit === "string" && explicit) return explicit.slice(0, 24);
    return `sess_${hashToShortId(JSON.stringify(params ?? {}))}`;
  },
};

export interface CompactionThresholds {
  maxRuns?: number; // rotate after this many runs on one session
  maxTokens?: number; // rotate once accumulated tokens exceed this
  maxAgeMs?: number; // rotate once the session is older than this
}

export interface CompactionDecision {
  compact: boolean;
  reason: string | null;
}

/**
 * Decide whether a session should be compacted/rotated. Any threshold crossed triggers rotation.
 * Deterministic; thresholds default generously so an unset policy rarely rotates.
 */
export function shouldCompactSession(
  state: { runCount: number; tokens: number; ageMs: number },
  thresholds: CompactionThresholds = {},
): CompactionDecision {
  const maxRuns = thresholds.maxRuns ?? 50;
  const maxTokens = thresholds.maxTokens ?? 500_000;
  const maxAgeMs = thresholds.maxAgeMs ?? 7 * 24 * 3_600_000; // 7 days
  if (state.runCount >= maxRuns) return { compact: true, reason: `run count ${state.runCount} ≥ ${maxRuns}` };
  if (state.tokens >= maxTokens) return { compact: true, reason: `tokens ${state.tokens} ≥ ${maxTokens}` };
  if (state.ageMs >= maxAgeMs) return { compact: true, reason: `age exceeds ${Math.round(maxAgeMs / 86_400_000)}d` };
  return { compact: false, reason: null };
}

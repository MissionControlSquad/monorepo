// Sensitive-content redaction (parity #61 + the http-log-redaction gap). Masks secrets/PII in free
// text before it is stored or shared (feedback comments, log lines, shared snippets). Pure + order-
// independent; conservative (better to over-redact a token than leak one). Reusable across surfaces.

const REDACTED = "[redacted]";

// Order matters only for overlapping patterns; each replaces a whole match with [redacted].
const PATTERNS: { name: string; re: RegExp }[] = [
  // URLs carrying credentials: scheme://user:pass@host
  { name: "url-credentials", re: /\b([a-z][a-z0-9+.-]*:\/\/)[^\s:/@]+:[^\s:/@]+@/gi },
  // Authorization / Bearer tokens
  { name: "bearer", re: /\b[Bb]earer\s+[A-Za-z0-9._~+/-]{12,}=*/g },
  // Common secret assignments: api_key=..., token: "...", password=...
  {
    name: "assigned-secret",
    re: /\b(api[_-]?key|secret|token|password|passwd|pwd|access[_-]?token|client[_-]?secret)\b\s*[=:]\s*["']?[A-Za-z0-9._~+/\-]{6,}["']?/gi,
  },
  // Provider key shapes: sk-..., ghp_..., xoxb-..., AKIA... (AWS), Google AIza...
  { name: "provider-key", re: /\b(sk|rk|pk)-[A-Za-z0-9]{16,}\b/g },
  { name: "github-token", re: /\bgh[pousr]_[A-Za-z0-9]{20,}\b/g },
  { name: "slack-token", re: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g },
  { name: "aws-akid", re: /\b(AKIA|ASIA)[A-Z0-9]{16}\b/g },
  { name: "google-key", re: /\bAIza[A-Za-z0-9_-]{30,}\b/g },
  // JWTs: three base64url segments
  { name: "jwt", re: /\beyJ[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}\b/g },
  // Email addresses (PII)
  { name: "email", re: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g },
  // Long opaque hex/base64 blobs (32+ chars) that look like keys
  { name: "long-hex", re: /\b[0-9a-fA-F]{32,}\b/g },
];

export interface RedactionResult {
  text: string;
  /** Names of the patterns that matched (for observability / tests). */
  redactedKinds: string[];
}

/** Redact sensitive substrings, returning the masked text + which kinds matched. */
export function redactSensitiveVerbose(input: string): RedactionResult {
  if (!input) return { text: input, redactedKinds: [] };
  let text = input;
  const kinds: string[] = [];
  for (const { name, re } of PATTERNS) {
    if (re.test(text)) {
      kinds.push(name);
      text = text.replace(re, (m) => {
        // For assigned secrets keep the key name, mask only the value.
        if (name === "assigned-secret") {
          const eq = m.search(/[=:]/);
          return `${m.slice(0, eq + 1)} ${REDACTED}`;
        }
        // For credential URLs keep the scheme (scheme://), mask the user:pass@ part.
        if (name === "url-credentials") {
          return `${m.slice(0, m.indexOf("//") + 2)}${REDACTED}`;
        }
        return REDACTED;
      });
    }
  }
  return { text, redactedKinds: kinds };
}

/** Redact sensitive substrings from free text (the common case). */
export function redactSensitive(input: string): string {
  return redactSensitiveVerbose(input).text;
}

// ---------------------------------------------------------------------------
// Resolved-run-secret redaction (parity: run-secret-redaction). Unlike the
// pattern matcher above, this masks a KNOWN set of exact secret values — the
// vault secrets a run resolved into its environment (LLM keys, GIT_TOKEN, …) —
// out of captured stdout/stderr, the live status tail, the run summary, and the
// run->task message before any of them is stored, streamed, or posted. Ported
// from Paperclip's redactRegisteredSecretValues: build a redactor from the set
// of resolved values, replace each occurrence with a fixed mask, longest value
// first so a shorter value that is a substring of a longer one can't leak the
// tail of the longer one.

/** The mask that replaces a resolved secret value wherever it appears in run output. */
export const RUN_SECRET_MASK = "***REDACTED***";

// Values shorter than this are skipped: they are almost never real secrets and
// masking them would over-redact ordinary output (e.g. a 2-char token substring).
const MIN_REDACTABLE_SECRET_LENGTH = 4;

/**
 * Mask every occurrence of each resolved secret value in `text`. Pure and I/O-free.
 *
 * - Uses `split(value).join(mask)` (not a RegExp) so regex-special characters in a
 *   secret value are matched literally and there is no catastrophic-backtracking risk.
 * - Empty / very short values are ignored to avoid over-masking benign text.
 * - Longer values are applied before shorter ones so overlapping secrets fully mask.
 */
export function redactRunSecrets(
  text: string,
  secretValues: Iterable<string>,
  mask: string = RUN_SECRET_MASK,
): string {
  if (!text) return text;
  const values = [...new Set(secretValues)]
    .filter((value) => typeof value === "string" && value.length >= MIN_REDACTABLE_SECRET_LENGTH)
    .sort((left, right) => right.length - left.length);
  let out = text;
  for (const value of values) {
    if (out.includes(value)) out = out.split(value).join(mask);
  }
  return out;
}

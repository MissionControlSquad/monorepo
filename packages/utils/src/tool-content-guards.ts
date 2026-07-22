// Tool content-guards evaluator (parity #163 — the buildable-now data half). Workspace-defined rules
// that DENY (block the call) or REDACT (mask matches) tool inputs/outputs by content. PURE — the
// tested core a future tool runtime enforces; nothing enforces it yet (the tool subsystem is absent).
// Complements tool-access-policy (which gates by tool NAME); this gates by CONTENT.

export type ContentGuardAction = "deny" | "redact";
export type GuardDirection = "input" | "output" | "both";

export interface ContentGuardRule {
  id: string;
  /** Literal substring (case-insensitive) or a `/regex/flags` pattern. */
  pattern: string;
  action: ContentGuardAction;
  appliesTo: GuardDirection;
  /** Higher = evaluated first (a high-priority deny short-circuits). */
  priority: number;
}

export interface ContentGuardResult {
  decision: "allow" | "deny" | "redact";
  /** Redacted text when decision is "redact"; the original otherwise. */
  text: string;
  /** The deny rule that blocked the call, if any. */
  deniedByRuleId?: string;
  /** Redact rules that matched (when decision is "redact"). */
  redactedRuleIds: string[];
}

const REDACTED = "[blocked]";

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Compile a rule pattern to a global regex. `/.../flags` → regex; anything else → literal (case-insensitive).
function toRegExp(pattern: string): RegExp | null {
  const m = pattern.match(/^\/(.+)\/([a-z]*)$/i);
  try {
    if (m) {
      const flags = m[2].includes("g") ? m[2] : m[2] + "g";
      return new RegExp(m[1], flags);
    }
    return new RegExp(escapeRegExp(pattern), "gi");
  } catch {
    return null; // a malformed regex rule never matches (fail-open per-rule, not per-call)
  }
}

function applies(rule: ContentGuardRule, direction: Exclude<GuardDirection, "both">): boolean {
  return rule.appliesTo === "both" || rule.appliesTo === direction;
}

/**
 * Evaluate `text` (a tool input or output) against `rules`. A matching DENY (highest priority wins)
 * blocks the call; otherwise every matching REDACT rule masks its matches. Default: allow.
 */
export function applyContentGuards(
  rules: ContentGuardRule[],
  text: string,
  direction: Exclude<GuardDirection, "both">,
): ContentGuardResult {
  const active = rules
    .filter((r) => applies(r, direction))
    .sort((a, b) => b.priority - a.priority);

  // Deny takes precedence — check highest-priority deny first.
  for (const rule of active.filter((r) => r.action === "deny")) {
    const re = toRegExp(rule.pattern);
    if (re && re.test(text)) {
      return { decision: "deny", text, deniedByRuleId: rule.id, redactedRuleIds: [] };
    }
  }

  // No deny matched — apply redactions.
  let out = text;
  const redactedRuleIds: string[] = [];
  for (const rule of active.filter((r) => r.action === "redact")) {
    const re = toRegExp(rule.pattern);
    if (re && re.test(out)) {
      redactedRuleIds.push(rule.id);
      out = out.replace(re, REDACTED);
    }
  }

  if (redactedRuleIds.length > 0) return { decision: "redact", text: out, redactedRuleIds };
  return { decision: "allow", text, redactedRuleIds: [] };
}

// Per-runtime transcript parsing (parity #F6). PURE codec — maps a runtime's native JSON stdout (Claude
// stream-json, Codex/Gemini item events, etc.) into structured TranscriptEntry[] the runner streams to
// the control plane instead of one opaque blob. No I/O; fixture-testable. The live streaming transport
// is the infra seam; this is the parse + redaction half. Home-path user segments and command text are
// redacted before entries are persisted/streamed.

export type TranscriptEntryKind =
  | "assistant"
  | "thinking"
  | "tool_call"
  | "tool_result"
  | "diff"
  | "raw";

export interface TranscriptEntry {
  kind: TranscriptEntryKind;
  ts: number;
  text?: string; // assistant/thinking/raw/diff body
  tool?: string; // tool_call/tool_result tool name
  args?: unknown; // tool_call input
  result?: unknown; // tool_result payload
  isError?: boolean; // tool_result error flag
}

// ── Redaction (port of adapter-utils/log-redaction.ts) ────────────────────────

/** Replace the user segment of a home path (`/home/alice/…`, `/Users/alice/…`, `C:\Users\alice\…`). */
export function redactHomePathUserSegments(text: string): string {
  return text
    .replace(/(\/(?:home|Users)\/)[^/\s]+/g, "$1<user>")
    .replace(/([A-Za-z]:\\Users\\)[^\\/\s]+/g, "$1<user>");
}

/** Redact obvious secrets in a command line (tokens after --token/--password/-p, bearer, env KEY=secret). */
export function redactCommandText(text: string): string {
  return text
    .replace(/(--(?:token|password|api[-_]?key|secret)[=\s]+)(\S+)/gi, "$1<redacted>")
    .replace(/(-p\s+)(\S+)/g, "$1<redacted>")
    .replace(/(Bearer\s+)[A-Za-z0-9._-]+/gi, "$1<redacted>")
    .replace(/\b([A-Z0-9_]*(?:TOKEN|SECRET|PASSWORD|KEY)=)\S+/g, "$1<redacted>");
}

function scrub(text: string): string {
  return redactCommandText(redactHomePathUserSegments(text));
}

// ── Parser ────────────────────────────────────────────────────────────────────

/**
 * Parse one line of a runtime's JSON stdout into transcript entries. Recognizes the common shapes across
 * Claude/Codex/Gemini/opencode; unknown JSON becomes a `raw` entry, non-JSON becomes a `raw` text entry,
 * and blank lines yield nothing. All text is redacted. `ts` is the observation time (ms epoch).
 */
export function parseLine(line: string, ts: number): TranscriptEntry[] {
  const trimmed = line.trim();
  if (!trimmed) return [];

  let obj: Record<string, unknown>;
  try {
    obj = JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    return [{ kind: "raw", ts, text: scrub(trimmed) }];
  }
  if (!obj || typeof obj !== "object") return [{ kind: "raw", ts, text: scrub(trimmed) }];

  const type = String((obj.type ?? obj.role ?? "") as string).toLowerCase();
  const out: TranscriptEntry[] = [];

  // Claude stream-json: { type:"assistant", message:{ content:[ {type:"text"|"thinking"|"tool_use"} ] } }
  const message = obj.message as { content?: unknown } | undefined;
  const content = message?.content ?? obj.content;
  if (Array.isArray(content)) {
    for (const block of content as Record<string, unknown>[]) {
      const bType = String(block.type ?? "").toLowerCase();
      if (bType === "text" && typeof block.text === "string")
        out.push({ kind: "assistant", ts, text: scrub(block.text) });
      else if ((bType === "thinking" || bType === "reasoning") && typeof block.thinking === "string")
        out.push({ kind: "thinking", ts, text: scrub(block.thinking) });
      else if (bType === "thinking" && typeof block.text === "string")
        out.push({ kind: "thinking", ts, text: scrub(block.text) });
      else if (bType === "tool_use" || bType === "tool_call")
        out.push({ kind: "tool_call", ts, tool: String(block.name ?? "tool"), args: block.input ?? block.arguments });
      else if (bType === "tool_result")
        out.push({ kind: "tool_result", ts, result: block.content ?? block.output, isError: Boolean(block.is_error) });
    }
    if (out.length) return out;
  }

  // Flat event shapes (Codex/Gemini/opencode item events + generic)
  switch (type) {
    case "assistant":
    case "message":
    case "assistant_message":
    case "text":
      if (typeof obj.text === "string") return [{ kind: "assistant", ts, text: scrub(obj.text) }];
      if (typeof content === "string") return [{ kind: "assistant", ts, text: scrub(content) }];
      break;
    case "thinking":
    case "reasoning":
      if (typeof (obj.text ?? obj.thinking ?? obj.reasoning) === "string")
        return [{ kind: "thinking", ts, text: scrub(String(obj.text ?? obj.thinking ?? obj.reasoning)) }];
      break;
    case "tool_use":
    case "tool_call":
    case "command_execution":
    case "function_call":
      return [
        {
          kind: "tool_call",
          ts,
          tool: String(obj.name ?? obj.tool ?? obj.command ?? "tool"),
          args: obj.input ?? obj.arguments ?? obj.args,
        },
      ];
    case "tool_result":
    case "function_result":
    case "command_output":
      return [
        {
          kind: "tool_result",
          ts,
          tool: obj.name ? String(obj.name) : undefined,
          result: obj.output ?? obj.result ?? obj.content,
          isError: Boolean(obj.is_error ?? obj.error),
        },
      ];
    case "diff":
    case "patch":
      if (typeof (obj.diff ?? obj.patch ?? obj.text) === "string")
        return [{ kind: "diff", ts, text: scrub(String(obj.diff ?? obj.patch ?? obj.text)) }];
      break;
  }

  // Nested item wrapper (Codex `{type:"item.completed", item:{...}}`)
  if (obj.item && typeof obj.item === "object")
    return parseLine(JSON.stringify(obj.item), ts);

  // Unknown JSON — keep it as raw so nothing is silently dropped.
  return [{ kind: "raw", ts, text: scrub(trimmed) }];
}

/** Parse a whole chunk (possibly many newline-separated lines) into entries, in order. */
export function parseTranscriptChunk(chunk: string, ts: number): TranscriptEntry[] {
  return chunk.split("\n").flatMap((line) => parseLine(line, ts));
}

/**
 * Hermes HTTP + SSE gateway adapter service (ported from Paperclip's `hermes_gateway`).
 *
 * The `hermes-gateway` code adapter (`packages/utils/src/adapters.ts`) renders a `POST /v1/runs`
 * HTTP invocation; the DB `AgentAdapter` row (`server/adapters/registry.ts`) carries its
 * transport ("gateway") + config schema (base URL + auth secret-ref). This module is the runtime
 * seam: it POSTs a run to an already-running Hermes API server, consumes the run's SSE event
 * stream, and surfaces output lines through the caller's `onLog` seam (the same
 * `{ stream, data }` shape the sandbox path feeds into `appendRunLog`).
 *
 * Everything here is pure/injectable: `buildHermesRunRequest` and the SSE parser take plain data
 * and `runHermesGateway` accepts an injected `fetch`, so the whole path is unit-testable with no
 * real network. Auth is a resolved secret value passed at call time — the persisted config only
 * ever holds a vault secret-ref (`apiKeySecretRef`), never an inline key.
 */

export const HERMES_GATEWAY_ADAPTER_TYPE = "hermes-gateway";

export const DEFAULT_HERMES_TIMEOUT_SEC = 600;
export const DEFAULT_HERMES_EVENT_RECONNECT_MS = 2_000;

const DEFAULT_HERMES_DASHBOARD_PORT = "9119";
const HERMES_DASHBOARD_API_PATHS = new Set(["", "/", "/chat"]);

const TERMINAL_STATUSES = new Set([
  "completed",
  "failed",
  "error",
  "cancelled",
  "canceled",
  "stopped",
  "interrupted",
]);
const FAILURE_STATUSES = new Set(["failed", "error"]);

// Headers the adapter always generates itself — an operator's extra-headers bag can never override
// them (auth/session correctness + idempotency are security-critical).
const CRITICAL_HEADERS = new Set([
  "authorization",
  "content-type",
  "accept",
  "idempotency-key",
  "x-hermes-session-key",
]);

const BEARER_TOKEN_PATTERN = /Bearer\s+\S+/gi;

export type HermesSessionKeyStrategy = "issue" | "agent" | "run" | "none";

/** Resolved Hermes gateway config. `apiKey` is the resolved secret value (never persisted inline). */
export interface HermesGatewayConfig {
  apiBaseUrl: string;
  apiKey: string;
  sessionKeyStrategy?: HermesSessionKeyStrategy;
  instructions?: string | null;
  /** Optional non-secret extra headers (JSON object or already-parsed record). */
  headers?: Record<string, string> | string | null;
  timeoutSec?: number;
  eventReconnectMs?: number;
  /** Dev-only escape hatch: permit remote plain-HTTP gateways (loopback HTTP is always allowed). */
  dangerouslyAllowInsecureRemoteHttp?: boolean;
}

/** Per-run context the request builder needs. */
export interface HermesRunContext {
  runId: string;
  /** The assembled prompt/brief sent to Hermes as the wake input. */
  prompt: string;
  /** Stable session key (issue/agent/run scoped); null → no cross-run memory. */
  sessionKey?: string | null;
  /** Optional model override forwarded to Hermes. */
  model?: string | null;
}

export interface HermesUsage {
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens?: number;
}

export type HermesGatewayEvent =
  | { kind: "output"; text: string }
  | { kind: "usage"; usage: HermesUsage }
  | { kind: "terminal"; status: string; output: string | null; usage?: HermesUsage }
  | { kind: "log"; eventName: string | null; data: unknown };

export interface HermesSseFrame {
  event: string | null;
  data: string;
}

export interface HermesRunRequest {
  url: string;
  method: "POST";
  headers: Record<string, string>;
  body: string;
}

export type HermesLogSink = (chunk: { stream: "stdout" | "stderr"; data: string }) => void;

// ── small helpers ────────────────────────────────────────────────────────────

function nonEmpty(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asNumber(value: unknown, fallback = 0): number {
  const n =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number.parseFloat(value)
        : Number.NaN;
  return Number.isFinite(n) ? n : fallback;
}

function isLoopbackHostname(hostname: string): boolean {
  const value = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  return (
    value === "localhost" ||
    value === "::1" ||
    value === "0:0:0:0:0:0:0:1" ||
    /^127(?:\.\d{1,3}){3}$/.test(value)
  );
}

/** Redact bearer tokens and the exact api key from a log/error string. */
function redact(value: string, apiKey?: string): string {
  let out = value.replace(BEARER_TOKEN_PATTERN, "Bearer [redacted]");
  if (apiKey && apiKey.length >= 4) out = out.split(apiKey).join("[redacted]");
  return out;
}

/**
 * Normalize a Hermes base URL. Accepts the dashboard root/chat URL on the default dashboard port and
 * maps it to `/api`; strips trailing slashes, query, and hash. Returns null for a non-HTTP(S) or
 * unparseable value.
 */
export function normalizeHermesBaseUrl(value: string): URL | null {
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    const normalizedPath = url.pathname.replace(/\/+$/, "") || "/";
    if (
      url.port === DEFAULT_HERMES_DASHBOARD_PORT &&
      HERMES_DASHBOARD_API_PATHS.has(normalizedPath)
    ) {
      url.pathname = "/api";
    } else {
      url.pathname = url.pathname.replace(/\/+$/, "");
    }
    url.search = "";
    url.hash = "";
    return url;
  } catch {
    return null;
  }
}

/** A remote (non-loopback) gateway reached over plain HTTP is denied unless the escape hatch is set. */
export function isRemotePlainHttpDenied(baseUrl: URL, config: HermesGatewayConfig): boolean {
  const remotePlainHttp = baseUrl.protocol === "http:" && !isLoopbackHostname(baseUrl.hostname);
  return remotePlainHttp && config.dangerouslyAllowInsecureRemoteHttp !== true;
}

function apiUrl(baseUrl: URL, path: string): string {
  return `${baseUrl.toString().replace(/\/+$/, "")}${path}`;
}

function parseExtraHeaders(value: HermesGatewayConfig["headers"]): Record<string, string> {
  let source: unknown = value;
  if (typeof value === "string") {
    try {
      source = value.trim() ? JSON.parse(value) : {};
    } catch {
      source = {};
    }
  }
  const record = asRecord(source);
  const headers: Record<string, string> = {};
  if (!record) return headers;
  for (const [key, entry] of Object.entries(record)) {
    const name = key.trim();
    if (!name || CRITICAL_HEADERS.has(name.toLowerCase())) continue;
    if (typeof entry === "string") headers[name] = entry;
  }
  return headers;
}

function buildHeaders(input: {
  apiKey: string;
  runId: string;
  sessionKey: string | null;
  extraHeaders: Record<string, string>;
  accept: string;
  contentType?: string;
}): Record<string, string> {
  return {
    ...input.extraHeaders,
    Authorization: `Bearer ${input.apiKey}`,
    Accept: input.accept,
    ...(input.contentType ? { "Content-Type": input.contentType } : {}),
    "Idempotency-Key": input.runId,
    ...(input.sessionKey ? { "X-Hermes-Session-Key": input.sessionKey } : {}),
  };
}

/**
 * Build the `POST /v1/runs` request from resolved config + run context. Pure — no I/O. The auth key
 * is applied as an `Authorization: Bearer` header; the session key (when present) as
 * `X-Hermes-Session-Key`; the run id as the idempotency key.
 */
export function buildHermesRunRequest(
  config: HermesGatewayConfig,
  ctx: HermesRunContext,
): HermesRunRequest {
  const baseUrl = normalizeHermesBaseUrl(config.apiBaseUrl);
  if (!baseUrl) throw new Error(`Invalid Hermes gateway apiBaseUrl: ${config.apiBaseUrl}`);
  const sessionKey = nonEmpty(ctx.sessionKey);
  const headers = buildHeaders({
    apiKey: config.apiKey,
    runId: ctx.runId,
    sessionKey,
    extraHeaders: parseExtraHeaders(config.headers),
    accept: "application/json",
    contentType: "application/json",
  });
  const instructions =
    nonEmpty(config.instructions) ??
    "Follow the wake instructions exactly. Do not expose secrets in logs, comments, or final output.";
  const body: Record<string, unknown> = {
    input: ctx.prompt,
    instructions,
    ...(sessionKey ? { session_id: sessionKey } : {}),
    ...(nonEmpty(ctx.model) ? { model: ctx.model } : {}),
  };
  return { url: apiUrl(baseUrl, "/v1/runs"), method: "POST", headers, body: JSON.stringify(body) };
}

// ── SSE parsing ───────────────────────────────────────────────────────────────

/**
 * Split a raw SSE buffer into complete frames. Frames are separated by a blank line; comment lines
 * (`:` prefix) are ignored. Returns the parsed frames plus the trailing incomplete `rest` so a
 * streamed reader can carry it into the next chunk.
 */
export function parseSseFrames(buffer: string): { frames: HermesSseFrame[]; rest: string } {
  const normalized = buffer.replace(/\r\n/g, "\n");
  const frames: HermesSseFrame[] = [];
  let offset = 0;
  while (true) {
    const idx = normalized.indexOf("\n\n", offset);
    if (idx < 0) break;
    const rawFrame = normalized.slice(offset, idx);
    offset = idx + 2;
    let event: string | null = null;
    const dataLines: string[] = [];
    for (const line of rawFrame.split("\n")) {
      if (!line || line.startsWith(":")) continue;
      if (line.startsWith("event:")) {
        event = line.slice("event:".length).trim();
      } else if (line.startsWith("data:")) {
        dataLines.push(line.slice("data:".length).trimStart());
      }
    }
    if (dataLines.length > 0) frames.push({ event, data: dataLines.join("\n") });
  }
  return { frames, rest: normalized.slice(offset) };
}

function parseJsonData(data: string): unknown {
  try {
    return JSON.parse(data);
  } catch {
    return { text: data };
  }
}

function extractOutput(value: unknown): string | null {
  const record = asRecord(value);
  if (!record) return null;
  const direct =
    nonEmpty(record.output) ??
    nonEmpty(record.result) ??
    nonEmpty(record.text) ??
    nonEmpty(record.summary) ??
    nonEmpty(record.message);
  if (direct) return direct;
  const nested = asRecord(record.data) ?? asRecord(record.payload);
  return nested ? extractOutput(nested) : null;
}

/** Parse a Hermes usage record (both snake_case and camelCase keys), or null when nothing meaningful. */
export function parseHermesUsage(value: unknown): HermesUsage | null {
  const record = asRecord(value);
  if (!record) return null;
  const source = asRecord(record.usage) ?? record;
  const inputTokens = asNumber(source.input_tokens ?? source.inputTokens ?? source.input, 0);
  const outputTokens = asNumber(source.output_tokens ?? source.outputTokens ?? source.output, 0);
  const cachedInputTokens = asNumber(source.cached_input_tokens ?? source.cachedInputTokens, 0);
  if (inputTokens <= 0 && outputTokens <= 0 && cachedInputTokens <= 0) return null;
  return {
    inputTokens,
    outputTokens,
    ...(cachedInputTokens > 0 ? { cachedInputTokens } : {}),
  };
}

/**
 * Interpret one SSE frame into a typed Hermes event. `message.delta` frames carry incremental output
 * text; a terminal status (completed/failed/…) closes the run; frames carrying token usage surface a
 * usage event. Everything else is a generic log event.
 */
export function interpretHermesFrame(frame: HermesSseFrame): HermesGatewayEvent {
  const parsed = parseJsonData(frame.data);
  const record = asRecord(parsed);
  const eventName = nonEmpty(record?.event) ?? nonEmpty(record?.type) ?? frame.event;

  const status =
    nonEmpty(record?.status)?.toLowerCase() ??
    (eventName?.startsWith("run.") ? eventName.slice(4).toLowerCase() : null);
  if (status && TERMINAL_STATUSES.has(status)) {
    const usage = parseHermesUsage(parsed);
    return {
      kind: "terminal",
      status,
      output: extractOutput(parsed),
      ...(usage ? { usage } : {}),
    };
  }

  // Streaming deltas must preserve whitespace (a trailing space is meaningful), so do NOT trim —
  // only require that the value is a non-empty string.
  const deltaRaw =
    typeof record?.delta === "string"
      ? record.delta
      : typeof record?.text_delta === "string"
        ? record.text_delta
        : null;
  if (eventName === "message.delta" && deltaRaw && deltaRaw.length > 0) {
    return { kind: "output", text: deltaRaw };
  }

  const usage = parseHermesUsage(parsed);
  if (usage) return { kind: "usage", usage };

  return { kind: "log", eventName, data: parsed };
}

/**
 * Convenience: parse a whole (already-complete) SSE buffer into typed events. Ignores any trailing
 * partial frame. Used for tests and non-streaming consumers.
 */
export function parseHermesSseStream(buffer: string): HermesGatewayEvent[] {
  return parseSseFrames(buffer).frames.map(interpretHermesFrame);
}

// ── orchestrator ───────────────────────────────────────────────────────────────

export interface HermesGatewayResult {
  exitCode: number;
  runId: string | null;
  status: string | null;
  output: string;
  usage: HermesUsage | null;
  errorCode?: string;
  errorMessage?: string;
}

function extractRunId(value: unknown): string | null {
  const record = asRecord(value);
  return nonEmpty(record?.run_id) ?? nonEmpty(record?.runId) ?? nonEmpty(record?.id);
}

/**
 * POST a run to the Hermes gateway, then consume its SSE event stream, streaming output through
 * `onLog` until a terminal event (or the stream ends). Returns the final disposition. `fetchImpl`
 * is injectable so callers/tests can substitute a fake — no direct global-fetch coupling.
 */
export async function runHermesGateway(input: {
  config: HermesGatewayConfig;
  ctx: HermesRunContext;
  onLog: HermesLogSink;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
}): Promise<HermesGatewayResult> {
  const { config, ctx, onLog } = input;
  const fetchImpl = input.fetchImpl ?? fetch;
  const apiKey = config.apiKey;

  const failure = (
    errorCode: string,
    errorMessage: string,
    runId: string | null = null,
  ): HermesGatewayResult => {
    onLog({ stream: "stderr", data: `[hermes-gateway] ${errorMessage}\n` });
    return { exitCode: 1, runId, status: null, output: "", usage: null, errorCode, errorMessage };
  };

  const baseUrl = normalizeHermesBaseUrl(config.apiBaseUrl);
  if (!baseUrl) {
    return failure(
      "hermes_gateway_api_base_url_invalid",
      `Invalid Hermes gateway apiBaseUrl: ${config.apiBaseUrl}`,
    );
  }
  if (!nonEmpty(config.apiKey)) {
    return failure(
      "hermes_gateway_api_key_missing",
      "Hermes gateway adapter requires a resolved apiKey.",
    );
  }
  if (isRemotePlainHttpDenied(baseUrl, config)) {
    return failure(
      "hermes_gateway_plain_http_remote_denied",
      `Hermes gateway apiBaseUrl uses remote plain HTTP for "${baseUrl.hostname}". Use HTTPS or set dangerouslyAllowInsecureRemoteHttp=true only for unsafe local development.`,
    );
  }

  const request = buildHermesRunRequest(config, ctx);
  onLog({ stream: "stdout", data: `[hermes-gateway] creating run at ${request.url}\n` });

  let runId: string | null = null;
  try {
    const res = await fetchImpl(request.url, {
      method: request.method,
      headers: request.headers,
      body: request.body,
      signal: input.signal,
    });
    const created = await readJson(res);
    if (!res.ok) {
      return failure(
        classifyStatus(res.status),
        redact(`Hermes gateway HTTP ${res.status} creating run`, apiKey),
      );
    }
    runId = extractRunId(created);
    if (!runId) {
      return failure(
        "hermes_gateway_protocol_error",
        "Hermes /v1/runs response did not include run_id.",
      );
    }
  } catch (err) {
    return failure("hermes_gateway_connect_failed", redact(errText(err), apiKey));
  }

  onLog({ stream: "stdout", data: `[hermes-gateway] run created: ${runId}\n` });

  const eventHeaders = buildHeaders({
    apiKey,
    runId: ctx.runId,
    sessionKey: nonEmpty(ctx.sessionKey),
    extraHeaders: parseExtraHeaders(config.headers),
    accept: "text/event-stream",
  });

  const outputChunks: string[] = [];
  let usage: HermesUsage | null = null;
  let terminalStatus: string | null = null;
  let terminalOutput: string | null = null;

  try {
    const res = await fetchImpl(apiUrl(baseUrl, `/v1/runs/${encodeURIComponent(runId)}/events`), {
      method: "GET",
      headers: eventHeaders,
      signal: input.signal,
    });
    if (!res.ok || !res.body) {
      onLog({
        stream: "stderr",
        data: `[hermes-gateway] event stream unavailable (HTTP ${res.status})\n`,
      });
    } else {
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let done = false;
      while (!done) {
        const chunk = await reader.read();
        if (chunk.done) {
          buffer += "\n\n"; // flush any trailing complete-but-unterminated frame
          done = true;
        } else {
          buffer += decoder.decode(chunk.value, { stream: true });
        }
        const parsed = parseSseFrames(buffer);
        buffer = parsed.rest;
        for (const frame of parsed.frames) {
          const event = interpretHermesFrame(frame);
          if (event.kind === "output") {
            const text = redact(event.text, apiKey);
            outputChunks.push(text);
            onLog({ stream: "stdout", data: text });
          } else if (event.kind === "usage") {
            usage = event.usage;
          } else if (event.kind === "terminal") {
            terminalStatus = event.status;
            terminalOutput = event.output;
            if (event.usage) usage = event.usage;
            done = true;
            break;
          }
        }
      }
    }
  } catch (err) {
    onLog({
      stream: "stderr",
      data: `[hermes-gateway] event stream error: ${redact(errText(err), apiKey)}\n`,
    });
  }

  const output = redact(terminalOutput ?? outputChunks.join("").trim(), apiKey);
  const failed = terminalStatus != null && FAILURE_STATUSES.has(terminalStatus);
  return {
    exitCode: terminalStatus === "completed" ? 0 : failed ? 1 : terminalStatus ? 1 : 0,
    runId,
    status: terminalStatus,
    output,
    usage,
    ...(failed
      ? { errorCode: "hermes_gateway_run_failed", errorMessage: `Hermes run ${terminalStatus}` }
      : {}),
  };
}

function classifyStatus(status: number): string {
  if (status === 401 || status === 403) return "hermes_gateway_auth_failed";
  if (status === 404) return "hermes_gateway_runs_unsupported";
  if (status === 429) return "hermes_gateway_rate_limited";
  if (status >= 500) return "hermes_gateway_upstream_error";
  return "hermes_gateway_protocol_error";
}

async function readJson(res: { text(): Promise<string> }): Promise<unknown> {
  const text = await res.text();
  if (!text.trim()) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { text };
  }
}

function errText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

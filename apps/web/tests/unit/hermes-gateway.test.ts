import { describe, it, expect, vi } from "vitest";
import {
  buildHermesRunRequest,
  parseSseFrames,
  parseHermesSseStream,
  interpretHermesFrame,
  parseHermesUsage,
  normalizeHermesBaseUrl,
  isRemotePlainHttpDenied,
  runHermesGateway,
  type HermesGatewayConfig,
  type HermesRunContext,
} from "@/server/adapters/hermes-gateway";

const baseConfig: HermesGatewayConfig = {
  apiBaseUrl: "https://hermes.example.com",
  apiKey: "secret-server-key-123456",
};

const baseCtx: HermesRunContext = {
  runId: "run_abc",
  prompt: "Do the thing.",
};

// A small fake ReadableStream that yields the given chunks then closes.
function streamOf(chunks: string[]): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  let i = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (i < chunks.length) controller.enqueue(enc.encode(chunks[i++]));
      else controller.close();
    },
  });
}

describe("normalizeHermesBaseUrl", () => {
  it("strips trailing slash / query / hash", () => {
    expect(normalizeHermesBaseUrl("https://h.example.com/api/?x=1#f")!.toString()).toBe(
      "https://h.example.com/api",
    );
  });

  it("maps the dashboard root/chat URL on the default port to /api", () => {
    expect(normalizeHermesBaseUrl("http://127.0.0.1:9119/chat")!.pathname).toBe("/api");
    expect(normalizeHermesBaseUrl("http://127.0.0.1:9119/")!.pathname).toBe("/api");
  });

  it("rejects non-HTTP protocols", () => {
    expect(normalizeHermesBaseUrl("ftp://h.example.com")).toBeNull();
    expect(normalizeHermesBaseUrl("not a url")).toBeNull();
  });
});

describe("isRemotePlainHttpDenied", () => {
  it("denies remote plain HTTP without the escape hatch", () => {
    const url = normalizeHermesBaseUrl("http://hermes.example.com")!;
    expect(isRemotePlainHttpDenied(url, baseConfig)).toBe(true);
  });

  it("allows loopback plain HTTP", () => {
    const url = normalizeHermesBaseUrl("http://127.0.0.1:8642")!;
    expect(isRemotePlainHttpDenied(url, baseConfig)).toBe(false);
  });

  it("allows remote plain HTTP when the escape hatch is set", () => {
    const url = normalizeHermesBaseUrl("http://hermes.example.com")!;
    expect(
      isRemotePlainHttpDenied(url, { ...baseConfig, dangerouslyAllowInsecureRemoteHttp: true }),
    ).toBe(false);
  });
});

describe("buildHermesRunRequest", () => {
  it("builds a correct POST /v1/runs request from config", () => {
    const req = buildHermesRunRequest(baseConfig, baseCtx);
    expect(req.method).toBe("POST");
    expect(req.url).toBe("https://hermes.example.com/v1/runs");
    expect(req.headers.Authorization).toBe("Bearer secret-server-key-123456");
    expect(req.headers.Accept).toBe("application/json");
    expect(req.headers["Content-Type"]).toBe("application/json");
    expect(req.headers["Idempotency-Key"]).toBe("run_abc");
    const body = JSON.parse(req.body);
    expect(body.input).toBe("Do the thing.");
    expect(typeof body.instructions).toBe("string");
    // no session key → no session_id / X-Hermes-Session-Key
    expect(body.session_id).toBeUndefined();
    expect(req.headers["X-Hermes-Session-Key"]).toBeUndefined();
  });

  it("attaches the session key + model when provided", () => {
    const req = buildHermesRunRequest(baseConfig, {
      ...baseCtx,
      sessionKey: "paperclip:run:run_abc",
      model: "hermes-large",
    });
    expect(req.headers["X-Hermes-Session-Key"]).toBe("paperclip:run:run_abc");
    const body = JSON.parse(req.body);
    expect(body.session_id).toBe("paperclip:run:run_abc");
    expect(body.model).toBe("hermes-large");
  });

  it("keeps operator extra headers but never overrides critical ones", () => {
    const req = buildHermesRunRequest(
      { ...baseConfig, headers: { "X-Trace": "t1", Authorization: "Bearer hijack" } },
      baseCtx,
    );
    expect(req.headers["X-Trace"]).toBe("t1");
    // the adapter-generated Authorization wins
    expect(req.headers.Authorization).toBe("Bearer secret-server-key-123456");
  });

  it("throws on an invalid base URL", () => {
    expect(() => buildHermesRunRequest({ ...baseConfig, apiBaseUrl: "nope" }, baseCtx)).toThrow();
  });
});

describe("parseSseFrames", () => {
  it("splits complete frames and returns the trailing partial as rest", () => {
    const { frames, rest } = parseSseFrames(
      'event: message.delta\ndata: {"delta":"hi"}\n\ndata: {"partial"',
    );
    expect(frames).toEqual([{ event: "message.delta", data: '{"delta":"hi"}' }]);
    expect(rest).toBe('data: {"partial"');
  });

  it("ignores comment lines and normalizes CRLF", () => {
    const { frames } = parseSseFrames(':keep-alive\r\ndata: {"x":1}\r\n\r\n');
    expect(frames).toEqual([{ event: null, data: '{"x":1}' }]);
  });
});

describe("interpretHermesFrame / parseHermesSseStream", () => {
  it("parses an SSE event stream sample into output + usage + terminal events", () => {
    const sample = [
      'event: message.delta\ndata: {"event":"message.delta","delta":"Hello "}',
      'event: message.delta\ndata: {"event":"message.delta","delta":"world"}',
      'data: {"type":"usage","usage":{"input_tokens":12,"output_tokens":8,"cached_input_tokens":4}}',
      'event: run.completed\ndata: {"status":"completed","output":"Hello world","usage":{"input_tokens":12,"output_tokens":8}}',
      "",
    ].join("\n\n");

    const events = parseHermesSseStream(sample);
    expect(events[0]).toEqual({ kind: "output", text: "Hello " });
    expect(events[1]).toEqual({ kind: "output", text: "world" });
    expect(events[2]).toEqual({
      kind: "usage",
      usage: { inputTokens: 12, outputTokens: 8, cachedInputTokens: 4 },
    });
    expect(events[3]).toMatchObject({
      kind: "terminal",
      status: "completed",
      output: "Hello world",
    });
  });

  it("derives a terminal status from a run.* event name", () => {
    expect(interpretHermesFrame({ event: "run.failed", data: "{}" })).toMatchObject({
      kind: "terminal",
      status: "failed",
    });
  });

  it("treats an unknown frame as a generic log event", () => {
    expect(
      interpretHermesFrame({ event: "heartbeat", data: '{"event":"heartbeat"}' }),
    ).toMatchObject({
      kind: "log",
      eventName: "heartbeat",
    });
  });

  it("parseHermesUsage returns null when no tokens are present", () => {
    expect(parseHermesUsage({ usage: { input_tokens: 0, output_tokens: 0 } })).toBeNull();
  });
});

describe("runHermesGateway (mocked fetch — no network)", () => {
  it("POSTs a run, consumes the SSE stream, and surfaces output through onLog", async () => {
    const logs: Array<{ stream: string; data: string }> = [];
    const events = [
      'event: message.delta\ndata: {"event":"message.delta","delta":"Hello "}\n\n',
      'event: message.delta\ndata: {"event":"message.delta","delta":"world"}\n\n',
      'event: run.completed\ndata: {"status":"completed","output":"Hello world","usage":{"input_tokens":10,"output_tokens":5}}\n\n',
    ];

    const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const href = typeof url === "string" ? url : url.toString();
      if (init?.method === "POST") {
        return new Response(JSON.stringify({ run_id: "run_srv_1" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      expect(href).toContain("/v1/runs/run_srv_1/events");
      return new Response(streamOf(events), {
        status: 200,
        headers: { "content-type": "text/event-stream" },
      });
    }) as unknown as typeof fetch;

    const result = await runHermesGateway({
      config: baseConfig,
      ctx: baseCtx,
      onLog: (c) => logs.push(c),
      fetchImpl,
    });

    expect(result.exitCode).toBe(0);
    expect(result.runId).toBe("run_srv_1");
    expect(result.status).toBe("completed");
    expect(result.output).toBe("Hello world");
    expect(result.usage).toEqual({ inputTokens: 10, outputTokens: 5 });
    // streamed deltas reached the log seam
    expect(logs.map((l) => l.data).join("")).toContain("Hello ");
    expect(logs.map((l) => l.data).join("")).toContain("world");
  });

  it("redacts the api key if it ever appears in streamed output", async () => {
    const logs: Array<{ stream: string; data: string }> = [];
    const leaky = `event: message.delta\ndata: {"event":"message.delta","delta":"key is ${baseConfig.apiKey}"}\n\nevent: run.completed\ndata: {"status":"completed"}\n\n`;
    const fetchImpl = vi.fn(async (_url: unknown, init?: RequestInit) =>
      init?.method === "POST"
        ? new Response(JSON.stringify({ run_id: "r" }), { status: 200 })
        : new Response(streamOf([leaky]), { status: 200 }),
    ) as unknown as typeof fetch;

    const result = await runHermesGateway({
      config: baseConfig,
      ctx: baseCtx,
      onLog: (c) => logs.push(c),
      fetchImpl,
    });
    expect(result.output).not.toContain(baseConfig.apiKey);
    expect(logs.map((l) => l.data).join("")).not.toContain(baseConfig.apiKey);
  });

  it("returns a shaped auth failure on a 401 without leaking the key", async () => {
    const logs: Array<{ stream: string; data: string }> = [];
    const fetchImpl = vi.fn(
      async () => new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 }),
    ) as unknown as typeof fetch;

    const result = await runHermesGateway({
      config: baseConfig,
      ctx: baseCtx,
      onLog: (c) => logs.push(c),
      fetchImpl,
    });
    expect(result.exitCode).toBe(1);
    expect(result.errorCode).toBe("hermes_gateway_auth_failed");
    expect(JSON.stringify(logs)).not.toContain(baseConfig.apiKey);
  });

  it("denies a remote plain-HTTP gateway without the escape hatch", async () => {
    const fetchImpl = vi.fn() as unknown as typeof fetch;
    const result = await runHermesGateway({
      config: { ...baseConfig, apiBaseUrl: "http://hermes.example.com" },
      ctx: baseCtx,
      onLog: () => {},
      fetchImpl,
    });
    expect(result.errorCode).toBe("hermes_gateway_plain_http_remote_denied");
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

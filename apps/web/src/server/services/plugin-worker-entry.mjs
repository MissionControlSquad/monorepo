// Plugin worker entrypoint (parity #129). A plain, dependency-free ESM module that child_process.fork()
// runs as the worker process. It loads ONE plugin module (path in env PLUGIN_MODULE) and speaks NDJSON
// JSON-RPC over stdin/stdout with the host (ForkPluginWorkerManager). stdout carries ONLY framed
// JSON-RPC — logs go to stderr — so the wire never desyncs.
//
// The plugin module contract (kept intentionally tiny):
//   export const tools = { [name]: async (args, ctx) => result }
//   export const jobs  = { [jobKey]: async (payload, ctx) => result }
//   export const meta  = { onShutdown?: async () => void }   // optional
//
// SECURITY SEAM: this loads the module with a normal dynamic import — it does NOT sandbox untrusted code
// (no seccomp / container / VM). The isolation we DO get is process + minimal-env isolation from the
// fork. Executing arbitrary third-party npm plugin code safely is a deliberately-deferred seam; in-repo
// example/first-party plugins are the supported case today.

const PLUGIN_MODULE = process.env.PLUGIN_MODULE;
const PLUGIN_ID = process.env.PLUGIN_ID || "unknown";

function send(msg) {
  process.stdout.write(JSON.stringify(msg) + "\n");
}
function log(...args) {
  // stderr only — never pollute the stdout NDJSON stream.
  process.stderr.write(`[plugin ${PLUGIN_ID}] ${args.join(" ")}\n`);
}
function replyResult(id, result) {
  if (id !== undefined) send({ jsonrpc: "2.0", id, result });
}
function replyError(id, message, code = -32000) {
  if (id !== undefined) send({ jsonrpc: "2.0", id, error: { code, message } });
}

let mod = null;
async function loadModule() {
  if (!PLUGIN_MODULE) throw new Error("PLUGIN_MODULE env is required");
  mod = await import(PLUGIN_MODULE);
  return mod;
}

async function handleInvoke(id, params) {
  if (!mod) await loadModule();
  const { kind, name, args, payload } = params || {};
  if (kind === "tool") {
    const fn = mod.tools?.[name];
    if (typeof fn !== "function") return replyError(id, `unknown tool '${name}'`, -32601);
    const result = await fn(args, { pluginId: PLUGIN_ID });
    return replyResult(id, result);
  }
  if (kind === "job") {
    const fn = mod.jobs?.[name];
    if (typeof fn !== "function") return replyError(id, `unknown job '${name}'`, -32601);
    const result = await fn(payload, { pluginId: PLUGIN_ID });
    return replyResult(id, result);
  }
  return replyError(id, `unknown invoke kind '${kind}'`, -32602);
}

async function handleMessage(msg) {
  const { id, method, params } = msg;
  try {
    switch (method) {
      case "ping":
        return replyResult(id, { ok: true, pluginId: PLUGIN_ID });
      case "invoke":
        return await handleInvoke(id, params);
      case "shutdown":
        try {
          await mod?.meta?.onShutdown?.();
        } catch (e) {
          log("onShutdown error:", e?.message || String(e));
        }
        replyResult(id, { ok: true });
        // Flush stdout, then exit cleanly.
        process.exitCode = 0;
        setImmediate(() => process.exit(0));
        return;
      default:
        return replyError(id, `unknown method '${method}'`, -32601);
    }
  } catch (err) {
    return replyError(id, err?.message || String(err));
  }
}

// NDJSON line reader over stdin.
let buffer = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  buffer += chunk;
  let idx;
  while ((idx = buffer.indexOf("\n")) >= 0) {
    const line = buffer.slice(0, idx);
    buffer = buffer.slice(idx + 1);
    if (!line.trim()) continue;
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      log("dropped malformed frame");
      continue;
    }
    // Fire and forget; each handler replies by id.
    void handleMessage(msg);
  }
});
process.stdin.on("end", () => process.exit(0));

// Eagerly load so a bad module path surfaces early (and so the first invoke isn't slowed by import).
loadModule().catch((err) => {
  log("failed to load module:", err?.message || String(err));
  process.exit(2);
});

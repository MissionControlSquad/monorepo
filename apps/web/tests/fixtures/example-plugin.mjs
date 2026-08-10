// A trivial, in-repo example plugin exercised by the worker round-trip tests. It follows the plugin
// module contract the worker entry expects: `tools` and `jobs` maps, plus optional `meta.onShutdown`.
// Deliberately dependency-free so child_process.fork() can load it by path with a minimal env.

export const tools = {
  // Echoes its args back — the simplest fork+RPC round-trip.
  echo: async (args) => ({ echoed: args }),
  // A tiny bit of real work.
  add: async (args) => ({ sum: Number(args?.a ?? 0) + Number(args?.b ?? 0) }),
  // Throws — surfaces as a JSON-RPC error to the host (invoke rejects), worker stays alive.
  boom: async () => {
    throw new Error("boom from example plugin");
  },
  // Hard-crashes the worker process — used to prove the crash-backoff policy.
  crash: async () => {
    process.exit(1);
  },
};

export const jobs = {
  // A job handler; returns something the runner records as the job result.
  sync: async (payload) => ({ ran: true, payload: payload ?? null }),
};

export const meta = {
  onShutdown: async () => {
    // No-op here; a real plugin would flush/close resources.
  },
};

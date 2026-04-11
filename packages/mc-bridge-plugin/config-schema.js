export default {
  $schema: "http://json-schema.org/draft-07/schema#",
  type: "object",
  required: ["mcUrl", "token"],
  properties: {
    mcUrl: {
      type: "string",
      description: "WebSocket URL of Mission Control live gateway, e.g. ws://localhost:3000/live-gateway",
    },
    token: {
      type: "string",
      description: "One-time setup key from the Live Gateway wizard. Replaced by a permanent key after first connect.",
    },
    fingerprint: {
      type: "string",
      description: "Stable machine fingerprint. Leave blank to auto-derive from hostname + MAC.",
    },
    reconnectBaseMs: {
      type: "number",
      description: "Reconnect backoff base interval in milliseconds. Default: 2000",
    },
    reconnectMaxMs: {
      type: "number",
      description: "Maximum reconnect backoff in milliseconds. Default: 30000",
    },
  },
};

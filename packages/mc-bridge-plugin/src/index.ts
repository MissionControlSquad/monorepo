/**
 * mc-bridge OpenClaw plugin entry point.
 *
 * Registers with the OpenClaw runtime via definePluginEntry.
 * On activation: starts the WS client and agent reporter.
 * On deactivation: tears down both cleanly.
 */

import type { MCBridgeConfig } from "./config-schema";
import { MCBridgeWsClient } from "./ws-client";
import { AgentReporter } from "./agent-reporter";

// OpenClaw plugin runtime globals
declare const definePluginEntry: (def: {
  name: string;
  activate: (config: MCBridgeConfig) => Promise<void> | void;
  deactivate: () => Promise<void> | void;
}) => void;

let client: MCBridgeWsClient | null = null;
let reporter: AgentReporter | null = null;

definePluginEntry({
  name: "mc-bridge",

  async activate(config: MCBridgeConfig) {
    if (!config.mcUrl) {
      throw new Error("[mc-bridge] mcUrl is required in plugin config");
    }
    if (!config.token) {
      throw new Error("[mc-bridge] token is required in plugin config");
    }

    client = new MCBridgeWsClient(config);
    reporter = new AgentReporter(client);

    // Start reporter once WS is connected (mc.welcome received)
    client.onConnect(() => reporter!.start());

    await client.start();

    console.log("[mc-bridge] Plugin activated. Connecting to:", config.mcUrl);
  },

  async deactivate() {
    reporter?.stop();
    client?.stop();
    reporter = null;
    client = null;
    console.log("[mc-bridge] Plugin deactivated.");
  },
});

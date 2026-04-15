/**
 * agentcenter-bridge OpenClaw plugin entry point.
 *
 * Exports a plain OpenClawPluginDefinition object — no import from
 * "openclaw/plugin-sdk" needed. OpenClaw loads this module and calls
 * register(api) to wire up the service lifecycle.
 *
 * On start:  opens a persistent WebSocket to AgentCenter Cloud and starts the
 *            agent reporter (reads pluginConfig for agentCenterUrl + token).
 * On stop:   tears down the WS client and agent reporter cleanly.
 */

import type { MCBridgeConfig } from "./config-schema";
import { MCBridgeWsClient } from "./ws-client";
import { AgentReporter } from "./agent-reporter";
import { autoApprovePendingDevices } from "./openclaw-local";

let client: MCBridgeWsClient | null = null;
let reporter: AgentReporter | null = null;

// eslint-disable-next-line import/no-default-export
export default {
  id: "agentcenter-bridge",
  name: "AgentCenter Bridge",
  description:
    "Persistent WebSocket bridge between this OpenClaw instance and AgentCenter Cloud for live task delivery and agent status reporting.",

  // api is typed as `any` to avoid a hard dependency on openclaw/plugin-sdk
  // at bundle time. The shape matches OpenClawPluginApi at runtime.
  register(api: any) {
    api.registerService({
      id: "agentcenter-bridge-ws",

      async start() {
        const config = api.pluginConfig as MCBridgeConfig | undefined;

        if (!config?.agentCenterUrl) {
          api.logger.warn("[agentcenter-bridge] agentCenterUrl not set in plugin config — bridge not started");
          return;
        }
        if (!config?.token) {
          api.logger.warn("[agentcenter-bridge] token not set in plugin config — bridge not started");
          return;
        }

        // Optionally auto-approve local CLI device pairing requests so
        // `openclaw agent` uses the fast gateway path. Only runs when the user
        // explicitly sets autoApproveDevices: true in the plugin config.
        if (config.autoApproveDevices) {
          await autoApprovePendingDevices();
        }

        client = new MCBridgeWsClient(config);
        reporter = new AgentReporter(client);

        // Start reporter once WS handshake completes (mc.welcome received)
        client.onConnect(() => reporter!.start());

        await client.start();
        api.logger.info("[agentcenter-bridge] Bridge started →", config.agentCenterUrl);
      },

      async stop() {
        reporter?.stop();
        client?.stop();
        reporter = null;
        client = null;
        api.logger.info("[agentcenter-bridge] Bridge stopped.");
      },
    });
  },
};

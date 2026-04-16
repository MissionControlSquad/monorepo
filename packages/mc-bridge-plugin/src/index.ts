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

let client: MCBridgeWsClient | null = null;
let reporter: AgentReporter | null = null;
/** True only when this service instance actually started the bridge (not a no-op embedded start). */
let isRealBridge = false;

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
        // runEmbeddedAgent reloads plugins inside the same process. Prevent the
        // bridge from opening a second competing WebSocket (same token/fingerprint)
        // which would cause the server to evict the real connection.
        // Symbol.for() matches OpenClaw's own internal pattern and avoids
        // collisions with other plugins using the same globalThis technique.
        const DEPTH_KEY = Symbol.for("agentcenter.bridge.embeddedDepth");
        if (((globalThis as any)[DEPTH_KEY] ?? 0) > 0) {
          api.logger.info("[agentcenter-bridge] Embedded agent context — bridge already running, skipping duplicate start");
          isRealBridge = false;
          return;
        }

        const config = api.pluginConfig as MCBridgeConfig | undefined;

        if (!config?.agentCenterUrl) {
          api.logger.warn("[agentcenter-bridge] agentCenterUrl not set in plugin config — bridge not started");
          return;
        }
        if (!config?.token) {
          api.logger.warn("[agentcenter-bridge] token not set in plugin config — bridge not started");
          return;
        }

        isRealBridge = true;
        client = new MCBridgeWsClient(config, api);
        reporter = new AgentReporter(client, api);

        // Start reporter once WS handshake completes (mc.welcome received)
        client.onConnect(() => reporter!.start());

        await client.start();
        api.logger.info("[agentcenter-bridge] Bridge started →", config.agentCenterUrl);
      },

      async stop() {
        // Don't tear down the real bridge when stop is called by the embedded context.
        if (!isRealBridge) return;
        isRealBridge = false;
        reporter?.stop();
        client?.stop();
        reporter = null;
        client = null;
        api.logger.info("[agentcenter-bridge] Bridge stopped.");
      },
    });
  },
};

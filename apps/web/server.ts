/**
 * Custom Node.js server for AgentCenter.
 *
 * Wraps the Next.js request handler and adds a WebSocket server on the
 * same port for GraphQL subscriptions via graphql-ws.
 *
 * - Development:  `npm run dev:ws`  (tsx server.ts, Next.js dev mode)
 * - Production:   `node server.cjs` (esbuild bundle, standalone build)
 */

import { createServer, type IncomingMessage } from "node:http";
import { parse } from "node:url";
import next from "next";
import { WebSocketServer, type WebSocket } from "ws";
import { useServer as setupGraphQLWS } from "graphql-ws/use/ws";
import { execute, subscribe, type ExecutionArgs } from "graphql";

import { schema } from "./src/server/graphql/schema";
import { prisma } from "./src/server/prisma";
import { verifySessionToken, COOKIE_NAME } from "./src/server/admin-auth";
import { resolveTenancy } from "./src/server/tenancy";
import { isFeatureEnabled } from "./src/server/feature-flags";
import { FLAG_KEYS } from "@agentcenter/utils";
import {
  handlePluginConnection,
  startEvictionLoop,
} from "./src/server/services/live-gateway-handler";

const dev = process.env.NODE_ENV !== "production";
const hostname = process.env.HOSTNAME || "0.0.0.0";
const port = parseInt(process.env.PORT || "3000", 10);

// ── Helper: extract session from cookie header ────────────────────
async function sessionFromRequest(req: IncomingMessage) {
  const cookie = req.headers.cookie || "";
  const match = cookie.match(new RegExp(`${COOKIE_NAME}=([^;]+)`));
  const token = match ? match[1].trim() : null;
  if (!token) return null;
  const payload = await verifySessionToken(token);
  if (!payload?.profileId) return null;
  return {
    sub: payload.sub,
    username: payload.username,
    profileId: payload.profileId,
  };
}

// ── Create HTTP server ────────────────────────────────────────────
const server = createServer();

// ── WebSocket server for GraphQL subscriptions ────────────────────
const wss = new WebSocketServer({ noServer: true });

// ── WebSocket server for Live Gateway (mc-bridge plugin connections) ──
// Created at startup only if the LIVE_GATEWAY feature flag is enabled.
// Requires a server restart to pick up flag changes (intentional — avoids
// running unused WebSocket infrastructure when the feature is off).
let liveGatewayWss: WebSocketServer | null = null;

setupGraphQLWS(
  {
    schema,
    execute: execute as (args: ExecutionArgs) => any,
    subscribe: subscribe as (args: ExecutionArgs) => any,
    context: async (ctx) => {
      const session = await sessionFromRequest(ctx.extra.request);
      return { prisma, session, tenancy: resolveTenancy(session) };
    },
  },
  wss,
);

// Node.js only emits the 'upgrade' event when listenerCount('upgrade') > 0.
// Without this, the socket is silently closed before our emit override runs.
// In dev mode Next.js HMR adds its own listener (so it worked there);
// in production standalone there are no other listeners — this one is the gate.
server.on("upgrade", () => {
  /* handled by the emit override below */
});

/**
 * Override server.emit to intercept "upgrade" events for /api/graphql
 * BEFORE any other listener (including Next.js HMR) can see them.
 * This is the only reliable way to prevent Next.js from closing our
 * WebSocket connections in dev mode.
 */
const originalEmit = server.emit.bind(server);
(server as any).emit = function (event: string, ...args: any[]) {
  if (event === "upgrade") {
    const [req, socket, head] = args;
    const { pathname } = parse(req.url || "/", true);
    if (pathname === "/api/graphql") {
      wss.handleUpgrade(req, socket, head, (ws: WebSocket) => {
        wss.emit("connection", ws, req);
      });
      return true; // Swallow the event — no other listener sees it
    }
    if (pathname === "/live-gateway") {
      if (!liveGatewayWss) {
        socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
        socket.destroy();
        return true;
      }
      liveGatewayWss.handleUpgrade(req, socket, head, (ws: WebSocket) => {
        liveGatewayWss!.emit("connection", ws, req);
      });
      return true;
    }
  }
  return originalEmit(event, ...args);
};

// ── Bootstrap Next.js ─────────────────────────────────────────────
const app = next({ dev, hostname, port, dir: __dirname });
const handle = app.getRequestHandler();

app.prepare().then(async () => {
  // Check the LIVE_GATEWAY flag once at startup.
  // If enabled, create the WebSocket server and start the eviction loop.
  // If disabled, the /live-gateway upgrade path returns 403 with zero overhead.
  const liveGatewayEnabled = await isFeatureEnabled(FLAG_KEYS.LIVE_GATEWAY);
  if (liveGatewayEnabled) {
    liveGatewayWss = new WebSocketServer({ noServer: true });
    liveGatewayWss.on("connection", handlePluginConnection);
    startEvictionLoop();
  }

  server.on("request", async (req, res) => {
    const parsedUrl = parse(req.url!, true);
    await handle(req, res, parsedUrl);
  });

  server.listen(port, hostname, () => {
    const ws = ["graphql-ws", liveGatewayEnabled ? "live-gateway" : null]
      .filter(Boolean)
      .join(", ");
    console.log(`> Ready on http://${hostname}:${port} (ws: ${ws})`);
  });
});

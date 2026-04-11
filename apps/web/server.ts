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
const liveGatewayWss = new WebSocketServer({ noServer: true });
liveGatewayWss.on("connection", handlePluginConnection);
startEvictionLoop();

setupGraphQLWS(
  {
    schema,
    execute: execute as (args: ExecutionArgs) => any,
    subscribe: subscribe as (args: ExecutionArgs) => any,
    context: async (ctx) => {
      const session = await sessionFromRequest(ctx.extra.request);
      return { prisma, session };
    },
  },
  wss,
);

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
      liveGatewayWss.handleUpgrade(req, socket, head, (ws: WebSocket) => {
        liveGatewayWss.emit("connection", ws, req);
      });
      return true;
    }
  }
  return originalEmit(event, ...args);
};

// ── Bootstrap Next.js ─────────────────────────────────────────────
const app = next({ dev, hostname, port, dir: __dirname });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  server.on("request", async (req, res) => {
    const parsedUrl = parse(req.url!, true);
    await handle(req, res, parsedUrl);
  });

  server.listen(port, hostname, () => {
    console.log(`> Ready on http://${hostname}:${port} (ws: enabled)`);
  });
});

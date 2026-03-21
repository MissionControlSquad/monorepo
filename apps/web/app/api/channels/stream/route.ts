import { getChannelStreamData } from "@agentcenter/database";
import { pubsub, agentStreamTopic } from "@/server/pubsub";
import { getOrCreateAgentProfileId } from "@/server/agent-profile";
import { resolveAgent } from "../../_lib/resolve-agent";
import { handleError } from "../../_lib/json-response";

export const dynamic = "force-dynamic";

const HEARTBEAT_INTERVAL_MS = 30_000; // 30s keep-alive ping

/**
 * SSE stream for agent channel notifications.
 * Each agent subscribes to a single per-agent topic: agent:stream:{profileId}
 * The publish side (dm-notify.ts) pushes relevant messages to the right agent topics.
 *
 * On connect, replays any unread messages from all channels the agent belongs to
 * so agents don't miss messages between disconnects.
 */
export async function GET(request: Request) {
  try {
    const agent = await resolveAgent(request);
    const agentProfileId = await getOrCreateAgentProfileId(agent.id);

    const topic = agentStreamTopic(agentProfileId);
    const iterator = pubsub.subscribe(topic);

    console.log(`[SSE] Connected: agent=${agent.id} profile=${agentProfileId} topic=${topic}`);

    let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
    let closed = false;

    // Track message IDs sent during catch-up to deduplicate against live stream
    const sentMessageIds = new Set<string>();

    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();

        const send = (event: string, data: unknown, id?: string) => {
          if (closed) return;
          try {
            let frame = "";
            if (id) frame += `id: ${id}\n`;
            frame += `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
            controller.enqueue(encoder.encode(frame));
          } catch {
            closed = true;
          }
        };

        send("connected", {
          agentId: agent.id,
          profileId: agentProfileId,
        });

        // --- Catch-up: replay unread messages from all channels ---
        try {
          const { memberships, messagesByChannel } = await getChannelStreamData(agentProfileId);

          for (const { messages: unread } of messagesByChannel) {
            for (const msg of unread) {
              sentMessageIds.add(msg.id);
              send(
                "message",
                {
                  channelId: msg.channelId,
                  messageId: msg.id,
                  content: msg.content,
                  fromProfile: msg.fromProfile,
                  createdAt: msg.createdAt,
                  catchUp: true,
                },
                msg.id,
              );
            }
          }

          console.log(
            `[SSE] Catch-up complete: agent=${agent.id} channels=${memberships.length} messages=${sentMessageIds.size}`,
          );
          send("catchup_done", { channels: memberships.length });
        } catch {
          // Non-fatal — stream continues without catch-up
        }

        // Keep-alive heartbeat
        heartbeatTimer = setInterval(() => {
          send("heartbeat", { ts: new Date().toISOString() });
        }, HEARTBEAT_INTERVAL_MS);

        // Listen for messages pushed to this agent's topic
        try {
          for await (const payload of iterator) {
            if (closed) break;

            // Skip messages already sent during catch-up (dedup window)
            if (sentMessageIds.has(payload.messageId)) {
              sentMessageIds.delete(payload.messageId); // free memory
              continue;
            }

            console.log(
              `[SSE] Message pushed: agent=${agent.id} channel=${payload.channelId} message=${payload.messageId}`,
            );
            send(
              "message",
              {
                channelId: payload.channelId,
                messageId: payload.messageId,
                content: payload.content,
                fromProfile: payload.fromProfile,
                createdAt: payload.createdAt,
              },
              payload.messageId,
            );
          }
        } catch {
          // Iterator closed — normal during cleanup
        }

        cleanup();
        if (!closed) {
          try {
            controller.close();
          } catch {
            // Already closed
          }
        }
      },
      cancel() {
        cleanup();
      },
    });

    function cleanup() {
      if (closed) return;
      closed = true;
      console.log(`[SSE] Disconnected: agent=${agent.id} profile=${agentProfileId}`);
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      heartbeatTimer = null;
      iterator.return?.(undefined);
    }

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (err) {
    return handleError(err);
  }
}

/**
 * agent-reporter.ts
 *
 * Subscribes to OpenClaw agent events and forwards them to MC via the WS client.
 * Also handles periodic full-roster reports.
 */

import type { MCBridgeWsClient } from "./ws-client";
import {
  listLocalAgents,
  onAgentStatusChange,
  onAgentMessage,
  onTaskDone,
} from "./openclaw-local";

export class AgentReporter {
  private unsubscribers: Array<() => void> = [];
  private rosterInterval: ReturnType<typeof setInterval> | null = null;

  constructor(private client: MCBridgeWsClient) {}

  start(): void {
    // Send full roster immediately on start
    this.sendFullRoster().catch(console.error);

    // Periodic full roster every 5 minutes (catches any missed deltas)
    this.rosterInterval = setInterval(() => {
      this.sendFullRoster().catch(console.error);
    }, 5 * 60 * 1000);

    // Subscribe to delta events
    this.unsubscribers.push(
      onAgentStatusChange((event) => {
        this.client.send({
          type: "vm.agent_status",
          slug: event.slug,
          status: event.status as any,
          detailedStatus: event.detailedStatus ?? null,
          statusMessage: event.statusMessage ?? null,
          currentTaskId: event.currentTaskId ?? null,
        });
      }),
    );

    this.unsubscribers.push(
      onAgentMessage((event) => {
        this.client.send({
          type: "vm.agent_message",
          slug: event.slug,
          taskId: event.taskId ?? null,
          content: event.content,
          timestamp: Date.now(),
        });
      }),
    );

    this.unsubscribers.push(
      onTaskDone((event) => {
        this.client.send({
          type: "vm.task_done",
          slug: event.slug,
          taskId: event.taskId,
          summary: event.summary ?? null,
          timestamp: Date.now(),
        });
      }),
    );
  }

  stop(): void {
    if (this.rosterInterval) {
      clearInterval(this.rosterInterval);
      this.rosterInterval = null;
    }
    for (const unsub of this.unsubscribers) unsub();
    this.unsubscribers = [];
  }

  private async sendFullRoster(): Promise<void> {
    const agents = await listLocalAgents();
    this.client.send({ type: "vm.agents_report", agents });
  }
}

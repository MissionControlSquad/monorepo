import type { AgentContextBundle } from "@agentcenter/types";

/** A queued command as returned by GET /api/runner/commands. */
export interface RunnerCommandDTO {
  id: string;
  command: string;
  cwd: string | null;
  timeoutMs: number;
  createdAt: string;
}

export interface CommandResultPayload {
  exitCode?: number | null;
  stdout?: string | null;
  stderr?: string | null;
  status?: "done" | "failed" | "timeout" | null;
  errorMessage?: string | null;
}

export interface HeartbeatPreflight {
  shouldWork?: boolean;
  hasAssignedTasks?: boolean;
  [k: string]: unknown;
}

/** A queue item as returned by GET /api/queue?active=true. Items with a taskId are runnable tasks. */
export interface QueueItemDTO {
  id: string;
  taskId: string | null;
  title: string;
  status: string;
}

export interface DeliverableInput {
  title: string;
  kind: "markdown" | "code" | "file" | "link";
  content?: string;
}

/**
 * The control-plane surface the daemon talks to. All calls are OUTBOUND HTTP with an
 * `Authorization: Bearer <apiKey>` header — no inbound reachability, so it works behind any NAT.
 * An interface (not just the concrete class) so the poll loop can be unit-tested with a fake.
 */
export interface RunnerApi {
  heartbeatPreflight(): Promise<HeartbeatPreflight | null>;
  getCommands(limit?: number): Promise<RunnerCommandDTO[]>;
  postCommandResult(id: string, result: CommandResultPayload): Promise<void>;
  getContext(taskId: string): Promise<AgentContextBundle>;
  // Task execution path (agent tasks, not raw commands):
  getQueue(): Promise<QueueItemDTO[]>;
  postTaskMessage(taskId: string, content: string): Promise<void>;
  setTaskStatus(taskId: string, status: string): Promise<void>;
  postDeliverable(taskId: string, deliverable: DeliverableInput): Promise<void>;
  /** Persist a memory entry (db memory provider). */
  postMemory(taskId: string, content: string): Promise<void>;
}

export class HttpRunnerApi implements RunnerApi {
  constructor(
    private readonly apiUrl: string,
    private readonly apiKey: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  private headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.apiKey}`,
      "Content-Type": "application/json",
    };
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await this.fetchImpl(`${this.apiUrl}${path}`, {
      ...init,
      headers: { ...this.headers(), ...(init?.headers ?? {}) },
    });
    const text = await res.text();
    if (!res.ok) {
      throw new Error(`${init?.method ?? "GET"} ${path} → ${res.status}: ${text.slice(0, 200)}`);
    }
    return (text ? JSON.parse(text) : {}) as T;
  }

  async heartbeatPreflight(): Promise<HeartbeatPreflight | null> {
    try {
      return await this.request<HeartbeatPreflight>("/api/agents/me/heartbeat-preflight");
    } catch {
      // Preflight is an optimisation; a failure shouldn't stop the command poll.
      return null;
    }
  }

  async getCommands(limit = 10): Promise<RunnerCommandDTO[]> {
    const data = await this.request<{ commands: RunnerCommandDTO[] }>(
      `/api/runner/commands?limit=${limit}`,
    );
    return data.commands ?? [];
  }

  async postCommandResult(id: string, result: CommandResultPayload): Promise<void> {
    await this.request(`/api/runner/commands/${id}/result`, {
      method: "POST",
      body: JSON.stringify(result),
    });
  }

  async getContext(taskId: string): Promise<AgentContextBundle> {
    return this.request<AgentContextBundle>(
      `/api/agents/me/context?taskId=${encodeURIComponent(taskId)}`,
    );
  }

  async getQueue(): Promise<QueueItemDTO[]> {
    const items = await this.request<QueueItemDTO[]>("/api/queue?active=true");
    return Array.isArray(items) ? items : [];
  }

  async postTaskMessage(taskId: string, content: string): Promise<void> {
    await this.request(`/api/tasks/${encodeURIComponent(taskId)}/messages`, {
      method: "POST",
      body: JSON.stringify({ content }),
    });
  }

  async setTaskStatus(taskId: string, status: string): Promise<void> {
    await this.request(`/api/tasks/${encodeURIComponent(taskId)}`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    });
  }

  async postDeliverable(taskId: string, deliverable: DeliverableInput): Promise<void> {
    await this.request(`/api/tasks/${encodeURIComponent(taskId)}/deliverables`, {
      method: "POST",
      body: JSON.stringify(deliverable),
    });
  }

  async postMemory(taskId: string, content: string): Promise<void> {
    await this.request("/api/agents/me/memory", {
      method: "POST",
      body: JSON.stringify({ taskId, content }),
    });
  }
}

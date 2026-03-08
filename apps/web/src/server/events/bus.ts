import type { SystemEvent, EventType } from "./types";
import { logError } from "../logger";

type EventHandler = (event: SystemEvent) => Promise<void>;

type ExtractEvent<T extends EventType> = Extract<SystemEvent, { type: T }>;

const handlers = new Map<EventType, EventHandler[]>();

export function on<T extends EventType>(
  type: T,
  handler: (event: ExtractEvent<T>) => Promise<void>,
): void {
  const existing = handlers.get(type) || [];
  existing.push(handler as EventHandler);
  handlers.set(type, existing);
}

export async function emit(event: SystemEvent): Promise<void> {
  const eventHandlers = handlers.get(event.type) || [];
  const results = await Promise.allSettled(eventHandlers.map((handler) => handler(event)));
  for (const result of results) {
    if (result.status === "rejected") {
      logError("event-bus", `Handler failed for ${event.type}: ${result.reason}`);
    }
  }
}

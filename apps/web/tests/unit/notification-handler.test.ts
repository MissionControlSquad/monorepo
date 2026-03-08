import { describe, it, expect, vi, beforeEach } from "vitest";
import { EventTypes } from "../../src/server/constants";

const mockCreate = vi.fn();
const mockPublish = vi.fn();
const mockSubscriberCacheGet = vi.fn();
const mockSubscriberCacheSet = vi.fn();
const mockFindMany = vi.fn();

vi.mock("../../src/server/models", () => ({
  notificationModel: { create: (...args: unknown[]) => mockCreate(...args) },
  subscriptionModel: { findMany: (...args: unknown[]) => mockFindMany(...args) },
}));

vi.mock("../../src/server/pubsub", () => ({
  pubsub: { publish: (...args: unknown[]) => mockPublish(...args) },
  notificationTopic: (agentId: string) => `notification:created:${agentId}`,
  PubSubEvent: {
    NOTIFICATION: { CREATED: "notification:created" as const },
  },
}));

vi.mock("../../src/server/cache", () => ({
  subscriberCache: {
    get: (...args: unknown[]) => mockSubscriberCacheGet(...args),
    set: (...args: unknown[]) => mockSubscriberCacheSet(...args),
  },
}));

describe("notification handler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreate.mockResolvedValue({ id: "notif-1", mentionedAgentId: "agent-1", content: "", taskId: null, messageId: null });
    mockSubscriberCacheGet.mockReturnValue(undefined);
    mockFindMany.mockResolvedValue([]);
  });

  it("creates notifications and publishes when TASK_CREATED has assignees", async () => {
    await import("../../src/server/events/handlers/notification");
    const { emit } = await import("../../src/server/events/bus");

    await emit({
      type: EventTypes.TASK_CREATED,
      taskId: "task-1",
      title: "Test task",
      assigneeIds: ["agent-a", "agent-b"],
      creatorName: "Human",
      fromDashboard: false,
    });

    expect(mockCreate).toHaveBeenCalledTimes(2);
    expect(mockCreate).toHaveBeenNthCalledWith(1, {
      data: {
        mentionedAgentId: "agent-a",
        content: 'You were assigned to task "Test task" by Human',
        taskId: "task-1",
        messageId: undefined,
      },
    });
    expect(mockCreate).toHaveBeenNthCalledWith(2, {
      data: {
        mentionedAgentId: "agent-b",
        content: 'You were assigned to task "Test task" by Human',
        taskId: "task-1",
        messageId: undefined,
      },
    });
    expect(mockPublish).toHaveBeenCalledTimes(2);
    expect(mockPublish).toHaveBeenCalledWith("notification:created:agent-a", {
      agentId: "agent-a",
      notificationId: "notif-1",
    });
    expect(mockPublish).toHaveBeenCalledWith("notification:created:agent-b", {
      agentId: "agent-b",
      notificationId: "notif-1",
    });
  });

  it("does not create notifications when TASK_CREATED has no assignees", async () => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.mocked(mockCreate).mockResolvedValue({ id: "n1" });
    vi.mocked(mockSubscriberCacheGet).mockReturnValue(undefined);
    vi.mocked(mockFindMany).mockResolvedValue([]);

    await import("../../src/server/events/handlers/notification");
    const { emit } = await import("../../src/server/events/bus");

    await emit({
      type: EventTypes.TASK_CREATED,
      taskId: "task-1",
      title: "Test task",
      assigneeIds: [],
      fromDashboard: false,
    });

    expect(mockCreate).not.toHaveBeenCalled();
    expect(mockPublish).not.toHaveBeenCalled();
  });

  it("creates mention notifications and publishes when MESSAGE_CREATED has mentionedAgentIds", async () => {
    vi.resetModules();
    vi.clearAllMocks();
    mockCreate.mockResolvedValue({ id: "msg-notif-1", mentionedAgentId: "agent-m", content: "", taskId: null, messageId: null });
    mockSubscriberCacheGet.mockReturnValue(undefined);
    mockFindMany.mockResolvedValue([]);

    await import("../../src/server/events/handlers/notification");
    const { emit } = await import("../../src/server/events/bus");

    await emit({
      type: EventTypes.MESSAGE_CREATED,
      messageId: "msg-1",
      taskId: "task-1",
      taskTitle: "Task Title",
      fromProfileId: "profile-sender",
      fromAgentId: "agent-sender",
      fromAgentName: "Sender",
      content: "Hello",
      mentionedAgentIds: ["agent-m"],
    });

    expect(mockCreate).toHaveBeenCalledWith({
      data: {
        mentionedAgentId: "agent-m",
        content: 'Sender mentioned you in "Task Title"',
        taskId: "task-1",
        messageId: "msg-1",
      },
    });
    expect(mockPublish).toHaveBeenCalledWith("notification:created:agent-m", {
      agentId: "agent-m",
      notificationId: "msg-notif-1",
    });
  });
});

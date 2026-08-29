import { describe, it, expect, vi, beforeEach } from "vitest";

// Verifies the buildbase delivery wiring in the notification post-path (notify):
//   1. every recorded notification is handed to deliverViaBuildbase (buildbase owns push/email);
//   2. a workspaceId is stamped into metadata so the adapter can route (it's workspace-scoped);
//   3. delivery is best-effort — a throw from deliverViaBuildbase never breaks notify().
// The real deliverViaBuildbase is inert until an org is provisioned, so we mock it here.

const mockCreate = vi.fn();
const mockDeliver = vi.fn();
const mockLogError = vi.fn();

vi.mock("@agentcenter/database", () => ({
  createUserNotification: (...a: unknown[]) => mockCreate(...a),
}));

vi.mock("../../src/server/services/notification-buildbase", () => ({
  deliverViaBuildbase: (...a: unknown[]) => mockDeliver(...a),
}));

vi.mock("../../src/server/logger", () => ({
  log: vi.fn(),
  logWarn: vi.fn(),
  logError: (...a: unknown[]) => mockLogError(...a),
}));

vi.mock("../../src/server/services/notification-metrics", () => ({
  incrementCounter: vi.fn(),
}));

import { notify } from "../../src/server/services/notification";

describe("notify → buildbase delivery wiring", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreate.mockImplementation(async (input: Record<string, unknown>) => ({
      id: "notif-1",
      ...input,
    }));
    mockDeliver.mockResolvedValue("skip");
  });

  function baseParams(overrides: Record<string, unknown> = {}) {
    return {
      userId: `u-${Math.random()}`,
      type: "task_assigned" as never,
      title: "Task assigned",
      body: "You have a new task",
      ...overrides,
    };
  }

  it("hands the created record to deliverViaBuildbase", async () => {
    await notify(baseParams());
    expect(mockCreate).toHaveBeenCalledOnce();
    expect(mockDeliver).toHaveBeenCalledOnce();
    expect(mockDeliver.mock.calls[0][0]).toMatchObject({ id: "notif-1", title: "Task assigned" });
  });

  it("stamps workspaceId into metadata so buildbase can route", async () => {
    await notify(baseParams({ workspaceId: "ws-42", metadata: { foo: "bar" } }));
    const createArg = mockCreate.mock.calls[0][0] as { metadata: Record<string, unknown> };
    expect(createArg.metadata).toMatchObject({ workspaceId: "ws-42", foo: "bar" });
  });

  it("is fail-safe: a delivery throw never breaks notify()", async () => {
    mockDeliver.mockRejectedValueOnce(new Error("buildbase transport down"));
    await expect(notify(baseParams())).resolves.toBeUndefined();
    expect(mockLogError).toHaveBeenCalled();
  });
});

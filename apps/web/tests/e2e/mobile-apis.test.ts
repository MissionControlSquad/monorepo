/**
 * Mobile API Integration Tests
 *
 * Tests every API used by the mobile app screens reported as broken:
 *   - Notifications  (REST: /api/user-notifications/*)
 *   - Channel messages (GraphQL: channel, channelMessages, createChannelMessage, etc.)
 *   - Activity feed  (GraphQL: activitiesConnection)
 *   - Global search  (GraphQL: globalSearch, taskByNumber)
 *
 * Sequential — each section builds on shared state from the previous one.
 * runGraphQL() returns parsed JSON directly: { data?, errors? }
 */

import { describe, it, expect, beforeAll } from "vitest";
import { prisma } from "../../src/server/prisma";
import { adminSetup, adminLogin, extractSessionCookie, runGraphQL, buildRequest } from "../helpers";

// ── Shared state ──────────────────────────────────────────────────────────────
let cookie: string;
let profileId: string;
let channelId: string;
let taskId: string;
let taskNumber: number;
let messageId: string;

// ── Setup ─────────────────────────────────────────────────────────────────────
beforeAll(async () => {
  const setupRes = await adminSetup("mobiletest", "Test1234!");
  expect(setupRes.status).toBe(200);

  const loginRes = await adminLogin("mobiletest", "Test1234!");
  expect(loginRes.status).toBe(200);
  cookie = extractSessionCookie(loginRes) ?? "";
  expect(cookie).not.toBe("");

  // Resolve profileId
  const me = await runGraphQL(`query { me { id } }`, {}, cookie);
  expect(me.errors).toBeFalsy();
  profileId = me.data?.me?.id ?? "";
  expect(profileId).not.toBe("");

  // Create a channel
  const ch = await runGraphQL(
    `mutation CreateChannel(
      $name: String!
      $slug: String!
      $visibility: String!
      $createdByProfileId: String!
    ) {
      createChannel(
        name: $name
        slug: $slug
        visibility: $visibility
        createdByProfileId: $createdByProfileId
      ) { id }
    }`,
    {
      name: "mobile-test-channel",
      slug: "mobile-test-channel",
      visibility: "public",
      createdByProfileId: profileId,
    },
    cookie,
  );
  expect(ch.errors).toBeFalsy();
  channelId = ch.data?.createChannel?.id ?? "";
  expect(channelId).not.toBe("");

  // Create a task (simpler dashboard mutation — no required assigneeIds)
  const task = await runGraphQL(
    `mutation CreateTask($title: String!, $description: String!) {
      createTaskFromDashboard(title: $title, description: $description) { id taskNumber }
    }`,
    { title: "Mobile API test task", description: "Searchable description for mobile test" },
    cookie,
  );
  expect(task.errors).toBeFalsy();
  taskId = task.data?.createTaskFromDashboard?.id ?? "";
  taskNumber = task.data?.createTaskFromDashboard?.taskNumber ?? 0;
  expect(taskId).not.toBe("");
});

// ─────────────────────────────────────────────────────────────────────────────
// 1. NOTIFICATIONS
// ─────────────────────────────────────────────────────────────────────────────
describe("Notifications API", () => {
  it("GET /api/user-notifications — returns list + total", async () => {
    const { GET } = await import("../../app/api/user-notifications/route");
    const res = await GET(
      buildRequest("GET", "http://localhost:3000/api/user-notifications", {
        headers: { cookie: `mc_session=${cookie}` },
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.notifications)).toBe(true);
    expect(typeof body.total).toBe("number");
  });

  it("GET /api/user-notifications/unread-count — returns numeric count", async () => {
    const { GET } = await import("../../app/api/user-notifications/unread-count/route");
    const res = await GET(
      buildRequest("GET", "http://localhost:3000/api/user-notifications/unread-count", {
        headers: { cookie: `mc_session=${cookie}` },
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(typeof body.count).toBe("number");
  });

  it("PATCH /api/user-notifications/read-all — marks all as read (200)", async () => {
    const { PATCH } = await import("../../app/api/user-notifications/read-all/route");
    const res = await PATCH(
      buildRequest("PATCH", "http://localhost:3000/api/user-notifications/read-all", {
        headers: { cookie: `mc_session=${cookie}` },
      }),
    );
    expect(res.status).toBe(200);
  });

  it("GET /api/user-notifications/preferences — returns preferences object", async () => {
    const { GET } = await import("../../app/api/user-notifications/preferences/route");
    const res = await GET(
      buildRequest("GET", "http://localhost:3000/api/user-notifications/preferences", {
        headers: { cookie: `mc_session=${cookie}` },
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toBeDefined();
    expect(typeof body).toBe("object");
  });

  it("GET /api/user-notifications — unauthenticated returns 401", async () => {
    const { GET } = await import("../../app/api/user-notifications/route");
    const res = await GET(buildRequest("GET", "http://localhost:3000/api/user-notifications"));
    expect(res.status).toBe(401);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. CHANNEL MESSAGES
// ─────────────────────────────────────────────────────────────────────────────
describe("Channel Messages API (GraphQL)", () => {
  it("query channel — returns channel by id", async () => {
    const result = await runGraphQL(
      `query Channel($id: String!) { channel(id: $id) { id name } }`,
      { id: channelId },
      cookie,
    );
    expect(result.errors).toBeFalsy();
    expect(result.data.channel.id).toBe(channelId);
  });

  it("query channelMessages — returns array (initially empty)", async () => {
    const result = await runGraphQL(
      `query ChannelMessages($channelId: String!, $limit: Int) {
        channelMessages(channelId: $channelId, limit: $limit) { id content }
      }`,
      { channelId, limit: 50 },
      cookie,
    );
    expect(result.errors).toBeFalsy();
    expect(Array.isArray(result.data.channelMessages)).toBe(true);
  });

  it("mutation createChannelMessage — sends a message and returns it", async () => {
    const result = await runGraphQL(
      `mutation CreateChannelMessage($channelId: String!, $fromProfileId: String!, $content: String!) {
        createChannelMessage(channelId: $channelId, fromProfileId: $fromProfileId, content: $content) {
          id content
        }
      }`,
      { channelId, fromProfileId: profileId, content: "Hello from mobile test!" },
      cookie,
    );
    expect(result.errors).toBeFalsy();
    messageId = result.data?.createChannelMessage?.id ?? "";
    expect(messageId).not.toBe("");
    expect(result.data.createChannelMessage.content).toBe("Hello from mobile test!");
  });

  it("query channelMessages — now contains the sent message", async () => {
    const result = await runGraphQL(
      `query ChannelMessages($channelId: String!, $limit: Int) {
        channelMessages(channelId: $channelId, limit: $limit) { id content }
      }`,
      { channelId, limit: 50 },
      cookie,
    );
    expect(result.errors).toBeFalsy();
    expect(result.data.channelMessages.some((m: { id: string }) => m.id === messageId)).toBe(true);
  });

  it("query channelPinnedMessages — returns array", async () => {
    const result = await runGraphQL(
      `query ChannelPinnedMessages($channelId: String!) {
        channelPinnedMessages(channelId: $channelId) { id content }
      }`,
      { channelId },
      cookie,
    );
    expect(result.errors).toBeFalsy();
    expect(Array.isArray(result.data.channelPinnedMessages)).toBe(true);
  });

  it("mutation pinChannelMessage — pins a message", async () => {
    const result = await runGraphQL(
      `mutation PinChannelMessage($messageId: String!, $profileId: String!) {
        pinChannelMessage(messageId: $messageId, profileId: $profileId) { id }
      }`,
      { messageId, profileId },
      cookie,
    );
    expect(result.errors).toBeFalsy();
  });

  it("query searchChannelMessages — returns matches for 'mobile'", async () => {
    const result = await runGraphQL(
      `query SearchChannelMessages($channelId: String!, $query: String!) {
        searchChannelMessages(channelId: $channelId, query: $query) { id content }
      }`,
      { channelId, query: "mobile" },
      cookie,
    );
    expect(result.errors).toBeFalsy();
    expect(Array.isArray(result.data.searchChannelMessages)).toBe(true);
  });

  it("mutation markChannelRead — succeeds without error", async () => {
    const result = await runGraphQL(
      `mutation MarkChannelRead($channelId: String!, $profileId: String!) {
        markChannelRead(channelId: $channelId, profileId: $profileId)
      }`,
      { channelId, profileId },
      cookie,
    );
    expect(result.errors).toBeFalsy();
  });

  it("mutation updateChannelMessage — edits content", async () => {
    const result = await runGraphQL(
      `mutation UpdateChannelMessage($messageId: String!, $profileId: String!, $content: String!) {
        updateChannelMessage(messageId: $messageId, profileId: $profileId, content: $content) { id content }
      }`,
      { messageId, profileId, content: "Edited mobile test message" },
      cookie,
    );
    expect(result.errors).toBeFalsy();
    expect(result.data.updateChannelMessage.content).toBe("Edited mobile test message");
  });

  it("mutation deleteChannelMessage — deletes the message", async () => {
    const result = await runGraphQL(
      `mutation DeleteChannelMessage($messageId: String!, $profileId: String!) {
        deleteChannelMessage(messageId: $messageId, profileId: $profileId)
      }`,
      { messageId, profileId },
      cookie,
    );
    expect(result.errors).toBeFalsy();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. ACTIVITY FEED
// ─────────────────────────────────────────────────────────────────────────────
describe("Activity Feed API (GraphQL)", () => {
  it("query activitiesConnection — returns activities + hasMore", async () => {
    const result = await runGraphQL(
      `query ActivitiesConnection($first: Int) {
        activitiesConnection(first: $first) {
          activities { id type message createdAt }
          hasMore
        }
      }`,
      { first: 30 },
      cookie,
    );
    expect(result.errors).toBeFalsy();
    expect(Array.isArray(result.data.activitiesConnection.activities)).toBe(true);
    expect(typeof result.data.activitiesConnection.hasMore).toBe("boolean");
  });

  it("query activitiesConnection with projectId filter — scopes results to project", async () => {
    const proj = await runGraphQL(
      `mutation { createProject(name: "Activity Filter Project") { id } }`,
      {},
      cookie,
    );
    expect(proj.errors).toBeFalsy();
    const projectId = proj.data?.createProject?.id ?? "";

    const result = await runGraphQL(
      `query ActivitiesConnection($first: Int, $projectId: String) {
        activitiesConnection(first: $first, projectId: $projectId) {
          activities { id projectId }
          hasMore
        }
      }`,
      { first: 30, projectId },
      cookie,
    );
    expect(result.errors).toBeFalsy();
    for (const act of result.data.activitiesConnection.activities) {
      expect(act.projectId).toBe(projectId);
    }
  });

  it("query activitiesConnection with after cursor — excludes cursor item", async () => {
    const first = await runGraphQL(
      `query { activitiesConnection(first: 1) { activities { id } hasMore } }`,
      {},
      cookie,
    );
    const firstActivity = first.data?.activitiesConnection?.activities?.[0];
    if (!firstActivity) return; // Skip if no activities yet

    const result = await runGraphQL(
      `query ActivitiesConnection($first: Int, $after: String) {
        activitiesConnection(first: $first, after: $after) {
          activities { id }
          hasMore
        }
      }`,
      { first: 30, after: firstActivity.id },
      cookie,
    );
    expect(result.errors).toBeFalsy();
    expect(
      result.data.activitiesConnection.activities.some(
        (a: { id: string }) => a.id === firstActivity.id,
      ),
    ).toBe(false);
  });

  it("query activitiesConnection with invalid cursor — returns empty gracefully", async () => {
    const result = await runGraphQL(
      `query ActivitiesConnection($first: Int, $after: String) {
        activitiesConnection(first: $first, after: $after) {
          activities { id }
          hasMore
        }
      }`,
      { first: 30, after: "nonexistent-id-abc123" },
      cookie,
    );
    expect(result.errors).toBeFalsy();
    expect(result.data.activitiesConnection.activities).toEqual([]);
    expect(result.data.activitiesConnection.hasMore).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. GLOBAL SEARCH
// ─────────────────────────────────────────────────────────────────────────────
describe("Search API (GraphQL)", () => {
  it("query globalSearch — returns tasks/messages/deliverables buckets", async () => {
    const result = await runGraphQL(
      `query GlobalSearch($searchText: String!, $limit: Int) {
        globalSearch(searchText: $searchText, limit: $limit) { tasks messages deliverables }
      }`,
      { searchText: "mobile", limit: 5 },
      cookie,
    );
    expect(result.errors).toBeFalsy();
    expect(Array.isArray(result.data.globalSearch.tasks)).toBe(true);
    expect(Array.isArray(result.data.globalSearch.messages)).toBe(true);
    expect(Array.isArray(result.data.globalSearch.deliverables)).toBe(true);
  });

  it("query globalSearch — finds the seeded task by title", async () => {
    const result = await runGraphQL(
      `query GlobalSearch($searchText: String!, $limit: Int) {
        globalSearch(searchText: $searchText, limit: $limit) { tasks }
      }`,
      { searchText: "Mobile API test task", limit: 10 },
      cookie,
    );
    expect(result.errors).toBeFalsy();
    const found = result.data.globalSearch.tasks.some((t: { id: string }) => t.id === taskId);
    expect(found).toBe(true);
  });

  it("query globalSearch with empty string — returns empty results without error", async () => {
    const result = await runGraphQL(
      `query GlobalSearch($searchText: String!, $limit: Int) {
        globalSearch(searchText: $searchText, limit: $limit) { tasks messages deliverables }
      }`,
      { searchText: "", limit: 5 },
      cookie,
    );
    expect(result.errors).toBeFalsy();
    expect(result.data.globalSearch.tasks).toEqual([]);
    expect(result.data.globalSearch.messages).toEqual([]);
    expect(result.data.globalSearch.deliverables).toEqual([]);
  });

  it("query taskByNumber — finds task by sequential number", async () => {
    const result = await runGraphQL(
      `query TaskByNumber($taskNumber: Int!) {
        taskByNumber(taskNumber: $taskNumber) { id taskNumber title }
      }`,
      { taskNumber },
      cookie,
    );
    expect(result.errors).toBeFalsy();
    expect(result.data.taskByNumber.id).toBe(taskId);
    expect(result.data.taskByNumber.taskNumber).toBe(taskNumber);
  });

  it("query taskByNumber with non-existent number — returns null", async () => {
    const result = await runGraphQL(
      `query TaskByNumber($taskNumber: Int!) {
        taskByNumber(taskNumber: $taskNumber) { id }
      }`,
      { taskNumber: 999999 },
      cookie,
    );
    expect(result.errors).toBeFalsy();
    expect(result.data.taskByNumber).toBeNull();
  });

  it("query globalSearch with projectId filter — scopes results to project", async () => {
    const proj = await runGraphQL(
      `mutation { createProject(name: "Search Scope Project") { id } }`,
      {},
      cookie,
    );
    const projectId = proj.data?.createProject?.id ?? "";

    const result = await runGraphQL(
      `query GlobalSearch($searchText: String!, $limit: Int, $projectId: String) {
        globalSearch(searchText: $searchText, limit: $limit, projectId: $projectId) {
          tasks messages deliverables
        }
      }`,
      { searchText: "mobile", limit: 5, projectId },
      cookie,
    );
    expect(result.errors).toBeFalsy();
    for (const t of result.data.globalSearch.tasks) {
      expect(t.projectId).toBe(projectId);
    }
  });
});

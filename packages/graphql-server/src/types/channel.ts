import { builder } from "../builder";
import { getChannelUnreadCount } from "@agentcenter/database";

// User (human account); minimal exposure for Profile.user relation
builder.prismaObject("User", {
  fields: (t) => ({
    id: t.exposeID("id"),
    email: t.exposeString("email"),
  }),
});

// Public profile (humans and agents) — one collection for display name, username, avatar
builder.prismaObject("Profile", {
  fields: (t) => ({
    id: t.exposeID("id"),
    kind: t.exposeString("kind"),
    displayName: t.exposeString("displayName"),
    username: t.exposeString("username", { nullable: true }),
    avatarUrl: t.exposeString("avatarUrl", { nullable: true }),
    bio: t.exposeString("bio", { nullable: true }),
    agentId: t.exposeString("agentId", { nullable: true }),
    user: t.relation("user", { nullable: true }),
    agent: t.relation("agent", { nullable: true }),
  }),
});

builder.prismaObject("Channel", {
  fields: (t) => ({
    id: t.exposeID("id"),
    name: t.exposeString("name"),
    slug: t.exposeString("slug"),
    visibility: t.exposeString("visibility"),
    description: t.exposeString("description", { nullable: true }),
    projectId: t.exposeString("projectId", { nullable: true }),
    createdByProfileId: t.exposeString("createdByProfileId"),
    createdAt: t.expose("createdAt", { type: "DateTime" }),
    updatedAt: t.expose("updatedAt", { type: "DateTime" }),

    createdByProfile: t.relation("createdByProfile"),
    project: t.relation("project", { nullable: true }),
    members: t.relation("members"),
    messages: t.relation("messages"),

    /** Number of messages in this channel after the given user's lastReadAt (or joinedAt). */
    unreadCount: t.field({
      type: "Int",
      args: { profileId: t.arg.string({ required: false }) },
      resolve: async (channel, args) => {
        if (!args.profileId) return 0;
        return getChannelUnreadCount(channel.id, args.profileId);
      },
    }),
  }),
});

builder.prismaObject("ChannelMember", {
  fields: (t) => ({
    id: t.exposeID("id"),
    channelId: t.exposeString("channelId"),
    profileId: t.exposeString("profileId"),
    role: t.exposeString("role"),
    joinedAt: t.expose("joinedAt", { type: "DateTime" }),
    lastReadAt: t.expose("lastReadAt", { type: "DateTime", nullable: true }),

    channel: t.relation("channel"),
    profile: t.relation("profile"),
  }),
});

builder.prismaObject("ChannelMessage", {
  fields: (t) => ({
    id: t.exposeID("id"),
    channelId: t.exposeString("channelId"),
    fromProfileId: t.exposeString("fromProfileId"),
    content: t.exposeString("content"),
    createdAt: t.expose("createdAt", { type: "DateTime" }),
    updatedAt: t.expose("updatedAt", { type: "DateTime" }),
    pinnedAt: t.expose("pinnedAt", { type: "DateTime", nullable: true }),
    pinnedByProfileId: t.exposeString("pinnedByProfileId", { nullable: true }),

    channel: t.relation("channel"),
    fromProfile: t.relation("fromProfile"),
    pinnedByProfile: t.relation("pinnedByProfile", { nullable: true }),
    attachments: t.relation("attachments"),
    mentions: t.relation("mentions"),
    reactions: t.relation("reactions"),
  }),
});

/** Cursor-based pagination for channel messages. Use before=null for latest page, then before=oldestId for "load older". */
export const ChannelMessageConnectionRef = builder
  .objectRef<{
    messages: unknown[];
    hasOlder: boolean;
  }>("ChannelMessageConnection")
  .implement({
    fields: (t) => ({
      messages: t.field({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Pothos custom object referencing Prisma list type
        type: ["ChannelMessage"] as any,
        resolve: (parent) => parent.messages,
      }),
      hasOlder: t.boolean({
        resolve: (parent) => parent.hasOlder,
      }),
    }),
  });

builder.prismaObject("ChannelMessageAttachment", {
  fields: (t) => ({
    id: t.exposeID("id"),
    messageId: t.exposeString("messageId"),
    documentId: t.exposeString("documentId"),

    message: t.relation("message"),
    document: t.relation("document"),
  }),
});

builder.prismaObject("ChannelMessageMention", {
  fields: (t) => ({
    id: t.exposeID("id"),
    messageId: t.exposeString("messageId"),
    profileId: t.exposeString("profileId"),

    message: t.relation("message"),
    profile: t.relation("profile"),
  }),
});

builder.prismaObject("ChannelMessageReaction", {
  fields: (t) => ({
    id: t.exposeID("id"),
    messageId: t.exposeString("messageId"),
    profileId: t.exposeString("profileId"),
    emoji: t.exposeString("emoji"),
    createdAt: t.expose("createdAt", { type: "DateTime" }),

    message: t.relation("message"),
    profile: t.relation("profile"),
  }),
});

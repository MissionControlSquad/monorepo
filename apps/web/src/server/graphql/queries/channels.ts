import { builder } from "../builder";
import {
  listChannels,
  findChannelByIdQuery,
  findChannelBySlugNullable,
  listChannelMessagesSimple,
  listChannelPinnedMessages,
  searchChannelMessages,
  getChannelMessageCursor,
  listChannelMessagesBeforeCursor,
  listLatestChannelMessages,
  findProfilesQuery,
  findProfileByIdQuery,
  listChannelsInCommon,
} from "@agentcenter/database";
import { ChannelMessageConnectionRef } from "@agentcenter/graphql-server";
import { ChannelVisibility } from "@agentcenter/utils";
import type { ChannelVisibilityValue } from "@agentcenter/utils";

/** List channels. If profileId is provided, returns public channels + channels where this profile is a member. If projectId is provided, only channels scoped to that project. If visibility is provided, only that visibility (e.g. "dm" for direct messages). */
builder.queryField("channels", (t) =>
  t.prismaField({
    type: ["Channel"],
    args: {
      profileId: t.arg.string({
        required: false,
        description: "If provided, only public channels + channels this profile is in",
      }),
      projectId: t.arg.string({
        required: false,
        description: "If provided, only channels belonging to this project",
      }),
      visibility: t.arg.string({
        required: false,
        description:
          "If provided, only channels with this visibility (e.g. 'dm' for direct messages)",
      }),
      limit: t.arg.int({ defaultValue: 100 }),
    },
    resolve: async (query, _root, args) => {
      const take = Math.min(args.limit ?? 100, 200);
      const where: {
        projectId?: string | null;
        visibility?: "public" | "private" | "dm" | { in: ("public" | "private" | "dm")[] };
        OR?: Array<object>;
        members?: { some: { profileId: string } };
      } = {};
      if (args.visibility === ChannelVisibility.DM) {
        where.visibility = ChannelVisibility.DM;
        where.projectId = null; // DMs are global, not scoped to a project
        if (args.profileId) {
          where.members = { some: { profileId: args.profileId } };
        }
      } else {
        if (args.projectId) where.projectId = args.projectId;
        if (args.visibility) {
          where.visibility = args.visibility as ChannelVisibilityValue;
        } else {
          where.visibility = { in: [ChannelVisibility.PUBLIC, ChannelVisibility.PRIVATE] };
        }
        if (args.profileId) {
          where.OR = [
            { visibility: ChannelVisibility.PUBLIC },
            { members: { some: { profileId: args.profileId } } },
          ];
        }
      }
      return listChannels(where, { take, orderBy: { updatedAt: "desc" } }, query);
    },
  }),
);

builder.queryField("channel", (t) =>
  t.prismaField({
    type: "Channel",
    nullable: true,
    args: { id: t.arg.string({ required: true }) },
    resolve: (query, _root, args) => findChannelByIdQuery(args.id, query),
  }),
);

builder.queryField("channelBySlug", (t) =>
  t.prismaField({
    type: "Channel",
    nullable: true,
    args: { slug: t.arg.string({ required: true }) },
    resolve: (query, _root, args) => findChannelBySlugNullable(args.slug, query),
  }),
);

builder.queryField("channelMessages", (t) =>
  t.prismaField({
    type: ["ChannelMessage"],
    args: {
      channelId: t.arg.string({ required: true }),
      limit: t.arg.int({ defaultValue: 100 }),
    },
    resolve: (query, _root, args) =>
      listChannelMessagesSimple(
        args.channelId,
        Math.min(args.limit ?? 100, 500),
        { createdAt: "asc" },
        query,
      ),
  }),
);

/** Pinned messages in a channel (order: most recently pinned first). */
builder.queryField("channelPinnedMessages", (t) =>
  t.prismaField({
    type: ["ChannelMessage"],
    args: {
      channelId: t.arg.string({ required: true }),
      limit: t.arg.int({ defaultValue: 50 }),
    },
    resolve: (query, _root, args) =>
      listChannelPinnedMessages(args.channelId, Math.min(args.limit ?? 50, 100), query),
  }),
);

/** Search messages in a channel by content (case-insensitive) and/or by mentioned user. */
builder.queryField("searchChannelMessages", (t) =>
  t.prismaField({
    type: ["ChannelMessage"],
    args: {
      channelId: t.arg.string({ required: true }),
      query: t.arg.string({ required: false }),
      mentionedProfileId: t.arg.string({
        required: false,
        description: "If set, only messages that mention this profile",
      }),
      limit: t.arg.int({ defaultValue: 25 }),
    },
    resolve: (query, _root, args) => {
      const q = (args.query ?? "").trim();
      const mentionedId = args.mentionedProfileId ?? null;
      if (!q && !mentionedId) return [];
      return searchChannelMessages(
        args.channelId,
        {
          query: q || undefined,
          mentionedProfileId: mentionedId,
          take: Math.min(args.limit ?? 25, 50),
        },
        query,
      );
    },
  }),
);

const CHANNEL_MESSAGE_PAGE_SIZE = 50;

builder.queryField("channelMessageConnection", (t) =>
  t.field({
    type: ChannelMessageConnectionRef,
    args: {
      channelId: t.arg.string({ required: true }),
      first: t.arg.int({ defaultValue: CHANNEL_MESSAGE_PAGE_SIZE }),
      before: t.arg.string({
        required: false,
        description: "Message ID; return messages older than this",
      }),
    },
    resolve: async (_root, args) => {
      const first = Math.min(Math.max(1, args.first ?? CHANNEL_MESSAGE_PAGE_SIZE), 100);
      if (args.before) {
        const cursor = await getChannelMessageCursor(args.channelId, args.before!);
        if (!cursor) return { messages: [], hasOlder: false };
        const older = await listChannelMessagesBeforeCursor(
          args.channelId,
          cursor.createdAt,
          first + 1,
        );
        const hasOlder = older.length > first;
        const messages = (hasOlder ? older.slice(0, first) : older).reverse();
        return { messages, hasOlder };
      }
      const latest = await listLatestChannelMessages(args.channelId, first + 1);
      const hasOlder = latest.length > first;
      const messages = (hasOlder ? latest.slice(0, first) : latest).reverse();
      return { messages, hasOlder };
    },
  }),
);

builder.queryField("profiles", (t) =>
  t.prismaField({
    type: ["Profile"],
    args: { limit: t.arg.int({ defaultValue: 200 }) },
    resolve: (query, _root, args) =>
      findProfilesQuery(
        {},
        { ...query, orderBy: { displayName: "asc" }, take: Math.min(args.limit ?? 200, 500) },
      ),
  }),
);

builder.queryField("profile", (t) =>
  t.prismaField({
    type: "Profile",
    nullable: true,
    args: { id: t.arg.string({ required: true }) },
    resolve: (query, _root, args) => findProfileByIdQuery(args.id, query),
  }),
);

/** Private channels where both profiles are members (for "channels in common" in profile sidebar). */
builder.queryField("channelsInCommon", (t) =>
  t.prismaField({
    type: ["Channel"],
    args: {
      myProfileId: t.arg.string({ required: true }),
      otherProfileId: t.arg.string({ required: true }),
      limit: t.arg.int({ defaultValue: 20 }),
    },
    resolve: async (query, _root, args) => {
      if (args.myProfileId === args.otherProfileId) return [];
      const take = Math.min(args.limit ?? 20, 50);
      return listChannelsInCommon(args.myProfileId, args.otherProfileId, take, query);
    },
  }),
);

import { builder } from "../builder";
import { prisma } from "../../prisma";
import { ChannelMessageConnectionRef } from "../types/channel";

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
      if (args.visibility === "dm") {
        where.visibility = "dm";
        where.projectId = null; // DMs are global, not scoped to a project
        if (args.profileId) {
          where.members = { some: { profileId: args.profileId } };
        }
      } else {
        if (args.projectId) where.projectId = args.projectId;
        if (args.visibility) {
          where.visibility = args.visibility as "public" | "private";
        } else {
          where.visibility = { in: ["public", "private"] };
        }
        if (args.profileId) {
          where.OR = [
            { visibility: "public" },
            { members: { some: { profileId: args.profileId } } },
          ];
        }
      }
      return prisma.channel.findMany({
        ...query,
        where,
        orderBy: { updatedAt: "desc" },
        take,
      });
    },
  }),
);

builder.queryField("channel", (t) =>
  t.prismaField({
    type: "Channel",
    nullable: true,
    args: { id: t.arg.string({ required: true }) },
    resolve: (query, _root, args) =>
      prisma.channel.findUnique({
        ...query,
        where: { id: args.id },
      }),
  }),
);

builder.queryField("channelBySlug", (t) =>
  t.prismaField({
    type: "Channel",
    nullable: true,
    args: { slug: t.arg.string({ required: true }) },
    resolve: (query, _root, args) =>
      prisma.channel.findUnique({
        ...query,
        where: { slug: args.slug },
      }),
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
      prisma.channelMessage.findMany({
        ...query,
        where: { channelId: args.channelId },
        orderBy: { createdAt: "asc" },
        take: Math.min(args.limit ?? 100, 500),
      }),
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
      prisma.channelMessage.findMany({
        ...query,
        where: { channelId: args.channelId, pinnedAt: { not: null } },
        orderBy: { pinnedAt: "desc" },
        take: Math.min(args.limit ?? 50, 100),
      }),
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
      const where: {
        channelId: string;
        content?: { contains: string; mode: "insensitive" };
        mentions?: { some: { profileId: string } };
      } = {
        channelId: args.channelId,
      };
      if (q) where.content = { contains: q, mode: "insensitive" };
      if (mentionedId) where.mentions = { some: { profileId: mentionedId } };
      return prisma.channelMessage.findMany({
        ...query,
        where,
        orderBy: { createdAt: "desc" },
        take: Math.min(args.limit ?? 25, 50),
      });
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
      const include = {
        fromProfile: true,
        pinnedByProfile: true,
        reactions: { include: { profile: true } },
        mentions: { include: { profile: true } },
        attachments: { include: { document: true } },
      };
      if (args.before) {
        const beforeMsg = await prisma.channelMessage.findFirst({
          where: { id: args.before!, channelId: args.channelId },
          select: { createdAt: true },
        });
        if (!beforeMsg) return { messages: [], hasOlder: false };
        const older = await prisma.channelMessage.findMany({
          where: { channelId: args.channelId, createdAt: { lt: beforeMsg.createdAt } },
          orderBy: { createdAt: "desc" },
          take: first + 1,
          include,
        });
        const hasOlder = older.length > first;
        const messages = (hasOlder ? older.slice(0, first) : older).reverse();
        return { messages, hasOlder };
      }
      const latest = await prisma.channelMessage.findMany({
        where: { channelId: args.channelId },
        orderBy: { createdAt: "desc" },
        take: first + 1,
        include,
      });
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
      prisma.profile.findMany({
        ...query,
        orderBy: { displayName: "asc" },
        take: Math.min(args.limit ?? 200, 500),
      }),
  }),
);

builder.queryField("profile", (t) =>
  t.prismaField({
    type: "Profile",
    nullable: true,
    args: { id: t.arg.string({ required: true }) },
    resolve: (query, _root, args) =>
      prisma.profile.findUnique({
        ...query,
        where: { id: args.id },
      }),
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
      return prisma.channel.findMany({
        ...query,
        where: {
          visibility: "private",
          AND: [
            { members: { some: { profileId: args.myProfileId } } },
            { members: { some: { profileId: args.otherProfileId } } },
          ],
        },
        orderBy: { createdAt: "desc" },
        take,
      });
    },
  }),
);

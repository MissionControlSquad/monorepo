import { builder } from "../builder";
import { messageModel } from "../../models";
import { prisma } from "@agentcenter/database";
import { MessageConnectionRef } from "@agentcenter/graphql-server";

builder.queryField("messagesByTask", (t) =>
  t.prismaField({
    type: ["Message"],
    args: {
      taskId: t.arg.string({ required: true }),
      limit: t.arg.int({ defaultValue: 200 }),
    },
    resolve: (query, _root, args) =>
      messageModel.findMany({
        ...query,
        where: { taskId: args.taskId },
        orderBy: { createdAt: "asc" },
        take: Math.min(args.limit ?? 200, 500),
      }),
  }),
);

const MESSAGE_PAGE_SIZE = 50;

builder.queryField("messagesByTaskConnection", (t) =>
  t.field({
    type: MessageConnectionRef,
    args: {
      taskId: t.arg.string({ required: true }),
      first: t.arg.int({ defaultValue: MESSAGE_PAGE_SIZE }),
      before: t.arg.string({
        required: false,
        description: "Message ID; return messages older than this",
      }),
    },
    resolve: async (_root, args) => {
      const first = Math.min(Math.max(1, args.first ?? MESSAGE_PAGE_SIZE), 100);
      const include = {
        fromProfile: true,
        task: true,
        attachments: { include: { document: true } },
        mentions: { include: { profile: true } },
        reactions: { include: { profile: true } },
      };
      if (args.before) {
        const beforeMsg = await prisma.message.findFirst({
          where: { id: args.before!, taskId: args.taskId },
          select: { createdAt: true },
        });
        if (!beforeMsg) return { messages: [], hasOlder: false };
        const older = await prisma.message.findMany({
          where: { taskId: args.taskId, createdAt: { lt: beforeMsg.createdAt } },
          orderBy: { createdAt: "desc" },
          take: first + 1,
          include,
        });
        const hasOlder = older.length > first;
        const messages = (hasOlder ? older.slice(0, first) : older).reverse();
        return { messages, hasOlder };
      }
      const latest = await prisma.message.findMany({
        where: { taskId: args.taskId },
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

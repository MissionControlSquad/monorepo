import { builder } from "../builder";
import { messageModel } from "../../models";
import {
  getMessageCursor,
  listMessagesBeforeCursor,
  listLatestMessages,
} from "@agentcenter/database";
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
      if (args.before) {
        const cursor = await getMessageCursor(args.taskId, args.before!);
        if (!cursor) return { messages: [], hasOlder: false };
        const older = await listMessagesBeforeCursor(args.taskId, cursor.createdAt, first + 1);
        const hasOlder = older.length > first;
        const messages = (hasOlder ? older.slice(0, first) : older).reverse();
        return { messages, hasOlder };
      }
      const latest = await listLatestMessages(args.taskId, first + 1);
      const hasOlder = latest.length > first;
      const messages = (hasOlder ? latest.slice(0, first) : latest).reverse();
      return { messages, hasOlder };
    },
  }),
);

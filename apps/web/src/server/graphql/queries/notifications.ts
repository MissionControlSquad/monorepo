import { builder } from "../builder";
import { notificationModel } from "../../models";

builder.queryField("undeliveredNotifications", (t) =>
  t.prismaField({
    type: ["Notification"],
    args: {
      limit: t.arg.int({ defaultValue: 100 }),
    },
    resolve: (query, _root, args) =>
      notificationModel.findMany({
        ...query,
        where: { delivered: false },
        orderBy: { createdAt: "desc" },
        take: Math.min(args.limit ?? 100, 500),
      }),
  }),
);

builder.queryField("notificationsByAgent", (t) =>
  t.prismaField({
    type: ["Notification"],
    args: {
      agentId: t.arg.string({ required: true }),
      includeDelivered: t.arg.boolean({ defaultValue: false }),
      limit: t.arg.int({ defaultValue: 100 }),
    },
    resolve: (query, _root, args) =>
      notificationModel.findMany({
        ...query,
        where: {
          mentionedAgentId: args.agentId,
          ...(args.includeDelivered ? {} : { delivered: false }),
        },
        orderBy: { createdAt: "desc" },
        take: Math.min(args.limit ?? 100, 500),
      }),
  }),
);

import { builder } from "../builder";
import { pubsub } from "../../pubsub";
import { notificationTopic } from "../../pubsub";
import { notificationModel } from "../../models";

builder.subscriptionField("notificationCreated", (t) =>
  t.prismaField({
    type: "Notification",
    nullable: true,
    args: {
      agentId: t.arg.string({ required: true }),
    },
    subscribe: (_root, args) => pubsub.subscribe(notificationTopic(args.agentId)),
    resolve: async (query, payload) => {
      const notification = await notificationModel.delegate.findUnique({
        ...query,
        where: { id: payload.notificationId },
      });
      if (!notification) return null as any;
      return notification;
    },
  }),
);

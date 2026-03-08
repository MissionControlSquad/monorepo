import { builder } from "../builder";
import { pubsub, PubSubEvent, activityProjectTopic } from "../../pubsub";
import { activityModel } from "../../models";

builder.subscriptionField("activityCreated", (t) =>
  t.prismaField({
    type: "Activity",
    nullable: true,
    args: {
      projectId: t.arg.string(),
    },
    subscribe: (_root, args) => {
      if (args.projectId) return pubsub.subscribe(activityProjectTopic(args.projectId));
      // Fallback: global topic (receives all activity)
      return pubsub.subscribe(PubSubEvent.ACTIVITY.CREATED);
    },
    resolve: async (query, payload) => {
      const activity = await activityModel.delegate.findUnique({
        ...query,
        where: { id: payload.activityId },
      });
      if (!activity) return null as any;
      return activity;
    },
  }),
);

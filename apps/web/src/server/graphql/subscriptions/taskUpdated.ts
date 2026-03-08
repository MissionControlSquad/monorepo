import { builder } from "../builder";
import { pubsub, PubSubEvent, taskTopic, taskProjectTopic } from "../../pubsub";
import { taskModel } from "../../models";

builder.subscriptionField("taskUpdated", (t) =>
  t.prismaField({
    type: "Task",
    nullable: true,
    args: {
      taskId: t.arg.string(),
      projectId: t.arg.string(),
    },
    subscribe: (_root, args) => {
      // Subscribe to the most specific topic available
      if (args.taskId) return pubsub.subscribe(taskTopic(args.taskId));
      if (args.projectId) return pubsub.subscribe(taskProjectTopic(args.projectId));
      // Fallback: global topic (no filtering arg provided)
      return pubsub.subscribe(PubSubEvent.TASK.UPDATED);
    },
    resolve: async (query, payload) => {
      return taskModel.findById(payload.taskId, query);
    },
  }),
);

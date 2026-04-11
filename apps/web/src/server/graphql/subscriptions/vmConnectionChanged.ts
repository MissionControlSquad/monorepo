import { builder } from "../builder";
import { pubsub, vmConnectionTopic } from "../../pubsub";

builder.subscriptionField("vmConnectionChanged", (t) =>
  t.field({
    type: builder.simpleObject("VMConnectionEvent", {
      fields: (t) => ({
        vmId: t.string(),
        connected: t.boolean(),
      }),
    }),
    args: {
      vmId: t.arg.string({ required: true }),
    },
    subscribe: (_root, args) => pubsub.subscribe(vmConnectionTopic(args.vmId)),
    resolve: (payload) => payload,
  }),
);

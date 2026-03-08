import { builder } from "../builder";
import { processEvent } from "../../events/ingest";

// Unified event ingestion endpoint for agents
builder.mutationField("ingestEvent", (t) =>
  t.field({
    type: "JSON",
    args: {
      event: t.arg.string({ required: true }), // JSON string of the event
      apiKey: t.arg.string({ required: true }),
    },
    resolve: async (_root, args) => {
      const event = JSON.parse(args.event);
      return processEvent(event, args.apiKey);
    },
  }),
);

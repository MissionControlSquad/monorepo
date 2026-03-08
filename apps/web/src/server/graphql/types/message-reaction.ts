import { builder } from "../builder";

builder.prismaObject("MessageReaction", {
  fields: (t) => ({
    id: t.exposeID("id"),
    messageId: t.exposeString("messageId"),
    profileId: t.exposeString("profileId"),
    emoji: t.exposeString("emoji"),
    createdAt: t.expose("createdAt", { type: "DateTime" }),

    message: t.relation("message"),
    profile: t.relation("profile"),
  }),
});

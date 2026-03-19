import { builder } from "../builder";

builder.prismaObject("Message", {
  fields: (t) => ({
    id: t.exposeID("id"),
    taskId: t.exposeString("taskId"),
    fromProfileId: t.exposeString("fromProfileId"),
    content: t.exposeString("content"),
    projectId: t.exposeString("projectId", { nullable: true }),
    createdAt: t.expose("createdAt", { type: "DateTime" }),

    task: t.relation("task"),
    fromProfile: t.relation("fromProfile"),
    project: t.relation("project", { nullable: true }),
    attachments: t.relation("attachments"),
    mentions: t.relation("mentions"),
    reactions: t.relation("reactions"),
  }),
});

/** Cursor-based pagination for task messages. */
export const MessageConnectionRef = builder
  .objectRef<{
    messages: unknown[];
    hasOlder: boolean;
  }>("MessageConnection")
  .implement({
    fields: (t) => ({
      messages: t.field({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Pothos custom object referencing Prisma list type
        type: ["Message"] as any,
        resolve: (parent) => parent.messages,
      }),
      hasOlder: t.boolean({
        resolve: (parent) => parent.hasOlder,
      }),
    }),
  });

builder.prismaObject("MessageAttachment", {
  fields: (t) => ({
    id: t.exposeID("id"),
    messageId: t.exposeString("messageId"),
    documentId: t.exposeString("documentId"),

    message: t.relation("message"),
    document: t.relation("document"),
  }),
});

builder.prismaObject("MessageMention", {
  fields: (t) => ({
    id: t.exposeID("id"),
    messageId: t.exposeString("messageId"),
    profileId: t.exposeString("profileId"),

    message: t.relation("message"),
    profile: t.relation("profile"),
  }),
});

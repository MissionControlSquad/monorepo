import { builder } from "../builder";
builder.prismaObject("DocumentAnnotationComment", {
  fields: (t) => ({
    id: t.exposeID("id"), body: t.exposeString("body"),
    authorProfileId: t.exposeString("authorProfileId", { nullable: true }),
    authorAgentId: t.exposeString("authorAgentId", { nullable: true }),
    createdAt: t.expose("createdAt", { type: "DateTime" }),
  }),
});
builder.prismaObject("DocumentAnnotationThread", {
  fields: (t) => ({
    id: t.exposeID("id"), documentId: t.exposeString("documentId"),
    quote: t.exposeString("quote"), startOffset: t.exposeInt("startOffset"), endOffset: t.exposeInt("endOffset"),
    status: t.exposeString("status"), confidence: t.exposeFloat("confidence"),
    comments: t.relation("comments"),
    createdAt: t.expose("createdAt", { type: "DateTime" }),
  }),
});

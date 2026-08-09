import { builder } from "../builder";

// Epic #18: per-agent markdown instruction files (AGENTS.md bundle).
builder.prismaObject("AgentInstruction", {
  fields: (t) => ({
    id: t.exposeID("id"),
    agentId: t.exposeString("agentId"),
    fileName: t.exposeString("fileName"),
    content: t.exposeString("content"),
    updatedByProfileId: t.exposeString("updatedByProfileId", { nullable: true }),
    createdAt: t.expose("createdAt", { type: "DateTime" }),
    updatedAt: t.expose("updatedAt", { type: "DateTime" }),
  }),
});

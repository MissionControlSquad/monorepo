import { builder } from "../builder";
builder.prismaObject("SmokeCase", {
  fields: (t) => ({
    id: t.exposeID("id"), name: t.exposeString("name"), toolName: t.exposeString("toolName"),
    agentId: t.exposeString("agentId", { nullable: true }), inputText: t.exposeString("inputText", { nullable: true }),
    expectDecision: t.exposeString("expectDecision"), lastResult: t.exposeString("lastResult", { nullable: true }),
    lastActual: t.exposeString("lastActual", { nullable: true }), lastRunAt: t.expose("lastRunAt", { type: "DateTime", nullable: true }),
  }),
});

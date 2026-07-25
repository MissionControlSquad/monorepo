import { builder } from "../builder";
builder.prismaObject("LocalService", {
  fields: (t) => ({
    id: t.exposeID("id"), key: t.exposeString("key"), kind: t.exposeString("kind"), status: t.exposeString("status"),
    pid: t.exposeInt("pid", { nullable: true }), restartCount: t.exposeInt("restartCount"),
    lastError: t.exposeString("lastError", { nullable: true }), lastHealthyAt: t.expose("lastHealthyAt", { type: "DateTime", nullable: true }),
  }),
});

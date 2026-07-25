import { builder } from "../builder";
builder.prismaObject("CloudUpstream", {
  fields: (t) => ({
    id: t.exposeID("id"),
    projectId: t.exposeString("projectId"),
    name: t.exposeString("name"),
    remoteUrl: t.exposeString("remoteUrl"),
    remoteRef: t.exposeString("remoteRef"),
    syncState: t.exposeString("syncState"),
    ahead: t.exposeInt("ahead"),
    behind: t.exposeInt("behind"),
    lastError: t.exposeString("lastError", { nullable: true }),
    lastSyncedAt: t.expose("lastSyncedAt", { type: "DateTime", nullable: true }),
  }),
});

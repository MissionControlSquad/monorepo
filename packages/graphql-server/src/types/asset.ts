import { builder } from "../builder";

// Asset (parity #15/#27): uploaded workspace file (R2-backed), optionally owned by a company/agent/…
builder.prismaObject("Asset", {
  fields: (t) => ({
    id: t.exposeID("id"),
    workspaceId: t.exposeString("workspaceId"),
    name: t.exposeString("name"),
    kind: t.exposeString("kind"),
    mimeType: t.exposeString("mimeType"),
    sizeBytes: t.exposeInt("sizeBytes"),
    storageKey: t.exposeString("storageKey"),
    ownerType: t.exposeString("ownerType", { nullable: true }),
    ownerId: t.exposeString("ownerId", { nullable: true }),
    uploadedByProfileId: t.exposeString("uploadedByProfileId", { nullable: true }),
    createdAt: t.expose("createdAt", { type: "DateTime" }),
  }),
});

import { builder } from "../builder";

// Epic #16: business finance ledger types (human P&L). Distinct from Epic #4 agent cost.
builder.prismaObject("LedgerEvent", {
  fields: (t) => ({
    id: t.exposeID("id"),
    workspaceId: t.exposeString("workspaceId"),
    kind: t.exposeString("kind"),
    category: t.exposeString("category"),
    categoryId: t.exposeString("categoryId", { nullable: true }),
    biller: t.exposeString("biller", { nullable: true }),
    amountCents: t.exposeInt("amountCents"),
    currency: t.exposeString("currency"),
    description: t.exposeString("description", { nullable: true }),
    projectId: t.exposeString("projectId", { nullable: true }),
    source: t.exposeString("source"),
    createdBy: t.exposeString("createdBy"),
    occurredAt: t.expose("occurredAt", { type: "DateTime" }),
    createdAt: t.expose("createdAt", { type: "DateTime" }),
    updatedAt: t.expose("updatedAt", { type: "DateTime" }),
  }),
});

builder.prismaObject("LedgerCategory", {
  fields: (t) => ({
    id: t.exposeID("id"),
    kind: t.exposeString("kind"),
    name: t.exposeString("name"),
    archived: t.exposeBoolean("archived"),
    createdAt: t.expose("createdAt", { type: "DateTime" }),
    updatedAt: t.expose("updatedAt", { type: "DateTime" }),
  }),
});

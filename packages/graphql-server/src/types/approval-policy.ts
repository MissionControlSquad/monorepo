import { builder } from "../builder";

// Rule-based approval policy (governance depth). `subject` (which agents/roles it applies to) and
// `condition` (JSON predicate, e.g. {costCentsOver:5000}) are JSON; `effect` is allow | require_approval
// | deny. GOVERNANCE-gated at the resolver edge; workspace-scoped.
builder.prismaObject("ApprovalPolicy", {
  fields: (t) => ({
    id: t.exposeID("id"),
    workspaceId: t.exposeString("workspaceId"),
    name: t.exposeString("name"),
    priority: t.exposeInt("priority"),
    action: t.exposeString("action"),
    effect: t.exposeString("effect"),
    enabled: t.exposeBoolean("enabled"),
    subject: t.expose("subject", { type: "JSON", nullable: true }),
    condition: t.expose("condition", { type: "JSON", nullable: true }),
    createdAt: t.expose("createdAt", { type: "DateTime" }),
    updatedAt: t.expose("updatedAt", { type: "DateTime" }),
  }),
});

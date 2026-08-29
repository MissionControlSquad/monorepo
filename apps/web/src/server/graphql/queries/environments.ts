import { builder } from "../builder";
import { requireFeature } from "../require-feature";
import { FLAG_KEYS } from "@agentcenter/utils";
import { requireRole } from "@/server/tenancy";
import { WORKSPACE_ROLES } from "@agentcenter/graphql-server";
import {
  listEnvironments,
  getEnvironment,
  getEnvironmentCapabilities,
  getEnvironmentDeleteBlastRadius,
} from "@/server/services/environments";
import { getWorkspaceExecutionPolicy } from "@/server/services/execution-policy";
import { listEnvironmentLeases } from "@/server/services/environment-leases";
import {
  listTemplates,
  classifyActiveTemplateDrift,
} from "@/server/services/environment-custom-images";

// Tier D / Phase 3: Environment reads. ENVIRONMENTS-gated, workspace-scoped, member+.
// `configPublic` is the MASKED config — secret-refs render as "secret:<name>", never plaintext.
export const EnvironmentType = builder.simpleObject("Environment", {
  fields: (t) => ({
    id: t.string(),
    workspaceId: t.string(),
    name: t.string(),
    description: t.string({ nullable: true }),
    driver: t.string(),
    status: t.string(),
    transport: t.string(),
    configPublic: t.field({ type: "JSON" }),
    envVars: t.field({ type: "JSON" }),
    metadata: t.field({ type: "JSON", nullable: true }),
    createdByProfileId: t.string({ nullable: true }),
    createdAt: t.field({ type: "DateTime" }),
    updatedAt: t.field({ type: "DateTime" }),
  }),
});

const EnvironmentProviderCap = builder.simpleObject("EnvironmentProviderCap", {
  fields: (t) => ({
    key: t.string(),
    displayName: t.string(),
    isolating: t.boolean(),
    credentialKeys: t.stringList(),
  }),
});
const EnvironmentCapabilitiesType = builder.simpleObject("EnvironmentCapabilities", {
  fields: (t) => ({
    drivers: t.stringList(),
    sandboxProviders: t.field({ type: [EnvironmentProviderCap] }),
  }),
});

const EnvironmentDeleteBlastRadiusType = builder.simpleObject("EnvironmentDeleteBlastRadius", {
  fields: (t) => ({
    deletable: t.boolean(),
    referencingAgentCount: t.int(),
    reasons: t.stringList(),
  }),
});

// Shared with the mutation layer (probe + policy).
export const EnvironmentProbeResultType = builder.simpleObject("EnvironmentProbeResult", {
  fields: (t) => ({
    ok: t.boolean(),
    driver: t.string(),
    summary: t.string(),
    details: t.string({ nullable: true }),
  }),
});

export const WorkspaceExecutionPolicyType = builder.simpleObject("WorkspaceExecutionPolicy", {
  fields: (t) => ({
    executionMode: t.string(),
    enableIsolatedWorkspaces: t.boolean(),
  }),
});

const EnvironmentLeaseType = builder.simpleObject("EnvironmentLease", {
  fields: (t) => ({
    id: t.string(),
    environmentId: t.string(),
    taskId: t.string({ nullable: true }),
    runId: t.string({ nullable: true }),
    status: t.string(),
    leasePolicy: t.string(),
    provider: t.string({ nullable: true }),
    providerLeaseId: t.string({ nullable: true }),
    cleanupStatus: t.string({ nullable: true }),
    acquiredAt: t.field({ type: "DateTime" }),
    lastUsedAt: t.field({ type: "DateTime" }),
    expiresAt: t.field({ type: "DateTime", nullable: true }),
    releasedAt: t.field({ type: "DateTime", nullable: true }),
  }),
});

builder.queryField("environments", (t) =>
  t.field({
    type: [EnvironmentType],
    resolve: async (_root, _args, ctx) => {
      await requireFeature(FLAG_KEYS.ENVIRONMENTS);
      const tenancy = requireRole(ctx, WORKSPACE_ROLES.MEMBER);
      return listEnvironments(tenancy.workspaceId);
    },
  }),
);

builder.queryField("environment", (t) =>
  t.field({
    type: EnvironmentType,
    args: { id: t.arg.string({ required: true }) },
    resolve: async (_root, args, ctx) => {
      await requireFeature(FLAG_KEYS.ENVIRONMENTS);
      const tenancy = requireRole(ctx, WORKSPACE_ROLES.MEMBER);
      return getEnvironment(tenancy.workspaceId, args.id);
    },
  }),
);

builder.queryField("environmentCapabilities", (t) =>
  t.field({
    type: EnvironmentCapabilitiesType,
    resolve: async (_root, _args, ctx) => {
      await requireFeature(FLAG_KEYS.ENVIRONMENTS);
      requireRole(ctx, WORKSPACE_ROLES.MEMBER);
      return getEnvironmentCapabilities();
    },
  }),
);

builder.queryField("environmentDeleteBlastRadius", (t) =>
  t.field({
    type: EnvironmentDeleteBlastRadiusType,
    args: { id: t.arg.string({ required: true }) },
    resolve: async (_root, args, ctx) => {
      await requireFeature(FLAG_KEYS.ENVIRONMENTS);
      const tenancy = requireRole(ctx, WORKSPACE_ROLES.MEMBER);
      return getEnvironmentDeleteBlastRadius(tenancy.workspaceId, args.id);
    },
  }),
);

const CustomImageTemplateType = builder.simpleObject("EnvironmentCustomImageTemplate", {
  fields: (t) => ({
    id: t.string(),
    environmentId: t.string(),
    provider: t.string(),
    templateKind: t.string(),
    templateRef: t.string(),
    status: t.string(),
    capturedAt: t.field({ type: "DateTime" }),
    lastUsedAt: t.field({ type: "DateTime", nullable: true }),
  }),
});
const CustomImageOverviewType = builder.simpleObject("EnvironmentCustomImageOverview", {
  fields: (t) => ({
    hasActive: t.boolean(),
    /** none | relinkable | breaking — how the env config drifted from the active image's capture config. */
    drift: t.string(),
    templates: t.field({ type: [CustomImageTemplateType] }),
  }),
});

builder.queryField("environmentCustomImages", (t) =>
  t.field({
    type: CustomImageOverviewType,
    args: { environmentId: t.arg.string({ required: true }) },
    resolve: async (_root, args, ctx) => {
      await requireFeature(FLAG_KEYS.CUSTOM_IMAGES);
      const tenancy = requireRole(ctx, WORKSPACE_ROLES.MEMBER);
      const [templates, drift] = await Promise.all([
        listTemplates(tenancy.workspaceId, args.environmentId),
        classifyActiveTemplateDrift(tenancy.workspaceId, args.environmentId),
      ]);
      return { hasActive: drift.hasActive, drift: drift.change, templates };
    },
  }),
);

builder.queryField("environmentLeases", (t) =>
  t.field({
    type: [EnvironmentLeaseType],
    args: { environmentId: t.arg.string() },
    resolve: async (_root, args, ctx) => {
      await requireFeature(FLAG_KEYS.ENVIRONMENTS);
      const tenancy = requireRole(ctx, WORKSPACE_ROLES.MEMBER);
      return listEnvironmentLeases(tenancy.workspaceId, args.environmentId);
    },
  }),
);

builder.queryField("workspaceExecutionPolicy", (t) =>
  t.field({
    type: WorkspaceExecutionPolicyType,
    resolve: async (_root, _args, ctx) => {
      await requireFeature(FLAG_KEYS.EXECUTION_POLICY);
      const tenancy = requireRole(ctx, WORKSPACE_ROLES.MEMBER);
      return getWorkspaceExecutionPolicy(tenancy.workspaceId);
    },
  }),
);

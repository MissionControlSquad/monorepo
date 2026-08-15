import { builder } from "../builder";
import { agentModel, activityModel } from "../../models";
import { hashApiKey } from "../../api-key";
import { Roles, SetupStatus, AgentStatus } from "../../constants";
import { applyAgentStatusUpdate } from "../../agent-status";
import { ensureAgentProfile } from "../../agent-profile";
import { pubsub, PubSubEvent } from "../../pubsub";
import { findProfileForAgentId } from "@agentcenter/database";
import { requireRole } from "@/server/tenancy";
import { WORKSPACE_ROLES } from "@agentcenter/graphql-server";

/**
 * Resolve an agent by apiKey argument.
 */
async function resolveByApiKey(apiKey: string | null | undefined) {
  if (!apiKey) throw new Error("apiKey is required");
  const hash = hashApiKey(apiKey);
  const agent = await agentModel.findOne({ where: { apiKeyHash: hash } });
  if (!agent) throw new Error("Invalid API key");
  return agent;
}

builder.mutationField("updateAgentStatus", (t) =>
  t.prismaField({
    type: "Agent",
    args: {
      id: t.arg.string({ required: true }),
      status: t.arg.string({ required: true }),
      detailedStatus: t.arg.string(),
      statusMessage: t.arg.string(),
      currentTaskId: t.arg.string(),
      currentTask: t.arg.string(),
    },
    resolve: async (query, _root, args, ctx) => {
      // Tenancy: scope the agent to the caller's workspace so one workspace can't mutate another's agent.
      const tenancy = requireRole(ctx, WORKSPACE_ROLES.MEMBER);
      const agent = await agentModel.delegate.findFirst({
        where: { id: args.id, workspaceId: tenancy.workspaceId },
      });
      if (!agent) throw new Error(`Agent not found: ${args.id}`);

      await agentModel.emitStatusChanged(agent, {
        toStatus: args.status as any,
        toDetailedStatus:
          args.status === AgentStatus.IDLE
            ? undefined
            : ((args.detailedStatus as any) ?? undefined),
        statusMessage: args.statusMessage ?? undefined,
        currentTaskId: args.currentTaskId ?? undefined,
        currentTask: args.currentTask ?? undefined,
      });

      return agentModel.delegate.findUniqueOrThrow({ ...query, where: { id: args.id } });
    },
  }),
);

builder.mutationField("wakeAgent", (t) =>
  t.prismaField({
    type: "Agent",
    args: {
      apiKey: t.arg.string({ required: true }),
      currentTaskId: t.arg.string(),
      currentTask: t.arg.string(),
      detailedStatus: t.arg.string(),
    },
    resolve: async (query, _root, args) => {
      const agent = await resolveByApiKey(args.apiKey);

      await agentModel.emitWokeUp(agent, {
        currentTaskId: args.currentTaskId ?? undefined,
        currentTask: args.currentTask ?? undefined,
        detailedStatus: args.detailedStatus ?? undefined,
      });

      return agentModel.delegate.findUniqueOrThrow({
        ...query,
        where: { id: agent.id },
      });
    },
  }),
);

builder.mutationField("sleepAgent", (t) =>
  t.prismaField({
    type: "Agent",
    args: {
      apiKey: t.arg.string({ required: true }),
    },
    resolve: async (query, _root, args) => {
      const agent = await resolveByApiKey(args.apiKey);

      await agentModel.emitWentToSleep(agent);

      return agentModel.delegate.findUniqueOrThrow({
        ...query,
        where: { id: agent.id },
      });
    },
  }),
);

builder.mutationField("agentHeartbeat", (t) =>
  t.prismaField({
    type: "Agent",
    args: {
      apiKey: t.arg.string({ required: true }),
      detailedStatus: t.arg.string(),
      statusMessage: t.arg.string(),
    },
    resolve: async (query, _root, args) => {
      const agent = await resolveByApiKey(args.apiKey);

      await applyAgentStatusUpdate(agent.id, {
        lastHeartbeat: new Date(),
        ...(args.detailedStatus != null && { detailedStatus: args.detailedStatus }),
        ...(args.statusMessage != null && { statusMessage: args.statusMessage }),
      });
      await ensureAgentProfile(agent.id);
      return agentModel.delegate.findUniqueOrThrow({ ...query, where: { id: agent.id } });
    },
  }),
);

builder.mutationField("updateAgentProfile", (t) =>
  t.prismaField({
    type: "Agent",
    args: {
      id: t.arg.string({ required: true }),
      name: t.arg.string(),
      role: t.arg.string(),
      personality: t.arg.string(),
      identityEmoji: t.arg.string(),
      llmModel: t.arg.string(),
    },
    resolve: async (query, _root, args, ctx) => {
      // Tenancy: require a workspace member and confirm the agent belongs to that workspace.
      const tenancy = requireRole(ctx, WORKSPACE_ROLES.MEMBER);
      const owned = await agentModel.delegate.findFirst({
        where: { id: args.id, workspaceId: tenancy.workspaceId },
        select: { id: true },
      });
      if (!owned) throw new Error(`Agent not found: ${args.id}`);

      const data: Record<string, unknown> = {};
      if (args.name !== undefined && args.name !== null) data.name = args.name;
      if (args.role !== undefined && args.role !== null) {
        // Prevent setting role to Squad Lead — only the system should assign this role
        if (args.role === Roles.SQUAD_LEAD) {
          const existing = await agentModel.delegate.findUnique({
            where: { id: args.id },
            select: { role: true },
          });
          if (existing?.role !== Roles.SQUAD_LEAD) {
            throw new Error("Cannot promote an agent to Squad Lead via profile update");
          }
        }
        data.role = args.role;
      }
      if (args.personality !== undefined) data.personality = args.personality ?? null;
      if (args.identityEmoji !== undefined) data.identityEmoji = args.identityEmoji ?? null;
      // Epic #2: per-agent LLM model override (empty string clears it → VM/adapter default).
      if (args.llmModel !== undefined) data.llmModel = args.llmModel ? args.llmModel : null;

      const updated = await agentModel.update(args.id, {
        ...query,
        data,
      });
      await ensureAgentProfile(args.id);
      return updated;
    },
  }),
);

builder.mutationField("setAgentActivation", (t) =>
  t.prismaField({
    type: "Agent",
    args: {
      id: t.arg.string({ required: true }),
      deactivated: t.arg.boolean({ required: true }),
    },
    resolve: async (query, _root, args, ctx) => {
      // Tenancy: activation/deactivation is workspace-scoped, admin-gated.
      const tenancy = requireRole(ctx, WORKSPACE_ROLES.ADMIN);
      const owned = await agentModel.delegate.findFirst({
        where: { id: args.id, workspaceId: tenancy.workspaceId },
        select: { id: true },
      });
      if (!owned) throw new Error(`Agent not found: ${args.id}`);
      if (args.deactivated) {
        const agent = await agentModel.delegate.findUnique({
          where: { id: args.id },
        });
        if (!agent) throw new Error(`Agent not found: ${args.id}`);

        if (agent.role === Roles.SQUAD_LEAD) {
          const activeLeadCount = await agentModel.count({
            where: {
              role: Roles.SQUAD_LEAD,
              setupStatus: { not: SetupStatus.DEACTIVATED },
              id: { not: args.id },
            },
          });
          if (activeLeadCount === 0) {
            throw new Error(
              "Cannot deactivate the last active Squad Lead. Create another lead first.",
            );
          }
        }

        await applyAgentStatusUpdate(args.id, {
          setupStatus: SetupStatus.DEACTIVATED,
          status: AgentStatus.IDLE,
          currentTask: null,
          currentTaskId: null,
          detailedStatus: null,
          statusMessage: null,
        });
        return agentModel.delegate.findUniqueOrThrow({ ...query, where: { id: args.id } });
      } else {
        await applyAgentStatusUpdate(args.id, { setupStatus: SetupStatus.ACTIVE });
        return agentModel.delegate.findUniqueOrThrow({ ...query, where: { id: args.id } });
      }
    },
  }),
);

builder.mutationField("syncAgentIdentity", (t) =>
  t.prismaField({
    type: "Agent",
    args: {
      apiKey: t.arg.string({ required: true }),
      name: t.arg.string({ required: true }),
      role: t.arg.string({ required: true }),
      avatar: t.arg.string(),
      personality: t.arg.string(),
      workspacePath: t.arg.string(),
      identityEmoji: t.arg.string(),
      level: t.arg.string(),
      username: t.arg.string(),
    },
    resolve: async (query, _root, args) => {
      const agent = await resolveByApiKey(args.apiKey);

      const updates = {
        name: args.name,
        avatar: args.avatar ?? undefined,
        personality: args.personality ?? undefined,
        workspacePath: args.workspacePath ?? undefined,
        identityEmoji: args.identityEmoji ?? undefined,
        username: args.username ?? undefined,
        lastHeartbeat: new Date(),
        ...(agent.setupStatus === SetupStatus.PENDING_SETUP && { setupStatus: SetupStatus.ACTIVE }),
      };

      await applyAgentStatusUpdate(agent.id, updates);
      await ensureAgentProfile(agent.id);

      if (agent.setupStatus === SetupStatus.PENDING_SETUP) {
        await agentModel.emitJoined({ id: agent.id, name: args.name });
      }

      return agentModel.delegate.findUniqueOrThrow({ ...query, where: { id: agent.id } });
    },
  }),
);

builder.mutationField("setAgentVacation", (t) =>
  t.prismaField({
    type: "Agent",
    args: {
      id: t.arg.string({ required: true }),
      onVacation: t.arg.boolean({ required: true }),
    },
    resolve: async (query, _root, args, ctx) => {
      requireRole(ctx, WORKSPACE_ROLES.MEMBER);
      const agent = await agentModel.delegate.findUnique({
        where: { id: args.id },
        select: { name: true, username: true },
      });
      if (!agent) throw new Error(`Agent not found: ${args.id}`);

      if (args.onVacation) {
        // Going on vacation: clear current task and set idle
        await applyAgentStatusUpdate(args.id, {
          isOnVacation: true,
          status: AgentStatus.IDLE,
          currentTask: null,
          currentTaskId: null,
          detailedStatus: null,
          statusMessage: null,
        });
      } else {
        await applyAgentStatusUpdate(args.id, {
          isOnVacation: false,
        });
      }

      pubsub.publish(PubSubEvent.AGENT.STATUS_CHANGED, { agentId: args.id });

      // Log activity
      const profileId = ctx.session?.profileId;
      const who = profileId
        ? ((await findProfileForAgentId(profileId))?.displayName ?? "Someone")
        : "Someone";
      const action = args.onVacation ? "put on vacation" : "returned from vacation";
      const activity = await activityModel.create({
        data: {
          type: "agent_status_changed",
          message: `${agent.name} ${action} by ${who}`,
          profileId: profileId ?? undefined,
          metadata: { vacation: args.onVacation },
        },
      });
      // No projectId — publish only to global topic
      pubsub.publish(PubSubEvent.ACTIVITY.CREATED, {
        activityId: activity.id,
        projectId: undefined,
      });

      return agentModel.delegate.findUniqueOrThrow({ ...query, where: { id: args.id } });
    },
  }),
);

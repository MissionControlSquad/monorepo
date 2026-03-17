import { builder } from "../builder";
import { agentModel, activityModel } from "../../models";
import { hashApiKey } from "../../api-key";
import { Roles } from "../../constants";
import { applyAgentStatusUpdate } from "../../agent-status";
import { ensureAgentProfile } from "../../agent-profile";
import { pubsub, PubSubEvent } from "../../pubsub";
import { prisma } from "../../prisma";
import { getVMSSHConfig, getAgentSlug, computeAgentCronIndex } from "../../services/cloud-vm-utils";
import { removeAgentCrons, ensureHeartbeatCron } from "../../services/cloud-vm-cron";
import { computeCronSchedule } from "../../agent-config-generator";

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
    resolve: async (query, _root, args) => {
      const agent = await agentModel.delegate.findUnique({
        where: { id: args.id },
      });
      if (!agent) throw new Error(`Agent not found: ${args.id}`);

      await agentModel.emitStatusChanged(agent, {
        toStatus: args.status as any,
        toDetailedStatus:
          args.status === "idle" ? undefined : ((args.detailedStatus as any) ?? undefined),
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
    },
    resolve: async (query, _root, args, ctx) => {
      // Require authenticated admin session for profile updates
      if (!ctx.session?.profileId) {
        throw new Error("Authentication required");
      }

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
    resolve: async (query, _root, args) => {
      if (args.deactivated) {
        const agent = await agentModel.delegate.findUnique({
          where: { id: args.id },
        });
        if (!agent) throw new Error(`Agent not found: ${args.id}`);

        if (agent.role === Roles.SQUAD_LEAD) {
          const activeLeadCount = await agentModel.count({
            where: {
              role: Roles.SQUAD_LEAD,
              setupStatus: { not: "deactivated" },
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
          setupStatus: "deactivated",
          status: "idle",
          currentTask: null,
          currentTaskId: null,
          detailedStatus: null,
          statusMessage: null,
        });
        return agentModel.delegate.findUniqueOrThrow({ ...query, where: { id: args.id } });
      } else {
        await applyAgentStatusUpdate(args.id, { setupStatus: "active" });
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
        ...(agent.setupStatus === "pending_setup" && { setupStatus: "active" as const }),
      };

      await applyAgentStatusUpdate(agent.id, updates);
      await ensureAgentProfile(agent.id);

      if (agent.setupStatus === "pending_setup") {
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
      const agent = await agentModel.delegate.findUnique({
        where: { id: args.id },
        select: { name: true, username: true, cloudVmId: true },
      });
      if (!agent) throw new Error(`Agent not found: ${args.id}`);

      if (args.onVacation) {
        // Going on vacation: clear current task and set idle
        await applyAgentStatusUpdate(args.id, {
          isOnVacation: true,
          status: "idle",
          currentTask: null,
          currentTaskId: null,
          detailedStatus: null,
          statusMessage: null,
        });

        // Remove heartbeat cron on cloud VMs (non-fatal)
        if (agent.cloudVmId) {
          try {
            const vm = await prisma.cloudVM.findUnique({
              where: { id: agent.cloudVmId },
              select: { ipv4: true, sshPrivateKey: true },
            });
            if (vm) {
              const sshConfig = getVMSSHConfig(vm);
              const agentSlug = getAgentSlug(agent);
              const removed = await removeAgentCrons(sshConfig, agentSlug);
              console.log(`[vacation] Removed ${removed} cron(s) for ${agentSlug}`);
            }
          } catch (err) {
            console.error(`[vacation] Failed to remove crons for agent ${args.id}:`, err);
          }
        }
      } else {
        await applyAgentStatusUpdate(args.id, {
          isOnVacation: false,
        });

        // Re-add heartbeat cron on cloud VMs (non-fatal)
        if (agent.cloudVmId) {
          try {
            const vm = await prisma.cloudVM.findUnique({
              where: { id: agent.cloudVmId },
              select: { ipv4: true, sshPrivateKey: true },
            });
            if (vm) {
              const sshConfig = getVMSSHConfig(vm);
              const agentSlug = getAgentSlug(agent);
              const cronIndex = await computeAgentCronIndex(agent.cloudVmId, agentSlug);
              const cronSchedule = computeCronSchedule(cronIndex);
              const result = await ensureHeartbeatCron(sshConfig, agentSlug, cronSchedule);
              console.log(`[vacation] Cron restore for ${agentSlug}: ${result.message}`);
            }
          } catch (err) {
            console.error(`[vacation] Failed to restore crons for agent ${args.id}:`, err);
          }
        }
      }

      pubsub.publish(PubSubEvent.AGENT.STATUS_CHANGED, { agentId: args.id });

      // Log activity
      const profileId = ctx.session?.profileId;
      const who = profileId
        ? ((
            await prisma.profile.findUnique({
              where: { id: profileId },
              select: { displayName: true },
            })
          )?.displayName ?? "Someone")
        : "Someone";
      const action = args.onVacation ? "put on vacation" : "returned from vacation";
      const cronNote = agent.cloudVmId
        ? args.onVacation
          ? " (cron removed)"
          : " (cron restored)"
        : "";
      const activity = await activityModel.create({
        data: {
          type: "agent_status_changed",
          message: `${agent.name} ${action} by ${who}${cronNote}`,
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

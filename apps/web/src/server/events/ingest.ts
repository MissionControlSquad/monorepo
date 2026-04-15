import { z } from "zod";
import { pubsub, PubSubEvent, agentActionAgentTopic, agentActionProjectTopic } from "../pubsub";
import { hashApiKey } from "../api-key";
import { agentModel, agentActionModel, taskModel } from "../models";
import { applyAgentStatusUpdate } from "../agent-status";
import { ensureAgentProfile } from "../agent-profile";
import { isSystemShutdown } from "../system-settings";
import { SetupStatus, AgentStatus, type AgentStatusValue } from "../constants";
import { trimAndCap, getAgentSlug } from "@agentcenter/utils";
import { logCloudVMEvent } from "@agentcenter/database";

const ACTION_TO_DETAILED_STATUS: Record<string, string> = {
  file_edited: "coding",
  code_written: "coding",
  command_executed: "coding",
  file_opened: "coding",
  research_done: "researching",
  thinking: "thinking",
  reviewing: "reviewing",
  deploying: "deploying",
  testing: "testing",
  writing_docs: "writing",
};

// ── Event payload schemas ────────────────────────────────

const baseEventSchema = z.object({
  type: z.string(),
});

const syncIdentitySchema = baseEventSchema.extend({
  type: z.literal("agent.sync_identity"),
  name: z.preprocess((v) => (v != null ? String(v) : v), z.string().min(1).optional()),
  role: z.string().optional(),
  username: z.string().optional(),
  avatar: z.string().optional(),
  personality: z.string().optional(),
  workspacePath: z.string().optional(),
  identityEmoji: z.string().optional(),
  level: z.preprocess((v) => (v != null ? String(v) : v), z.string().optional()),
  configVersion: z.preprocess((v) => (v != null ? String(v) : v), z.string().optional()),
});

const statusChangedSchema = baseEventSchema.extend({
  type: z.literal("agent.status_changed"),
  status: z.enum(Object.values(AgentStatus) as [AgentStatusValue, ...AgentStatusValue[]]),
  detailedStatus: z.string().nullish(),
  statusMessage: z.string().nullish(),
  currentTaskId: z.string().nullish(),
  currentTask: z.string().nullish(),
});

const wokeUpSchema = baseEventSchema.extend({
  type: z.literal("agent.woke_up"),
  currentTaskId: z.string().nullish(),
  currentTask: z.string().nullish(),
  detailedStatus: z.string().nullish(),
});

const wentToSleepSchema = baseEventSchema.extend({
  type: z.literal("agent.went_to_sleep"),
});

const heartbeatSchema = baseEventSchema.extend({
  type: z.literal("agent.heartbeat"),
  detailedStatus: z.string().nullish(),
  statusMessage: z.string().nullish(),
});

const actionLoggedSchema = baseEventSchema.extend({
  type: z.literal("agent.action_logged"),
  actionType: z.string().min(1),
  description: z.string().min(1),
  taskId: z.string().optional(),
  metadata: z.unknown().optional(),
});

/**
 * Resolve agent by API key (required).
 */
async function resolveEventAgent(apiKey: string) {
  const hash = hashApiKey(apiKey);
  const agent = await agentModel.findOne({
    where: { apiKeyHash: hash },
  });
  if (!agent) throw new Error("Invalid API key");
  return agent;
}

/**
 * Core event ingestion logic shared by GraphQL `ingestEvent` mutation
 * and REST `/api/events/ingest` endpoint.
 */
export async function processEvent(event: unknown, apiKey: string): Promise<unknown> {
  const base = baseEventSchema.safeParse(event);
  if (!base.success) {
    throw new Error("Invalid event: missing or invalid 'type' field");
  }

  const agent = await resolveEventAgent(apiKey);

  switch (base.data.type) {
    case "agent.sync_identity": {
      const parsed = syncIdentitySchema.safeParse(event);
      if (!parsed.success) {
        const details = parsed.error.issues
          .map(
            (i) =>
              `${i.path.join(".")}: ${i.message} (got ${JSON.stringify((event as Record<string, unknown>)[String(i.path[0])])})`,
          )
          .join("; ");
        console.warn(
          `[events/ingest] sync_identity validation failed: agentKey=***${String((event as Record<string, unknown>).apiKey ?? "").slice(-6)} ${details}`,
        );
        throw new Error(`Invalid agent.sync_identity payload: ${details}`);
      }
      const e = parsed.data;

      // Agents cannot self-assign role or level — those are admin-only fields.
      // Normalize and cap string lengths to avoid abuse/DoS
      const rawVersion =
        e.configVersion !== undefined && e.configVersion !== null ? String(e.configVersion) : null;
      const configVersion = rawVersion != null ? trimAndCap(rawVersion, 64, true) : null;

      const nameVal = trimAndCap(e.name, 500);
      const avatar = trimAndCap(e.avatar, 2048);
      const usernameVal = trimAndCap(e.username, 64);
      const personality = trimAndCap(e.personality, 5000);
      const workspacePath = trimAndCap(e.workspacePath, 500);
      const identityEmoji = trimAndCap(e.identityEmoji, 16);
      const resolvedName = nameVal && nameVal.length > 0 ? nameVal : agent.name;
      const updates = {
        name: resolvedName ?? agent.name,
        ...(avatar !== undefined && { avatar }),
        ...(usernameVal !== undefined && { username: usernameVal || null }),
        ...(personality !== undefined && { personality }),
        ...(workspacePath !== undefined && { workspacePath }),
        ...(identityEmoji !== undefined && { identityEmoji }),
        lastHeartbeat: new Date(),
        ...(configVersion !== null && { configVersion }),
        ...(agent.setupStatus === SetupStatus.PENDING_SETUP && { setupStatus: SetupStatus.ACTIVE }),
      };

      await applyAgentStatusUpdate(agent.id, updates);

      await ensureAgentProfile(agent.id);

      if (agent.setupStatus === SetupStatus.PENDING_SETUP) {
        await agentModel.emitJoined({ id: agent.id, name: resolvedName ?? agent.name });
      }

      // Log heartbeat to VM activity log so operators can see the agent is alive
      if (agent.cloudVmId) {
        logCloudVMEvent(
          agent.cloudVmId,
          `Agent "@${getAgentSlug(agent)}" checked in (heartbeat)`,
          "info",
        ).catch(() => undefined);
      }

      return { agentId: agent.id, created: false, systemShutdown: await isSystemShutdown() };
    }

    case "agent.status_changed": {
      const parsed = statusChangedSchema.safeParse(event);
      if (!parsed.success) {
        throw new Error(
          `Invalid agent.status_changed payload: ${parsed.error.issues.map((i) => i.message).join(", ")}`,
        );
      }
      const e = parsed.data;

      await agentModel.emitStatusChanged(agent, {
        toStatus: e.status as any,
        toDetailedStatus:
          e.status === AgentStatus.IDLE ? undefined : ((e.detailedStatus as any) ?? undefined),
        statusMessage: e.statusMessage ?? undefined,
        currentTaskId: e.currentTaskId ?? undefined,
        currentTask: e.currentTask ?? undefined,
      });

      if (agent.cloudVmId) {
        const detail = e.detailedStatus ? ` (${e.detailedStatus})` : "";
        const task = e.currentTaskId ? ` on task ${e.currentTaskId}` : "";
        logCloudVMEvent(
          agent.cloudVmId,
          `@${getAgentSlug(agent)} → ${e.status}${detail}${task}`,
          "info",
        ).catch(() => undefined);
      }

      return { agentId: agent.id };
    }

    case "agent.woke_up": {
      if (await isSystemShutdown()) {
        if (agent.cloudVmId) {
          logCloudVMEvent(
            agent.cloudVmId,
            `@${getAgentSlug(agent)} tried to wake up but system is in shutdown mode`,
            "warn",
          ).catch(() => undefined);
        }
        throw new Error(
          "System is in shutdown mode. Do not pick up any tasks. Reply HEARTBEAT_OK and stop.",
        );
      }
      if (agent.isOnVacation) {
        if (agent.cloudVmId) {
          logCloudVMEvent(
            agent.cloudVmId,
            `@${getAgentSlug(agent)} tried to wake up but is on vacation`,
            "warn",
          ).catch(() => undefined);
        }
        throw new Error(
          "You are on vacation. Do not pick up any tasks. Reply HEARTBEAT_OK and stop.",
        );
      }
      const parsed = wokeUpSchema.safeParse(event);
      if (!parsed.success) {
        throw new Error(
          `Invalid agent.woke_up payload: ${parsed.error.issues.map((i) => i.message).join(", ")}`,
        );
      }
      const e = parsed.data;

      await agentModel.emitWokeUp(agent, {
        currentTaskId: e.currentTaskId ?? undefined,
        currentTask: e.currentTask ?? undefined,
        detailedStatus: e.detailedStatus ?? undefined,
      });

      if (agent.cloudVmId) {
        const taskCtx = e.currentTaskId ? ` on task ${e.currentTaskId}` : "";
        logCloudVMEvent(agent.cloudVmId, `@${getAgentSlug(agent)} woke up${taskCtx}`, "info").catch(
          () => undefined,
        );
      }

      return { agentId: agent.id };
    }

    case "agent.went_to_sleep": {
      const parsed = wentToSleepSchema.safeParse(event);
      if (!parsed.success) {
        throw new Error(
          `Invalid agent.went_to_sleep payload: ${parsed.error.issues.map((i) => i.message).join(", ")}`,
        );
      }

      await agentModel.emitWentToSleep(agent);

      if (agent.cloudVmId) {
        logCloudVMEvent(agent.cloudVmId, `@${getAgentSlug(agent)} went to sleep`, "info").catch(
          () => undefined,
        );
      }

      return { agentId: agent.id };
    }

    case "agent.heartbeat": {
      const parsed = heartbeatSchema.safeParse(event);
      if (!parsed.success) {
        throw new Error(
          `Invalid agent.heartbeat payload: ${parsed.error.issues.map((i) => i.message).join(", ")}`,
        );
      }
      const e = parsed.data;

      await applyAgentStatusUpdate(agent.id, {
        lastHeartbeat: new Date(),
        ...(e.detailedStatus != null && { detailedStatus: e.detailedStatus }),
        ...(e.statusMessage != null && { statusMessage: e.statusMessage }),
      });

      if (agent.cloudVmId && e.detailedStatus) {
        logCloudVMEvent(
          agent.cloudVmId,
          `@${getAgentSlug(agent)} heartbeat [${e.detailedStatus}]`,
          "info",
        ).catch(() => undefined);
      }

      return { agentId: agent.id, systemShutdown: await isSystemShutdown() };
    }

    case "agent.action_logged": {
      const parsed = actionLoggedSchema.safeParse(event);
      if (!parsed.success) {
        throw new Error(
          `Invalid agent.action_logged payload: ${parsed.error.issues.map((i) => i.message).join(", ")}`,
        );
      }
      const e = parsed.data;

      let actionProjectId: string | undefined;
      if (e.taskId) {
        const task = await taskModel.findById(e.taskId, {
          select: { projectId: true },
        });
        actionProjectId = task?.projectId ?? undefined;
      }

      const action = await agentActionModel.create({
        data: {
          agentId: agent.id,
          taskId: e.taskId ?? undefined,
          projectId: actionProjectId,
          actionType: e.actionType as any,
          description: e.description,
          metadata: e.metadata ? (e.metadata as any) : undefined,
        },
      });

      const inferredStatus = ACTION_TO_DETAILED_STATUS[e.actionType];
      await applyAgentStatusUpdate(agent.id, {
        lastHeartbeat: new Date(),
        ...(inferredStatus && { detailedStatus: inferredStatus }),
      });

      if (agent.cloudVmId) {
        const taskCtx = e.taskId ? ` on task ${e.taskId}` : "";
        logCloudVMEvent(
          agent.cloudVmId,
          `@${getAgentSlug(agent)} ${e.actionType}${taskCtx}`,
          "info",
        ).catch(() => undefined);
      }

      const actionPayload = { agentId: agent.id, actionId: action.id, projectId: actionProjectId };
      pubsub.publish(agentActionAgentTopic(agent.id), actionPayload);
      if (actionProjectId) pubsub.publish(agentActionProjectTopic(actionProjectId), actionPayload);
      pubsub.publish(PubSubEvent.AGENT.ACTION_LOGGED, actionPayload);
      return { agentId: agent.id, actionId: action.id };
    }

    default:
      // Forward-compatible: unknown event types return 200 instead of 500
      if (agent.cloudVmId) {
        logCloudVMEvent(
          agent.cloudVmId,
          `@${getAgentSlug(agent)} sent unknown event type: "${base.data.type}"`,
          "warn",
        ).catch(() => undefined);
      }
      return { ignored: true, type: base.data.type };
  }
}

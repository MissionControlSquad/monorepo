import { builder } from "../builder";
import { taskModel, messageModel } from "../../models";
import {
  getAllProfilesForMentions,
  findProfilesAgentIds,
  findProfileDisplayAndAgentId,
} from "@agentcenter/database";
import { pubsub, messageTopic } from "../../pubsub";
import { parseMentionIds } from "@agentcenter/utils";
import { tryMentionAutoAssign } from "../../services/mention-auto-assign";

builder.mutationField("createMessage", (t) =>
  t.prismaField({
    type: "Message",
    args: {
      taskId: t.arg.string({ required: true }),
      fromProfileId: t.arg.string({ required: true }),
      content: t.arg.string({ required: true }),
      attachmentIds: t.arg.stringList(),
    },
    resolve: async (query, _root, args) => {
      // Parse @mentions from content — match profiles by @[id:xxx], @username, @displayName word
      const profiles = await getAllProfilesForMentions();

      const mentionedProfileIds: string[] = [];

      // 1. Structured @[id:xxx] mentions
      for (const id of parseMentionIds(args.content)) {
        if (id !== args.fromProfileId && !mentionedProfileIds.includes(id)) {
          const valid = profiles.some((p) => p.id === id);
          if (valid) mentionedProfileIds.push(id);
        }
      }

      // 2. @handle mentions (username / displayName word / @all)
      const mentionRegex = /@(\w+)/g;
      let match;
      while ((match = mentionRegex.exec(args.content)) !== null) {
        const word = match[1].toLowerCase();

        if (word === "all") {
          for (const p of profiles) {
            if (p.id !== args.fromProfileId && !mentionedProfileIds.includes(p.id)) {
              mentionedProfileIds.push(p.id);
            }
          }
          continue;
        }

        const byUsername = profiles.find((p) => p.username?.toLowerCase() === word);
        if (byUsername && byUsername.id !== args.fromProfileId) {
          if (!mentionedProfileIds.includes(byUsername.id)) {
            mentionedProfileIds.push(byUsername.id);
          }
          continue;
        }

        const byName = profiles.find((p) =>
          p.displayName
            .toLowerCase()
            .split(/\s+/)
            .some((w: string) => w === word),
        );
        if (byName && byName.id !== args.fromProfileId) {
          if (!mentionedProfileIds.includes(byName.id)) {
            mentionedProfileIds.push(byName.id);
          }
        }
      }

      const task = await taskModel.findById(args.taskId, {
        select: { title: true, taskNumber: true, projectId: true },
      });

      const message = await messageModel.create({
        ...query,
        data: {
          taskId: args.taskId,
          fromProfileId: args.fromProfileId,
          content: args.content,
          projectId: task?.projectId ?? undefined,
          attachments: {
            create: (args.attachmentIds ?? []).map((documentId) => ({
              documentId,
            })),
          },
          mentions: {
            create: mentionedProfileIds.map((profileId) => ({ profileId })),
          },
        },
      });

      // Resolve fromProfile display name for event
      const fromProfile = await findProfileDisplayAndAgentId(args.fromProfileId);

      // Resolve mentioned profileIds → agentIds for notification/subscription compat
      const mentionedProfiles = await findProfilesAgentIds(mentionedProfileIds);
      const mentionedAgentIds = mentionedProfiles
        .map((p) => p.agentId)
        .filter((id): id is string => id != null);

      // Auto-assign mentioned agents if sender is a Squad Lead.
      // Must run BEFORE emitCreated so the mention notification handler already
      // sees the correct assignment state when it checks it.
      const fromAgentId = fromProfile?.agentId;
      if (fromAgentId) {
        await tryMentionAutoAssign({ taskId: args.taskId, fromAgentId, mentionedAgentIds });
      }

      await messageModel.emitCreated(message, {
        taskNumber: task?.taskNumber,
        taskTitle: task?.title ?? "",
        fromAgentName: fromProfile?.displayName ?? "",
        fromProfileId: args.fromProfileId,
        fromAgentId: fromProfile?.agentId ?? undefined,
        mentionedAgentIds,
      });

      pubsub.publish(messageTopic(args.taskId), { taskId: args.taskId, messageId: message.id });
      return message;
    },
  }),
);

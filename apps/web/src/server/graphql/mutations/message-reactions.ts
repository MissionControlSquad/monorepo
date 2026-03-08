import { builder } from "../builder";
import { messageReactionModel, messageModel } from "../../models";
import { pubsub, messageReactionTopic } from "../../pubsub";

const VALID_EMOJIS = ["thumbs-up", "heart", "eyes", "checkmark", "party", "think"];

builder.mutationField("toggleMessageReaction", (t) =>
  t.prismaField({
    type: "Message",
    args: {
      messageId: t.arg.string({ required: true }),
      profileId: t.arg.string({ required: true }),
      emoji: t.arg.string({ required: true }),
    },
    resolve: async (query, _root, args) => {
      if (!VALID_EMOJIS.includes(args.emoji)) {
        throw new Error(`Invalid emoji: ${args.emoji}. Valid: ${VALID_EMOJIS.join(", ")}`);
      }

      const existing = await messageReactionModel.delegate.findUnique({
        where: {
          messageId_profileId_emoji: {
            messageId: args.messageId,
            profileId: args.profileId,
            emoji: args.emoji,
          },
        },
      });

      if (existing) {
        await messageReactionModel.deleteById(existing.id);
      } else {
        await messageReactionModel.create({
          data: {
            messageId: args.messageId,
            profileId: args.profileId,
            emoji: args.emoji,
          },
        });
      }

      const message = await messageModel.delegate.findUniqueOrThrow({
        ...query,
        where: { id: args.messageId },
      });

      pubsub.publish(messageReactionTopic(message.taskId), {
        taskId: message.taskId,
        messageId: message.id,
      });

      return message;
    },
  }),
);

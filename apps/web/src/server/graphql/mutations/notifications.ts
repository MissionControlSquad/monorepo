import { builder } from "../builder";
import { requireFeature } from "../require-feature";
import { FLAG_KEYS } from "../../../lib/feature-flag-keys";
import { notificationModel } from "../../models";

builder.mutationField("markNotificationDelivered", (t) =>
  t.prismaField({
    type: "Notification",
    args: { id: t.arg.string({ required: true }) },
    resolve: async (query, _root, args) => {
      await requireFeature(FLAG_KEYS.NOTIFICATIONS);
      return notificationModel.update(args.id, {
        ...query,
        data: { delivered: true, deliveredAt: new Date() },
      });
    },
  }),
);

builder.mutationField("markManyNotificationsDelivered", (t) =>
  t.field({
    type: "Int",
    args: { ids: t.arg.stringList({ required: true }) },
    resolve: async (_root, args) => {
      await requireFeature(FLAG_KEYS.NOTIFICATIONS);
      const result = await notificationModel.delegate.updateMany({
        where: { id: { in: args.ids } },
        data: { delivered: true, deliveredAt: new Date() },
      });
      return result.count;
    },
  }),
);

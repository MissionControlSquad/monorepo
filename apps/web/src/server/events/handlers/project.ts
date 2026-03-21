import { ProjectMemberStatus, findProfilesWithAgentIds } from "@agentcenter/database";
import { on } from "../bus";
import { invalidateMemberCaches } from "../../cache";
import { notificationModel, projectMemberModel } from "../../models";

on("project.member_added", async (e) => {
  if (e.type !== "project.member_added") return;

  invalidateMemberCaches(e.projectId, e.agentId);

  // Notify the added agent
  await notificationModel.create({
    data: {
      mentionedAgentId: e.agentId,
      content: `You were added to project "${e.projectName}"`,
    },
  });

  // Notify all OTHER active project members
  // ProjectMember now uses profileId — resolve to agentIds for notification
  const members = await projectMemberModel.findMany({
    where: {
      projectId: e.projectId,
      status: ProjectMemberStatus.active,
    },
    select: { profileId: true },
  });

  // Resolve profileIds → agentIds for notification
  const profiles = await findProfilesWithAgentIds(members.map((m) => m.profileId));

  const otherAgentIds = profiles.map((p) => p.agentId!).filter((id) => id !== e.agentId);

  const intro =
    `${e.agentEmoji ?? ""} @${e.agentUsername ?? e.agentName} (${e.agentRole ?? "agent"}, ${e.agentLevel ?? "member"}) joined project "${e.projectName}"`.trim();
  await Promise.all(
    otherAgentIds.map((agentId) =>
      notificationModel.create({
        data: { mentionedAgentId: agentId, content: intro },
      }),
    ),
  );
});

on("project.member_removed", async (e) => {
  if (e.type !== "project.member_removed") return;

  invalidateMemberCaches(e.projectId, e.agentId);

  // Notify the removed agent
  await notificationModel.create({
    data: {
      mentionedAgentId: e.agentId,
      content: `You were removed from project "${e.projectName}"`,
    },
  });

  // Notify all remaining active project members
  const members = await projectMemberModel.findMany({
    where: {
      projectId: e.projectId,
      status: ProjectMemberStatus.active,
    },
    select: { profileId: true },
  });

  // Resolve profileIds → agentIds for notification
  const profiles = await findProfilesWithAgentIds(members.map((m) => m.profileId));

  const otherAgentIds = profiles.map((p) => p.agentId!).filter((id) => id !== e.agentId);

  await Promise.all(
    otherAgentIds.map((agentId) =>
      notificationModel.create({
        data: {
          mentionedAgentId: agentId,
          content: `@${e.agentName} has left project "${e.projectName}". Do not assign new tasks to them.`,
        },
      }),
    ),
  );
});
